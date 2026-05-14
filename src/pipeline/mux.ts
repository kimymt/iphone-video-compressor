// Phase 3b: mediabunny の Output を薄くラップする mux 層。
// - Mp4OutputFormat + fastStart='in-memory' (iOS Photos が moov 先頭を要求)
// - EncodedVideoPacketSource('hevc' or 'avc') / EncodedAudioPacketSource('aac')
// - hvc1 box は mediabunny のデフォルト (isobmff-boxes.js で 'hevc'→'hvc1' マップ)
// - setMetadataTags を呼ばないことで EXIF / 位置情報の漏出を防ぐ (ハマりどころ 26)

import {
  Output,
  Mp4OutputFormat,
  StreamTarget,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  type VideoCodec,
  type AudioCodec,
  type StreamTargetChunk,
} from 'mediabunny';

export type MuxConfig = {
  /** mediabunny の VideoCodec 列挙値。Phase 3b は 'hevc' or 'avc' のみ。 */
  videoCodec: VideoCodec;
  /** null なら音声トラックなし (無音録画動画)。 */
  audioCodec: AudioCodec | null;
  /** 入力動画の平均フレームレート (HEVC level 判定とは別、mux 側に渡すヒント)。 */
  frameRate?: number;
};

export type MuxerHandle = {
  /** mediabunny の Output インスタンス (低層 API への逃げ道)。 */
  readonly output: Output;
  /** 動画パケットの sink。 add(packet, metadata) を呼んで一枚ずつ追加する。 */
  readonly videoSource: EncodedVideoPacketSource;
  /** 音声パケットの sink。audioCodec=null の場合は null。 */
  readonly audioSource: EncodedAudioPacketSource | null;
  /** finalize: 全パケット投入後、moov を出力 → close。 */
  finalize(): Promise<void>;
  /** cancel: 出力を破棄 (transcode 失敗時の救済)。 */
  cancel(): Promise<void>;
};

/**
 * OPFS の FileSystemWritableFileStream を mediabunny の StreamTarget に橋渡しする。
 *
 * StreamTargetChunk は `{ type: 'write', data, position }` の形で位置指定書き込みを行う。
 * `fastStart: 'in-memory'` 時は writes が monotonic (in order) であることが保証されるが、
 * 将来 fastStart を変えた時の互換性のため seek + write の両方を実装する。
 *
 * `getBytesWritten()` は出力済みの最大バイト位置を返す (= 最終ファイルサイズ)。
 */
export function createOpfsStreamTarget(writable: FileSystemWritableFileStream): {
  target: StreamTarget;
  getBytesWritten: () => number;
} {
  let bytesWritten = 0;
  const stream = new WritableStream<StreamTargetChunk>({
    async write(chunk) {
      const end = chunk.position + chunk.data.byteLength;
      if (end > bytesWritten) bytesWritten = end;
      await writable.seek(chunk.position);
      await writable.write(chunk.data);
    },
    async close() {
      await writable.close();
    },
    async abort() {
      try {
        await writable.close();
      } catch {
        /* abort 中の二次例外は握り潰す */
      }
    },
  });
  return {
    target: new StreamTarget(stream),
    getBytesWritten: () => bytesWritten,
  };
}

/**
 * MP4 (hvc1 / avc1) muxer を生成し、output.start() を済ませた状態の handle を返す。
 *
 * 仕様 (CLAUDE.md):
 * - Mp4OutputFormat + fastStart='in-memory' で moov 先頭
 * - EncodedVideoPacketSource はコーデック種別だけ指定 (HEVC レベルは packet metadata 経由)
 * - setMetadataTags は呼ばない → EXIF / 位置情報なし
 *
 * 呼び出し側の責任:
 * - 完了時に `handle.finalize()` を呼ぶ (もしくは失敗時 `handle.cancel()`)
 * - 音声トラックを使う場合は audioCodec を指定し、handle.audioSource に packet を渡す
 */
export async function createMuxer(
  target: StreamTarget,
  config: MuxConfig,
): Promise<MuxerHandle> {
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });

  const videoSource = new EncodedVideoPacketSource(config.videoCodec);
  const videoMetadata = config.frameRate !== undefined ? { frameRate: config.frameRate } : {};
  output.addVideoTrack(videoSource, videoMetadata);

  let audioSource: EncodedAudioPacketSource | null = null;
  if (config.audioCodec !== null) {
    audioSource = new EncodedAudioPacketSource(config.audioCodec);
    output.addAudioTrack(audioSource);
  }

  // setMetadataTags は意図的に呼ばない (EXIF / 位置情報破棄)。

  await output.start();

  return {
    output,
    videoSource,
    audioSource,
    finalize: async () => {
      await output.finalize();
    },
    cancel: async () => {
      try {
        await output.cancel();
      } catch {
        /* 既に finalize 済み等のエラーは握り潰す */
      }
    },
  };
}
