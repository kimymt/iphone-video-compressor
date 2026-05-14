// Phase 3b: mux.ts のユニットテスト。
// mediabunny を vi.mock で差し替えて、Mp4OutputFormat + fastStart='in-memory' の生成、
// 音声有無による addAudioTrack の分岐、setMetadataTags を呼ばないこと、
// StreamTarget の writable 連携 (seek+write+close) を verify する。

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const videoSourceInstance = { __kind: 'videoSource' };
  const audioSourceInstance = { __kind: 'audioSource' };
  const output = {
    addVideoTrack: vi.fn(),
    addAudioTrack: vi.fn(),
    setMetadataTags: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  const OutputCtor = vi.fn(() => output);
  const Mp4OutputFormatCtor = vi.fn(function (this: { __kind: string; opts: unknown }, opts: unknown) {
    this.__kind = 'Mp4OutputFormat';
    this.opts = opts;
  });
  const StreamTargetCtor = vi.fn(function (this: { __kind: string; stream: unknown }, stream: unknown) {
    this.__kind = 'StreamTarget';
    this.stream = stream;
  });
  const EncodedVideoPacketSourceCtor = vi.fn(function (
    this: { codec: string; __kind: string },
    codec: string,
  ) {
    Object.assign(this, videoSourceInstance, { codec, __kind: 'videoSource' });
  });
  const EncodedAudioPacketSourceCtor = vi.fn(function (
    this: { codec: string; __kind: string },
    codec: string,
  ) {
    Object.assign(this, audioSourceInstance, { codec, __kind: 'audioSource' });
  });
  return {
    output,
    OutputCtor,
    Mp4OutputFormatCtor,
    StreamTargetCtor,
    EncodedVideoPacketSourceCtor,
    EncodedAudioPacketSourceCtor,
  };
});

vi.mock('mediabunny', () => ({
  Output: mocks.OutputCtor,
  Mp4OutputFormat: mocks.Mp4OutputFormatCtor,
  StreamTarget: mocks.StreamTargetCtor,
  EncodedVideoPacketSource: mocks.EncodedVideoPacketSourceCtor,
  EncodedAudioPacketSource: mocks.EncodedAudioPacketSourceCtor,
}));

import { createMuxer, createOpfsStreamTarget } from './mux';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createMuxer', () => {
  // テスト用の最小 StreamTarget。createMuxer が target を内部で使うだけなので
  // 中身は不要。`new` で作って StreamTarget 型として扱う。
  function makeTarget(): import('mediabunny').StreamTarget {
    return new (mocks.StreamTargetCtor as unknown as new (
      s: unknown,
    ) => import('mediabunny').StreamTarget)({});
  }

  it('Mp4OutputFormat に fastStart=in-memory を指定', async () => {
    await createMuxer(makeTarget(), { videoCodec: 'hevc', audioCodec: 'aac' });
    expect(mocks.Mp4OutputFormatCtor).toHaveBeenCalledWith({ fastStart: 'in-memory' });
  });

  it('hevc + aac で video + audio 両トラック追加', async () => {
    const handle = await createMuxer(makeTarget(), {
      videoCodec: 'hevc',
      audioCodec: 'aac',
      frameRate: 30,
    });

    expect(mocks.EncodedVideoPacketSourceCtor).toHaveBeenCalledWith('hevc');
    expect(mocks.EncodedAudioPacketSourceCtor).toHaveBeenCalledWith('aac');
    expect(mocks.output.addVideoTrack).toHaveBeenCalledOnce();
    expect(mocks.output.addAudioTrack).toHaveBeenCalledOnce();
    expect(handle.videoSource).toBeDefined();
    expect(handle.audioSource).not.toBeNull();
  });

  it('audioCodec=null で audio トラック追加せず audioSource=null', async () => {
    const handle = await createMuxer(makeTarget(), {
      videoCodec: 'avc',
      audioCodec: null,
    });

    expect(mocks.EncodedAudioPacketSourceCtor).not.toHaveBeenCalled();
    expect(mocks.output.addAudioTrack).not.toHaveBeenCalled();
    expect(handle.audioSource).toBeNull();
  });

  it('setMetadataTags は呼ばない (EXIF / 位置情報破棄)', async () => {
    await createMuxer(makeTarget(), { videoCodec: 'hevc', audioCodec: 'aac' });
    expect(mocks.output.setMetadataTags).not.toHaveBeenCalled();
  });

  it('output.start() を await してから返す', async () => {
    let resolved = false;
    mocks.output.start.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 0));
      resolved = true;
    });
    await createMuxer(makeTarget(), { videoCodec: 'hevc', audioCodec: null });
    expect(resolved).toBe(true);
  });

  it('frameRate を addVideoTrack に渡す', async () => {
    await createMuxer(makeTarget(), { videoCodec: 'hevc', audioCodec: null, frameRate: 60 });
    expect(mocks.output.addVideoTrack).toHaveBeenCalledWith(expect.anything(), { frameRate: 60 });
  });

  it('frameRate を省略すると addVideoTrack metadata は空オブジェクト', async () => {
    await createMuxer(makeTarget(), { videoCodec: 'avc', audioCodec: null });
    expect(mocks.output.addVideoTrack).toHaveBeenCalledWith(expect.anything(), {});
  });

  it('finalize ハンドル経由で output.finalize 呼べる', async () => {
    const handle = await createMuxer(makeTarget(), { videoCodec: 'hevc', audioCodec: null });
    await handle.finalize();
    expect(mocks.output.finalize).toHaveBeenCalledOnce();
  });

  it('cancel ハンドル経由で output.cancel 呼べる、内部例外は握り潰す', async () => {
    mocks.output.cancel.mockRejectedValueOnce(new Error('already finalized'));
    const handle = await createMuxer(makeTarget(), { videoCodec: 'hevc', audioCodec: null });
    await expect(handle.cancel()).resolves.toBeUndefined();
    expect(mocks.output.cancel).toHaveBeenCalledOnce();
  });
});

describe('createOpfsStreamTarget', () => {
  // FileSystemWritableFileStream のモック
  function makeWritable() {
    return {
      seek: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('StreamTargetChunk を writable.seek + writable.write に変換', async () => {
    const writable = makeWritable();
    const { target } = createOpfsStreamTarget(
      writable as unknown as FileSystemWritableFileStream,
    );

    const data = new Uint8Array([1, 2, 3, 4]);
    // StreamTargetCtor は引数の WritableStream を保持しているので、
    // それを取り出して直接 write() を呼ぶ。
    const stream = (target as unknown as { stream: WritableStream }).stream;
    const writer = stream.getWriter();
    await writer.write({ type: 'write', data, position: 100 });
    await writer.close();

    expect(writable.seek).toHaveBeenCalledWith(100);
    expect(writable.write).toHaveBeenCalledWith(data);
    expect(writable.close).toHaveBeenCalledOnce();
  });

  it('getBytesWritten は最大 (position + length) を返す', async () => {
    const writable = makeWritable();
    const { target, getBytesWritten } = createOpfsStreamTarget(
      writable as unknown as FileSystemWritableFileStream,
    );

    const stream = (target as unknown as { stream: WritableStream }).stream;
    const writer = stream.getWriter();
    await writer.write({ type: 'write', data: new Uint8Array(50), position: 200 });
    await writer.write({ type: 'write', data: new Uint8Array(30), position: 0 });
    await writer.write({ type: 'write', data: new Uint8Array(20), position: 245 });

    // 最大 end = max(200+50, 0+30, 245+20) = max(250, 30, 265) = 265
    expect(getBytesWritten()).toBe(265);
    await writer.close();
  });

  it('abort 中に writable.close が失敗しても例外を投げない', async () => {
    const writable = makeWritable();
    writable.close.mockRejectedValue(new Error('already closed'));
    const { target } = createOpfsStreamTarget(
      writable as unknown as FileSystemWritableFileStream,
    );

    const stream = (target as unknown as { stream: WritableStream }).stream;
    const writer = stream.getWriter();
    await expect(writer.abort('test reason')).resolves.toBeUndefined();
  });
});
