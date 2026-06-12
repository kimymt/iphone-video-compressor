// Phase 3b: 動画 1 本の圧縮パイプライン本体。
//
// 入力 (File/Blob) → demux → VideoSampleSink で decode → (HDR→SDR) → (回転) →
// (リサイズ) → VideoEncoder で encode → mediabunny mux → 出力 (OPFS Writable)。
// 音声は VideoSampleSink と同じパターンで AudioSampleSink → AudioEncoder。
//
// 設計方針:
// - WebCodecs の VideoDecoder/AudioDecoder は mediabunny の Sample Sink に内包させる
//   (decode 段の VideoFrame ライフサイクル管理が複雑なため、mediabunny に任せる)
// - エンコード側は VideoEncoder/AudioEncoder を自前で持って細かい制御
//   (configure / backpressure / progress を transcode の責任にしたい)
// - キャンバスは用途ごとに別個に持つ (color / rotate / resize)
// - 全フレームで AbortSignal をチェック、cancel 時は in-flight frame を close

import {
  AudioSampleSink,
  EncodedPacket,
  EncodedPacketSink,
  VideoSampleSink,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';
import { isBt2020Primaries } from '../lib/color-space';
import { buildCodecString, MAX_INFLIGHT_FRAMES } from '../lib/presets';
import { applyRotation } from './rotate';
import { convertToBt709 } from './colorConvert';
import { createMuxer, createOpfsStreamTarget, type MuxerHandle } from './mux';
import { demuxInput, type DemuxResult } from './demux';
import { decideAudioPassthrough, type PassthroughDecision } from './audioPassthrough';
import type { Preset } from '../lib/types';

// ---- 型 ----

export type TranscodeOptions = {
  preset: Preset;
  /**
   * 進捗コールバック。`percent` は 0..100、`currentSec` は処理済み秒、
   * `totalSec` は入力動画の総秒数、`etaSec` は残り推定秒 (10 秒未満なら null)。
   * 200ms スロットルされる。
   */
  onProgress: (
    percent: number,
    currentSec: number,
    totalSec: number,
    etaSec: number | null,
  ) => void;
  /** AbortSignal。aborted=true で TranscodeCancelledError を投げる。 */
  signal: AbortSignal;
};

export type TranscodeResult = {
  outputSize: number;
  durationSec: number;
};

export class TranscodeError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TranscodeError';
  }
}

export class TranscodeCancelledError extends TranscodeError {
  constructor() {
    super('transcode cancelled');
    this.name = 'TranscodeCancelledError';
  }
}

// ---- 純粋ヘルパー (テストしやすい単位) ----

/**
 * 入力の coded dimensions + rotation から、出力の display dimensions を計算する。
 * preset.maxLongEdge を超える場合はアスペクト比を保ってスケールダウン。
 * yuv420p の chroma subsampling のため偶数に丸める。
 *
 * 例:
 * - rotation=0, 1920×1080, maxLongEdge=null   → 1920×1080
 * - rotation=90, 1920×1080, maxLongEdge=null  → 1080×1920 (回転で w/h スワップ)
 * - rotation=0, 3840×2160, maxLongEdge=1080   → 1080×608 (1080/3840=0.28125、2160*0.28125=608)
 * - rotation=90, 1920×1080, maxLongEdge=720   → 405→404×720 (偶数化で 404)
 */
export function computeOutputDimensions(
  meta: Pick<DemuxResult, 'width' | 'height' | 'rotation'>,
  preset: Pick<Preset, 'maxLongEdge'>,
): { width: number; height: number } {
  // 回転後の display dimensions
  const swapsWH = meta.rotation === 90 || meta.rotation === 270;
  const dispW = swapsWH ? meta.height : meta.width;
  const dispH = swapsWH ? meta.width : meta.height;

  if (preset.maxLongEdge === null) {
    return { width: ensureEven(dispW), height: ensureEven(dispH) };
  }

  const longEdge = Math.max(dispW, dispH);
  if (longEdge <= preset.maxLongEdge) {
    return { width: ensureEven(dispW), height: ensureEven(dispH) };
  }

  const scale = preset.maxLongEdge / longEdge;
  return {
    width: ensureEven(Math.round(dispW * scale)),
    height: ensureEven(Math.round(dispH * scale)),
  };
}

function ensureEven(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}

/**
 * keyframe (IDR) を強制する間隔 (microseconds)。2 秒 = 2_000_000us。
 *
 * CLAUDE.md ハマりどころ 33: WebKit (iOS Safari) の VideoEncoder は最初のフレームを
 * 自動 IDR にしないので、サムネイル抽出器がデコードできず真っ白になる。
 * 解決: 最初のフレーム + 2 秒ごとに `{ keyFrame: true }` を渡す。
 *
 * 副次効果: シーク性能向上 (Photos の scrub も滑らか)、AirDrop 先での
 * サムネ表示、Files アプリ / Finder の Quick Look も正常に。
 *
 * ビットレートコストは HEVC で 2-3% 程度、品質より優先。
 */
export const KEYFRAME_INTERVAL_US = 2_000_000;

/**
 * muxer への add() Promise を溜める上限。これを超えたら decode ループ内で
 * Promise.all で drain する。muxer (OPFS write) が encode より遅い場合に
 * ループへ backpressure を伝え、pending 配列の無制限成長 (長尺動画でチャンク数ぶん
 * の Promise 保持) を防ぐ。
 */
export const MUX_PENDING_DRAIN = 16;

/**
 * このフレームを keyframe (IDR) として encode すべきかを判定する純粋関数。
 *
 * - 最初のフレーム (frameIndex === 0) は必ず IDR
 * - 最後の IDR から KEYFRAME_INTERVAL_US 経過していれば IDR
 * - それ以外は IDR ではない (encoder が P/B を選ぶ)
 *
 * @param frameIndex 0-based。最初のフレームは 0。
 * @param currentTimestampUs 現フレームの timestamp (microseconds)。
 * @param lastKeyframeUs 最後に IDR を発した timestamp (microseconds)、初期値 -Infinity。
 * @param intervalUs IDR 間隔 (microseconds)、デフォルト KEYFRAME_INTERVAL_US。
 */
export function shouldForceKeyframe(
  frameIndex: number,
  currentTimestampUs: number,
  lastKeyframeUs: number,
  intervalUs: number = KEYFRAME_INTERVAL_US,
): boolean {
  if (frameIndex === 0) return true;
  return currentTimestampUs - lastKeyframeUs >= intervalUs;
}

/**
 * preset と出力 dimensions / fps から VideoEncoderConfig を作る。
 * colorSpace は明示的に BT.709 (CLAUDE.md ハマりどころ 23)。
 */
export function makeVideoEncoderConfig(
  preset: Preset,
  outputDims: { width: number; height: number },
  fps: number,
): VideoEncoderConfig {
  const longEdge = Math.max(outputDims.width, outputDims.height);
  return {
    codec: buildCodecString(preset, longEdge, Math.round(fps)),
    width: outputDims.width,
    height: outputDims.height,
    bitrate: preset.videoBitrate,
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'quality',
    bitrateMode: 'variable',
    // 出力は明示的に SDR BT.709 (HDR 入力でも colorConvert で SDR に焼いてから来る前提)
    // VideoColorSpaceInit は VideoEncoderConfig.colorSpace に渡せるが、TS 型に
    // 含まれない値もある (bt2020 等)。BT.709 系は標準値なのでそのまま指定可能。
    // 注: 一部の実装は bt709 transfer を 'bt709' / 'iec61966-2-1' どちらか好む。
    //     iOS Safari は 'bt709' を受理する (spike で確認済み)。
    // @ts-expect-error: VideoColorSpaceInit は TS 型に full な lib.dom 互換が無い
    colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709' },
  };
}

// ---- メイン: transcode ----

/**
 * 1 ファイルを圧縮する。失敗時は TranscodeError、cancel 時は TranscodeCancelledError。
 */
export async function transcode(
  inputFile: Blob,
  outputWritable: FileSystemWritableFileStream,
  opts: TranscodeOptions,
): Promise<TranscodeResult> {
  if (opts.signal.aborted) throw new TranscodeCancelledError();

  const dem = await demuxInput(inputFile);

  let muxer: MuxerHandle | null = null;
  try {
    const outputDims = computeOutputDimensions(dem, opts.preset);
    const videoCodec: VideoCodec = opts.preset.codec === 'hevc' ? 'hevc' : 'avc';
    const audioCodec: AudioCodec | null = dem.audioTrack ? 'aac' : null;

    // 入力の最小 start timestamp。一部のソース (ffmpeg edit list 付き MP4 など) は
    // 最初のフレームの PTS が負になる。mediabunny の Output は negative timestamp を
    // 拒否するため、video と audio で同じ量だけシフトして A/V sync を保つ。
    const inputStartSec = await dem.input.getFirstTimestamp();
    const sharedShiftSec = inputStartSec < 0 ? -inputStartSec : 0;

    const { target, getBytesWritten } = createOpfsStreamTarget(outputWritable);
    muxer = await createMuxer(target, {
      videoCodec,
      audioCodec,
      frameRate: Math.round(dem.fps),
    });

    // 進捗管理用の共有状態
    const progress: ProgressState = {
      startTimeMs: performance.now(),
      lastEmitMs: 0,
      processedFrames: 0,
      totalFrames: Math.max(1, Math.round(dem.durationSec * dem.fps)),
    };

    // V2.x (C1): 音声 pass-through 判定。条件を満たせば AudioDecoder/AudioEncoder を
    // 完全にスキップして EncodedPacket を muxer に直接渡す。
    // 失敗条件 (codec / sample rate / bitrate ほか) で fallback して通常の re-encode 経路へ。
    const audioPassDecision: PassthroughDecision =
      dem.audioTrack && muxer.audioSource
        ? await decideAudioPassthrough(dem, opts.preset)
        : { passthrough: false, reason: 'no audio track' };

    // 音声パイプラインを video と並行で走らせる (両方 await)
    const videoTask = runVideoPipeline(dem, outputDims, muxer, opts, progress, sharedShiftSec);
    const audioTask =
      dem.audioTrack && muxer.audioSource
        ? audioPassDecision.passthrough
          ? runAudioPassthrough(dem, muxer, opts, sharedShiftSec, audioPassDecision.decoderConfig)
          : runAudioPipeline(dem, muxer, opts, sharedShiftSec)
        : Promise.resolve();
    await Promise.all([videoTask, audioTask]);

    if (opts.signal.aborted) throw new TranscodeCancelledError();

    await muxer.finalize();

    return {
      outputSize: getBytesWritten(),
      durationSec: dem.durationSec,
    };
  } catch (e) {
    // 失敗時は output を cancel して OPFS の破損ファイルを残さない
    if (muxer) {
      try {
        await muxer.cancel();
      } catch {
        /* cancel 中の二次例外は握り潰す */
      }
    }
    if (e instanceof TranscodeError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new TranscodeCancelledError();
    throw new TranscodeError(
      'transcode 中に内部エラー: ' + (e instanceof Error ? e.message : String(e)),
      e,
    );
  } finally {
    dem.input.dispose();
  }
}

// ---- 内部: video pipeline ----

type ProgressState = {
  startTimeMs: number;
  lastEmitMs: number;
  processedFrames: number;
  totalFrames: number;
};

async function runVideoPipeline(
  dem: DemuxResult,
  outputDims: { width: number; height: number },
  muxer: MuxerHandle,
  opts: TranscodeOptions,
  progress: ProgressState,
  /** A/V 共通 shift (秒)。0 ならシフト無し。負の値は渡されない。 */
  sharedShiftSec: number,
): Promise<void> {
  const inflightCap = MAX_INFLIGHT_FRAMES[opts.preset.codec];
  const encoderConfig = makeVideoEncoderConfig(opts.preset, outputDims, dem.fps);
  const needsHdrConvert = isBt2020Primaries(dem.colorSpace);
  const needsRotate = dem.rotation !== 0;
  // 回転後の dimensions (rotate canvas 用)
  const rotW = dem.rotation === 90 || dem.rotation === 270 ? dem.height : dem.width;
  const rotH = dem.rotation === 90 || dem.rotation === 270 ? dem.width : dem.height;
  const needsResize = outputDims.width !== rotW || outputDims.height !== rotH;

  // 用途別 canvas (再利用)。HDR/rotate/resize それぞれサイズが違うので別個に作る。
  const colorCanvas = needsHdrConvert ? new OffscreenCanvas(dem.width, dem.height) : null;
  const colorCtx = colorCanvas?.getContext('2d', { colorSpace: 'srgb' }) ?? null;
  const rotateCanvas = needsRotate ? new OffscreenCanvas(rotW, rotH) : null;
  const rotateCtx = rotateCanvas?.getContext('2d', { colorSpace: 'srgb' }) ?? null;
  const resizeCanvas = needsResize
    ? new OffscreenCanvas(outputDims.width, outputDims.height)
    : null;
  const resizeCtx = resizeCanvas?.getContext('2d', { colorSpace: 'srgb' }) ?? null;

  // VideoEncoder: chunk を mediabunny に流す。
  // - 初回 metadata に decoderConfig が含まれる、mediabunny にそのまま渡せば OK
  // - エラーは捕捉して transcode 側で throw する
  //
  // muxer への add() は Promise を返す (writer backpressure 連動) が、output callback は
  // 同期なので直接 await できない。pendingAdds に溜め、エラーは muxError に捕捉して
  // 「未 await の rejection」を作らない (Worker の unhandledrejection に漏らさない)。
  // pendingAdds は decode ループ内で MUX_PENDING_DRAIN 個ごとに drain することで
  // (1) 配列の無制限成長を防ぎ (2) muxer/OPFS 側の backpressure をループに伝える。
  let encoderError: Error | null = null;
  let muxError: Error | null = null;
  const pendingAdds: Promise<void>[] = [];
  const trackAdd = (p: Promise<void>): void => {
    pendingAdds.push(
      p.catch((e) => {
        muxError ??= e instanceof Error ? e : new Error(String(e));
      }),
    );
  };
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      trackAdd(muxer.videoSource.add(packet, metadata));
    },
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(encoderConfig);

  // A/V 共通シフトを microseconds に変換。VideoFrame.timestamp は整数 microseconds。
  const timestampShiftUs = Math.round(sharedShiftSec * 1_000_000);

  // V2.x: keyframe (IDR) 制御。最初のフレーム + 2 秒ごとに IDR を強制。
  // WebKit が自動 IDR を入れないためサムネイル真っ白問題を回避する (ハマりどころ 33)。
  let frameIndex = 0;
  let lastKeyframeUs = Number.NEGATIVE_INFINITY;

  try {
    const sink = new VideoSampleSink(dem.videoTrack);
    for await (const sample of sink.samples()) {
      if (opts.signal.aborted) {
        sample[Symbol.dispose]();
        throw new TranscodeCancelledError();
      }
      if (encoderError) {
        sample[Symbol.dispose]();
        throw new TranscodeError('encoder error', encoderError);
      }
      if (muxError) {
        sample[Symbol.dispose]();
        throw new TranscodeError('mux write error', muxError);
      }

      // VideoSample → VideoFrame (rotation メタは VideoSample 側に残るが、ここでは
      // 生フレーム値を取り出して我々の rotate.ts で適用するので drawToContext は使わない)
      let frame = sample.toVideoFrame();
      sample[Symbol.dispose]();

      // negative timestamp を回避するためのシフト適用 (sharedShiftSec が事前計算済み)
      if (timestampShiftUs > 0) {
        // new VideoFrame(frame, init) は pixel data を共有 (コピー無し)。
        // 安価に timestamp だけ書き換えられる。
        const init: VideoFrameInit = { timestamp: frame.timestamp + timestampShiftUs };
        if (frame.duration !== null) init.duration = frame.duration;
        const shifted = new VideoFrame(frame, init);
        frame.close();
        frame = shifted;
      }

      // 1. HDR → SDR (BT.2020 → BT.709)
      if (needsHdrConvert && colorCtx) {
        frame = convertToBt709(frame, dem.colorSpace, colorCtx);
      }

      // 2. Rotation
      if (needsRotate && rotateCtx) {
        frame = applyRotation(frame, dem.rotation, rotateCtx);
      }

      // 3. Resize
      if (needsResize && resizeCtx) {
        resizeCtx.clearRect(0, 0, outputDims.width, outputDims.height);
        resizeCtx.drawImage(frame, 0, 0, outputDims.width, outputDims.height);
        const init: VideoFrameInit = { timestamp: frame.timestamp };
        if (frame.duration !== null) init.duration = frame.duration;
        const resized = new VideoFrame(resizeCanvas!, init);
        frame.close();
        frame = resized;
      }

      // 4. Backpressure: encodeQueueSize が上限を超えたら待機
      while (encoder.encodeQueueSize > inflightCap) {
        if (opts.signal.aborted) {
          frame.close();
          throw new TranscodeCancelledError();
        }
        if (encoderError) {
          frame.close();
          throw new TranscodeError('encoder error during backpressure', encoderError);
        }
        await new Promise((r) => setTimeout(r, 16));
      }

      // 5. Encode (timestamp は VFR でもそのまま渡す)
      //    keyframe 強制: 最初 + 2 秒間隔 (ハマりどころ 33)
      const forceKey = shouldForceKeyframe(frameIndex, frame.timestamp, lastKeyframeUs);
      encoder.encode(frame, forceKey ? { keyFrame: true } : undefined);
      if (forceKey) lastKeyframeUs = frame.timestamp;
      frameIndex++;
      frame.close();

      // 6. Mux backpressure: 溜まった add() を定期的に drain する
      //    (muxer / OPFS write が遅い場合にループを待たせる)
      if (pendingAdds.length >= MUX_PENDING_DRAIN) {
        await Promise.all(pendingAdds.splice(0));
        if (muxError) throw new TranscodeError('mux write error', muxError);
      }

      progress.processedFrames++;
      emitProgress(progress, dem, opts);
    }

    // 全フレーム投入完了。flush で残りを吐き出す。
    await encoder.flush();
    if (encoderError) throw new TranscodeError('encoder error during flush', encoderError);
  } finally {
    encoder.close();
  }

  // mediabunny への add は output callback で非同期に投入したので、ここで全て await
  await Promise.all(pendingAdds);
  if (muxError) throw new TranscodeError('mux write error', muxError);
}

// ---- 内部: audio pipeline ----

async function runAudioPipeline(
  dem: DemuxResult,
  muxer: MuxerHandle,
  opts: TranscodeOptions,
  /** A/V 共通 shift (秒)。0 ならシフト無し。 */
  sharedShiftSec: number,
): Promise<void> {
  if (!dem.audioTrack || !muxer.audioSource) return;

  const [sampleRate, channels] = await Promise.all([
    dem.audioTrack.getSampleRate(),
    dem.audioTrack.getNumberOfChannels(),
  ]);

  let encoderError: Error | null = null;
  let muxError: Error | null = null;
  const pendingAdds: Promise<void>[] = [];
  const audioSource = muxer.audioSource;
  const encoder = new AudioEncoder({
    output: (chunk, metadata) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      // video pipeline と同様、rejection を捕捉して unhandledrejection に漏らさない
      pendingAdds.push(
        audioSource.add(packet, metadata).catch((e) => {
          muxError ??= e instanceof Error ? e : new Error(String(e));
        }),
      );
    },
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure({
    codec: 'mp4a.40.2', // AAC-LC
    sampleRate,
    numberOfChannels: channels,
    bitrate: opts.preset.audioBitrate,
  });

  try {
    const sink = new AudioSampleSink(dem.audioTrack);
    for await (const sample of sink.samples()) {
      if (opts.signal.aborted) {
        sample[Symbol.dispose]();
        throw new TranscodeCancelledError();
      }
      if (encoderError) {
        sample[Symbol.dispose]();
        throw new TranscodeError('audio encoder error', encoderError);
      }
      if (muxError) {
        sample[Symbol.dispose]();
        throw new TranscodeError('audio mux write error', muxError);
      }
      // A/V 共通 shift を適用 (sample.setTimestamp は秒、in-place 書き換え)
      if (sharedShiftSec > 0) {
        sample.setTimestamp(sample.timestamp + sharedShiftSec);
      }
      const audioData = sample.toAudioData();
      sample[Symbol.dispose]();
      encoder.encode(audioData);
      audioData.close();

      // Mux backpressure (video pipeline と同じ drain)
      if (pendingAdds.length >= MUX_PENDING_DRAIN) {
        await Promise.all(pendingAdds.splice(0));
        if (muxError) throw new TranscodeError('audio mux write error', muxError);
      }
    }

    await encoder.flush();
    if (encoderError) {
      throw new TranscodeError('audio encoder error during flush', encoderError);
    }
  } finally {
    encoder.close();
  }

  await Promise.all(pendingAdds);
  if (muxError) throw new TranscodeError('audio mux write error', muxError);
}

// ---- 内部: audio pass-through (V2.x C1) ----

/**
 * 音声を decode/encode せず、入力 EncodedPacket を muxer に直接渡す。
 *
 * 採用条件は `audioPassthrough.ts` の `decideAudioPassthrough()` が事前判定済み。
 * この関数に来た時点で:
 * - dem.audioTrack は AAC-LC で sample rate / channels は AAC-LC 互換
 * - decoderConfig は valid (description 含む)
 * - 入力 bitrate ≤ preset target × 0.85
 *
 * AV 同期のロジック:
 * - sharedShiftSec は video pipeline と共通 (負の入力 timestamp を 0 始まりに揃える)
 * - EncodedPacket.timestamp は秒、`clone({ timestamp })` で新規 packet に shift 適用
 * - 入力の packet timestamp をそのまま使うため、再エンコードの量子化ドリフトなし。
 *   むしろ AudioEncoder.configure(sampleRate) 経由の 1024-sample 量子化を回避する分、
 *   再エンコード経路より同期精度が高い。
 *
 * 失敗時の挙動:
 * - mediabunny の add() が reject したら通常通り TranscodeError として bubble up
 * - cancel 受信時は in-flight packet を discard して TranscodeCancelledError
 */
async function runAudioPassthrough(
  dem: DemuxResult,
  muxer: MuxerHandle,
  opts: TranscodeOptions,
  /** A/V 共通 shift (秒)。0 ならシフト無し。負の値は事前計算で除外済 (上位で max(0, ...))。 */
  sharedShiftSec: number,
  decoderConfig: AudioDecoderConfig,
): Promise<void> {
  if (!dem.audioTrack || !muxer.audioSource) return;
  const audioSource = muxer.audioSource;

  // mediabunny の add() は内部で writer backpressure を制御する Promise を返す。
  // ここでは Promise.all で並列に投入せず、シーケンシャル await で順序保証する。
  // (EncodedAudioPacketSource は「decode order で add」の仕様で、AAC は B-frame
  //  ないので decode order = presentation order、シーケンシャルで問題なし。)

  // mediabunny の公開 API: `EncodedPacketSink` 経由で packets にアクセス。
  const sink = new EncodedPacketSink(dem.audioTrack);
  let packet: EncodedPacket | null = await sink.getFirstPacket();
  if (!packet) return; // 音声 packets が無い (実際には decideAudioPassthrough が弾くはず)

  // 初回 add のみ decoderConfig を metadata で渡す (mediabunny ESDS box 構築用)
  let isFirstAdd = true;

  while (packet) {
    if (opts.signal.aborted) throw new TranscodeCancelledError();

    // sharedShiftSec > 0 のときだけ clone() で timestamp 書き換え。
    // それ以外は元 packet をそのまま渡してアロケーション節約。
    const outPacket =
      sharedShiftSec > 0
        ? packet.clone({ timestamp: packet.timestamp + sharedShiftSec })
        : packet;

    const meta: EncodedAudioChunkMetadata | undefined = isFirstAdd
      ? { decoderConfig }
      : undefined;
    await audioSource.add(outPacket, meta);
    isFirstAdd = false;

    packet = await sink.getNextPacket(packet);
  }
}

// ---- 進捗エミット (200ms スロットル) ----

function emitProgress(
  progress: ProgressState,
  dem: DemuxResult,
  opts: TranscodeOptions,
): void {
  const now = performance.now();
  if (now - progress.lastEmitMs < 200) return;
  progress.lastEmitMs = now;

  const percent = Math.min(100, Math.round((progress.processedFrames / progress.totalFrames) * 100));
  const currentSec = progress.processedFrames / dem.fps;
  const elapsedSec = (now - progress.startTimeMs) / 1000;
  // ETA: 処理開始から 10 秒経過してから線形外挿
  const etaSec =
    elapsedSec >= 10 && progress.processedFrames > 0
      ? ((progress.totalFrames - progress.processedFrames) * elapsedSec) /
        progress.processedFrames
      : null;

  opts.onProgress(percent, currentSec, dem.durationSec, etaSec);
}
