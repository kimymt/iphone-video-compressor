// Phase 3a の demux.ts ユニットテスト。
// JSDOM 環境で WebCodecs / 実 MP4 のデコードはできないため、mediabunny を vi.mock
// で差し替える。実 fixture を使った統合テストは Phase 3b で transcode.test.ts に追加。

import { describe, it, expect, vi, beforeEach } from 'vitest';
// VideoColorSpaceInit は WebCodecs DOM 組み込み型

// vi.mock のファクトリはホイストされるため、参照する値も vi.hoisted で確保する。
const mocks = vi.hoisted(() => {
  const videoTrack = {
    getRotation: vi.fn(),
    getCodedWidth: vi.fn(),
    getCodedHeight: vi.fn(),
    getColorSpace: vi.fn(),
    computePacketStats: vi.fn(),
  };
  const audioTrack = { /* mediabunny の AudioTrack は demux.ts では呼び出さないので空 */ };
  const input = {
    canRead: vi.fn(),
    getPrimaryVideoTrack: vi.fn(),
    getPrimaryAudioTrack: vi.fn(),
    computeDuration: vi.fn(),
    dispose: vi.fn(),
  };
  const InputCtor = vi.fn(() => input);
  const BlobSourceCtor = vi.fn();
  return { videoTrack, audioTrack, input, InputCtor, BlobSourceCtor };
});

vi.mock('mediabunny', () => ({
  Input: mocks.InputCtor,
  BlobSource: mocks.BlobSourceCtor,
  ALL_FORMATS: [],
}));

import { demuxInput, DemuxError, isHdrColorSpace, effectiveLongEdge } from './demux';

// lib.dom.d.ts の VideoColorPrimaries / VideoTransferCharacteristics は
// 古くて 'bt2020' / 'hlg' / 'pq' を含まないため unknown 経由でキャスト。
const BT709 = {
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  fullRange: false,
} as unknown as VideoColorSpaceInit;

const BT2020_HLG = {
  primaries: 'bt2020',
  transfer: 'hlg',
  matrix: 'bt2020-ncl',
  fullRange: false,
} as unknown as VideoColorSpaceInit;

function configureHappyPath(opts?: {
  audio?: object | null;
  rotation?: 0 | 90 | 180 | 270;
  width?: number;
  height?: number;
  colorSpace?: VideoColorSpaceInit;
  durationSec?: number;
  fps?: number;
}): void {
  const o = opts ?? {};
  mocks.input.canRead.mockResolvedValue(true);
  mocks.input.getPrimaryVideoTrack.mockResolvedValue(mocks.videoTrack);
  mocks.input.getPrimaryAudioTrack.mockResolvedValue(o.audio === undefined ? mocks.audioTrack : o.audio);
  mocks.input.computeDuration.mockResolvedValue(o.durationSec ?? 5);
  mocks.videoTrack.getRotation.mockResolvedValue(o.rotation ?? 0);
  mocks.videoTrack.getCodedWidth.mockResolvedValue(o.width ?? 1920);
  mocks.videoTrack.getCodedHeight.mockResolvedValue(o.height ?? 1080);
  mocks.videoTrack.getColorSpace.mockResolvedValue(o.colorSpace ?? BT709);
  mocks.videoTrack.computePacketStats.mockResolvedValue({
    packetCount: 30,
    averagePacketRate: o.fps ?? 30,
    averageBitrate: 5_000_000,
    averagePacketSize: 20_000,
  });
}

describe('isHdrColorSpace', () => {
  it('primaries=bt2020 を HDR と判定 (HLG)', () => {
    expect(isHdrColorSpace(BT2020_HLG)).toBe(true);
  });

  it('primaries=bt2020 を HDR と判定 (PQ)', () => {
    const bt2020Pq = { ...BT2020_HLG, transfer: 'pq' } as unknown as VideoColorSpaceInit;
    expect(isHdrColorSpace(bt2020Pq)).toBe(true);
  });

  it('primaries=bt709 は SDR', () => {
    expect(isHdrColorSpace(BT709)).toBe(false);
  });

  it('primaries 未指定は SDR (パススルー)', () => {
    expect(isHdrColorSpace({})).toBe(false);
  });
});

describe('effectiveLongEdge', () => {
  it('横長 (1920×1080, rotation=0) は 1920', () => {
    expect(effectiveLongEdge({ width: 1920, height: 1080, rotation: 0 })).toBe(1920);
  });

  it('縦長メタ (1080×1920, rotation=0) は 1920', () => {
    expect(effectiveLongEdge({ width: 1080, height: 1920, rotation: 0 })).toBe(1920);
  });

  it('回転 90° でも max(w,h) は不変', () => {
    expect(effectiveLongEdge({ width: 1920, height: 1080, rotation: 90 })).toBe(1920);
  });

  it('正方形 (回転無関係)', () => {
    expect(effectiveLongEdge({ width: 1080, height: 1080, rotation: 0 })).toBe(1080);
  });
});

describe('demuxInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: 全フィールドを正しく返す', async () => {
    configureHappyPath({
      durationSec: 12.5,
      rotation: 90,
      width: 1920,
      height: 1080,
      colorSpace: BT709,
      fps: 30,
    });

    const result = await demuxInput(new Blob());
    expect(result.durationSec).toBe(12.5);
    expect(result.rotation).toBe(90);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.fps).toBe(30);
    expect(result.colorSpace).toEqual(BT709);
    expect(result.videoTrack).toBe(mocks.videoTrack);
    expect(result.audioTrack).toBe(mocks.audioTrack);
  });

  it('audioTrack=null (無音録画) を許容', async () => {
    configureHappyPath({ audio: null });
    const result = await demuxInput(new Blob());
    expect(result.audioTrack).toBeNull();
  });

  it('canRead=false なら DemuxError を投げ、Input を dispose', async () => {
    mocks.input.canRead.mockResolvedValue(false);
    await expect(demuxInput(new Blob())).rejects.toThrow(DemuxError);
    await expect(demuxInput(new Blob())).rejects.toThrow(/対応していない|壊れています/);
    expect(mocks.input.dispose).toHaveBeenCalled();
  });

  it('動画トラック無しなら DemuxError', async () => {
    mocks.input.canRead.mockResolvedValue(true);
    mocks.input.getPrimaryVideoTrack.mockResolvedValue(null);
    await expect(demuxInput(new Blob())).rejects.toThrow(DemuxError);
    await expect(demuxInput(new Blob())).rejects.toThrow(/動画トラック/);
    expect(mocks.input.dispose).toHaveBeenCalled();
  });

  it('mediabunny 内部例外を DemuxError でラップ + Input dispose', async () => {
    mocks.input.canRead.mockRejectedValue(new Error('mediabunny internal: invalid box at 0x...'));
    await expect(demuxInput(new Blob())).rejects.toThrow(DemuxError);
    await expect(demuxInput(new Blob())).rejects.toThrow(/demux 中に内部エラー/);
    expect(mocks.input.dispose).toHaveBeenCalled();
  });

  it('VFR/平均 fps が小数で返ってきても保持', async () => {
    configureHappyPath({ fps: 29.97 });
    const result = await demuxInput(new Blob());
    expect(result.fps).toBeCloseTo(29.97);
  });

  it('HDR (BT.2020 HLG) の colorSpace をそのまま渡す', async () => {
    configureHappyPath({ colorSpace: BT2020_HLG });
    const result = await demuxInput(new Blob());
    expect(result.colorSpace).toEqual(BT2020_HLG);
    expect(isHdrColorSpace(result.colorSpace)).toBe(true);
  });
});
