// V2: HEVC 並列ベンチマーク (CLAUDE.md ハマりどころ 17: VideoToolbox は単一ハードウェアエンコーダ)。
//
// 目的:
//   iPhone の VideoToolbox は HEVC エンコードを単一の HW リソースで処理するため、
//   2 並列 HEVC で投げると lock 競合で逆に遅くなるケースがある。本ベンチは
//   serial (1 encoder × N フレーム) と parallel (2 encoder × N フレーム同時) の
//   経過時間を比較し、parallel が serial の 1.3 倍以下のスループットしか
//   出ないなら slowdown=true と判定する。queueStore.effectiveParallelism()
//   が hevc プリセットの並列度を 1 に降格させる根拠データになる。
//
// アルゴリズム:
//   1. OffscreenCanvas で encode ループ内に 1 枚ずつフレーム合成 (グラデ + 移動矩形、
//      エンコーダが trivial 入力で過度に圧縮できないように 1 フレームごとに見た目を変える。
//      事前一括生成はしない: 720p RGBA × 60 枚 ≈ 220MB のメモリスパイクになるため)
//   2. encoder × 1 で serial 計測 → serialMs
//   3. encoder × 2 並列で計測 → parallelMs
//   4. speedup = (2 * serialMs) / parallelMs
//      - 完全並列 (両 HW 動作): speedup ≈ 2.0
//      - 直列相当 (HW 競合): speedup ≈ 1.0
//      - 競合で逆効果: speedup < 1.0
//   5. slowdown = speedup < threshold (default 1.3)
//
// なぜ 60 フレーム (default)?
//   720p HEVC を ~2 秒分。bench 全体で serial 2s + parallel 1〜2s = 3〜4s。
//   起動直後の background 実行に許容される時間。スループット計測としては十分。

import { buildHevcCodecString } from '../lib/presets';

/** ベンチ結果。 */
export interface HevcBenchResult {
  /** parallel が serial の何倍速だったかの実測値。
   *  - 2.0 → 完全並列 (両 HW エンコーダ動作)
   *  - 1.0 → 並列でも速度変わらず (HW リソース競合)
   *  - <1.0 → 並列の方が遅い (リソース競合 + overhead)
   */
  speedup: number;
  /** speedup < threshold のとき true。queueStore.effectiveParallelism() で
   *  HEVC プリセットの並列度を 1 に降格させる根拠。 */
  slowdown: boolean;
  /** serial 経過時間 (ms)。 */
  serialMs: number;
  /** parallel 経過時間 (ms)。 */
  parallelMs: number;
  /** 実行時刻 (Unix ms)。UI で「最終実行」表示と再実行判定 (古すぎたら自動再ベンチ) に使用。 */
  ranAt: number;
  /** ベンチに使用したフレーム数 (再現性のため記録)。 */
  frameCount: number;
  /** ベンチに使用した解像度 (再現性のため記録)。 */
  width: number;
  height: number;
}

export interface HevcBenchOptions {
  /** 描画フレーム数。default 60 (= 720p @ 30fps × 2 秒相当)。
   *  小さすぎると HW エンコーダの warmup overhead が比率を歪める。 */
  frameCount?: number;
  /** ベンチ用解像度 (px)。default 1280x720。1080p で計測したい場合に override。 */
  width?: number;
  height?: number;
  /** フレームレート。default 30。 */
  fps?: number;
  /** ベンチ用ビットレート (bps)。default 3 Mbps (standard-hevc 相当)。 */
  bitrate?: number;
  /** slowdown 判定の閾値。default 1.3 (1.3 倍以下の speedup なら slowdown 扱い)。 */
  slowdownThreshold?: number;
  /** AbortSignal で中断可能。中断時は encoder.close() してから throw する。 */
  signal?: AbortSignal;
  /** テスト用: VideoEncoder コンストラクタを差し替え。 */
  videoEncoderCtor?: typeof VideoEncoder;
  /** テスト用: OffscreenCanvas コンストラクタを差し替え。 */
  offscreenCanvasCtor?: typeof OffscreenCanvas;
  /** テスト用: VideoFrame コンストラクタを差し替え。 */
  videoFrameCtor?: typeof VideoFrame;
  /** テスト用: performance.now() を差し替え (経過時間を deterministic に)。 */
  now?: () => number;
}

export const DEFAULT_BENCH_FRAME_COUNT = 60;
export const DEFAULT_BENCH_WIDTH = 1280;
export const DEFAULT_BENCH_HEIGHT = 720;
export const DEFAULT_BENCH_FPS = 30;
export const DEFAULT_BENCH_BITRATE = 3_000_000;
export const DEFAULT_SLOWDOWN_THRESHOLD = 1.3;
/** HEVC エンコーダの encodeQueueSize 上限 (presets.MAX_INFLIGHT_FRAMES.hevc と揃える)。 */
const HEVC_INFLIGHT_LIMIT = 4;

/** 中断発火時の error。AbortError を強制したいので名前を揃える。 */
export class HevcBenchAbortError extends Error {
  constructor() {
    super('HEVC bench aborted');
    this.name = 'AbortError';
  }
}

function getCtor<T>(name: string, override: T | undefined): T {
  if (override !== undefined) return override;
  const found = (globalThis as Record<string, unknown>)[name];
  if (found === undefined) {
    throw new Error(`runHevcParallelismBench: ${name} unavailable in this environment`);
  }
  return found as T;
}

/** i 番目の bench フレームを合成して返すファクトリを作る。
 *
 *  旧実装は全フレームを事前生成して配列で保持していたが、720p RGBA は 1 枚 ~3.7MB で
 *  60 枚 ≈ 220MB (parallel 計測では 2 本ぶん ≈ 440MB) を同時確保することになり、
 *  起動時の自動 bench で iOS Safari のタブメモリ上限を圧迫していた。
 *  encode ループ内で 1 枚ずつ生成 → encode 直後に close することで、生存フレームを
 *  encodeQueueSize の backpressure 上限 (HEVC_INFLIGHT_LIMIT) 程度に抑える。
 *  canvas 描画 (fillRect 2 回) はサブ ms なので計測値への影響は無視できる。
 *
 *  返す VideoFrame は呼び出し側で .close() 必須。 */
function makeFrameFactory(
  width: number,
  height: number,
  count: number,
  fps: number,
  OffscreenCanvasCtor: typeof OffscreenCanvas,
  VideoFrameCtor: typeof VideoFrame,
): (i: number) => VideoFrame {
  const canvas = new OffscreenCanvasCtor(width, height);
  // bench だけで使うので alpha は不要、willReadFrequently も不要。
  const ctx = canvas.getContext('2d', { alpha: false }) as
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    throw new Error('runHevcParallelismBench: OffscreenCanvas 2d context unavailable');
  }
  const frameDurationUs = Math.round(1_000_000 / fps);
  return (i: number): VideoFrame => {
    // フレームごとに見た目を変える: hue 回転 + 横移動する白矩形。
    // 同一フレーム連続は encoder が極端に圧縮できて bench にならない。
    const hue = Math.round((i / Math.max(count, 1)) * 360);
    ctx.fillStyle = `hsl(${hue}, 70%, 40%)`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    const x = (i / Math.max(count, 1)) * (width - 100);
    ctx.fillRect(x, height / 2 - 50, 100, 100);
    return new VideoFrameCtor(canvas as unknown as CanvasImageSource, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });
  };
}

/** 1 つの encoder で frameCount 枚を順に生成 → encode し終わるまで待つ。
 *  - フレームは frameFactory で 1 枚ずつ遅延生成、encode 直後に close (メモリ上限対策)
 *  - 先頭フレームは keyframe 強制 (CLAUDE.md ハマりどころで thumbnail 真っ白問題)
 *  - encodeQueueSize > HEVC_INFLIGHT_LIMIT で backpressure
 *  - flush() で出力を全て吐かせてから close()
 */
async function encodeFramesOnce(
  frameCount: number,
  frameFactory: (i: number) => VideoFrame,
  config: VideoEncoderConfig,
  VideoEncoderCtor: typeof VideoEncoder,
  signal?: AbortSignal,
): Promise<void> {
  let encoderError: Error | null = null;
  const encoder = new VideoEncoderCtor({
    output: () => {
      // bench は chunk 内容を使わない (mux しない、計測のみ)。
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });
  encoder.configure(config);

  try {
    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) throw new HevcBenchAbortError();
      if (encoderError) throw encoderError;
      const frame = frameFactory(i);
      try {
        const opts = i === 0 ? { keyFrame: true } : undefined;
        encoder.encode(frame, opts);
      } finally {
        // encode() は内部でフレームを保持するので、呼び出し側コピーは即 close してよい
        frame.close();
      }
      // backpressure: HEVC は presets.MAX_INFLIGHT_FRAMES.hevc=4 と揃える
      while (encoder.encodeQueueSize > HEVC_INFLIGHT_LIMIT) {
        if (signal?.aborted) throw new HevcBenchAbortError();
        await new Promise((r) => setTimeout(r, 8));
      }
    }
    if (signal?.aborted) throw new HevcBenchAbortError();
    await encoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    try {
      encoder.close();
    } catch {
      // 既に close 済みの場合に throw されるが無視 (idempotent close)。
    }
  }
}

/** Phase 4 で記述されていた「60 秒の動画 1 本を 2 並列 vs 1 並列で計測」の実装 (V2)。
 *
 *  CLAUDE.md の元仕様では「2 並列のスループットが 1.3 倍以下なら hevcBenchSlowdown=true」
 *  と書かれていた。本実装ではそれを synthetic frame で実現する (実動画ファイルを bundle
 *  したり、ユーザ動画の初回投入をブロックしたりせずに済むため)。
 *
 *  bench 全体の所要時間は frameCount に比例:
 *    - 60 frames @ 720p: 約 3〜4 秒 (default)
 *    - 30 frames @ 720p: 約 1〜2 秒 (CI / 軽量モード)
 *
 *  失敗ケース:
 *    - VideoEncoder / OffscreenCanvas 不在 → Error throw (capability check 通過前に呼ばないこと)
 *    - signal abort → HevcBenchAbortError throw
 *    - encoder error → encoder からの error コールバックを throw
 */
export async function runHevcParallelismBench(
  options: HevcBenchOptions = {},
): Promise<HevcBenchResult> {
  const frameCount = options.frameCount ?? DEFAULT_BENCH_FRAME_COUNT;
  const width = options.width ?? DEFAULT_BENCH_WIDTH;
  const height = options.height ?? DEFAULT_BENCH_HEIGHT;
  const fps = options.fps ?? DEFAULT_BENCH_FPS;
  const bitrate = options.bitrate ?? DEFAULT_BENCH_BITRATE;
  const threshold = options.slowdownThreshold ?? DEFAULT_SLOWDOWN_THRESHOLD;
  const signal = options.signal;

  const VideoEncoderCtor = getCtor<typeof VideoEncoder>(
    'VideoEncoder',
    options.videoEncoderCtor,
  );
  const OffscreenCanvasCtor = getCtor<typeof OffscreenCanvas>(
    'OffscreenCanvas',
    options.offscreenCanvasCtor,
  );
  const VideoFrameCtor = getCtor<typeof VideoFrame>('VideoFrame', options.videoFrameCtor);
  const now = options.now ?? (() => performance.now());

  if (signal?.aborted) throw new HevcBenchAbortError();

  const longEdge = Math.max(width, height);
  const config: VideoEncoderConfig = {
    codec: buildHevcCodecString(longEdge, fps),
    width,
    height,
    bitrate,
    framerate: fps,
    bitrateMode: 'variable',
    latencyMode: 'quality',
  };

  // ---- Serial run: encoder × 1 × N フレーム (フレームは遅延生成) ----
  const serialFactory = makeFrameFactory(
    width,
    height,
    frameCount,
    fps,
    OffscreenCanvasCtor,
    VideoFrameCtor,
  );
  const t0Serial = now();
  await encodeFramesOnce(frameCount, serialFactory, config, VideoEncoderCtor, signal);
  const serialMs = now() - t0Serial;

  if (signal?.aborted) throw new HevcBenchAbortError();

  // ---- Parallel run: encoder × 2 同時 × N フレーム/each ----
  // 各 encoder に独立した factory (= 独立した canvas) を渡す。同じ VideoFrame は
  // 2 つの encoder に渡せないし、canvas を共有すると 2 ループの interleave で
  // 描画内容が混ざるため、canvas ごと分離する。
  const parallelFactoryA = makeFrameFactory(
    width,
    height,
    frameCount,
    fps,
    OffscreenCanvasCtor,
    VideoFrameCtor,
  );
  const parallelFactoryB = makeFrameFactory(
    width,
    height,
    frameCount,
    fps,
    OffscreenCanvasCtor,
    VideoFrameCtor,
  );
  const t0Parallel = now();
  await Promise.all([
    encodeFramesOnce(frameCount, parallelFactoryA, config, VideoEncoderCtor, signal),
    encodeFramesOnce(frameCount, parallelFactoryB, config, VideoEncoderCtor, signal),
  ]);
  const parallelMs = now() - t0Parallel;

  // 0 除算ガード (now() が同じ値を返した = jsdom mock の suspicious case)
  const speedup = parallelMs > 0 ? (2 * serialMs) / parallelMs : 0;
  const slowdown = speedup < threshold;

  return {
    speedup,
    slowdown,
    serialMs,
    parallelMs,
    ranAt: Date.now(),
    frameCount,
    width,
    height,
  };
}
