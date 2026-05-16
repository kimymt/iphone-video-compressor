// V2: HEVC 並列ベンチマークのユニットテスト。
// jsdom には VideoEncoder / OffscreenCanvas / VideoFrame が無いので、ctor injection 経由で
// 全部 mock する (hevcBench.ts の videoEncoderCtor / offscreenCanvasCtor / videoFrameCtor /
// now で差し替え可能)。
//
// 検証する主要不変量:
//  - speedup = (2 * serialMs) / parallelMs の数式
//  - slowdown = speedup < threshold の境界
//  - serial → parallel の順で encoder が 1 → 2 回ずつ生成されること
//  - keyFrame: true が先頭フレームに渡されること
//  - signal.abort で HevcBenchAbortError throw
//  - VideoEncoder 不在で Error throw (capability check 通過前に呼んだケース)
//  - VideoFrame が全部 close される (memory leak 防止)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runHevcParallelismBench,
  HevcBenchAbortError,
  DEFAULT_SLOWDOWN_THRESHOLD,
  DEFAULT_BENCH_FRAME_COUNT,
  DEFAULT_BENCH_WIDTH,
  DEFAULT_BENCH_HEIGHT,
} from './hevcBench';

// ---- Mock factory ----

interface MockEncoderInit {
  output: (chunk: unknown) => void;
  error: (err: Error) => void;
}

interface MockEncoderInstance {
  configure: ReturnType<typeof vi.fn>;
  encode: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  encodeQueueSize: number;
  _id: number;
}

/** ctor 呼び出しごとに新しい mock encoder を返す。
 *  flushDurationMs: flush() の resolve までの fake-時間。serial vs parallel の
 *  経過を制御するために使う。 */
function makeMockVideoEncoderCtor(flushDurationMs: number) {
  let nextId = 0;
  const instances: MockEncoderInstance[] = [];
  const ctor = vi.fn(function (this: MockEncoderInstance, _init: MockEncoderInit) {
    const id = nextId++;
    Object.assign(this, {
      configure: vi.fn(),
      encode: vi.fn(),
      // flush() を await すると flushDurationMs だけ now() が進むよう、テスト側の
      // now mock と組み合わせて使う。ここでは即 resolve、時刻進行は now() mock で行う。
      flush: vi.fn(() => Promise.resolve()),
      close: vi.fn(),
      encodeQueueSize: 0,
      _id: id,
    } as MockEncoderInstance);
    instances.push(this);
  }) as unknown as typeof VideoEncoder;
  // 静的 isConfigSupported は本テストでは呼ばないが、念のため stub。
  (ctor as unknown as { isConfigSupported: ReturnType<typeof vi.fn> }).isConfigSupported =
    vi.fn(async () => ({ supported: true }));
  return { ctor, instances, flushDurationMs };
}

/** OffscreenCanvas mock: getContext('2d') が drawing API を返すだけ。 */
const mockOffscreenCanvasCtor = vi.fn(function (this: unknown, _w: number, _h: number) {
  Object.assign(this as Record<string, unknown>, {
    getContext: vi.fn(() => ({
      fillStyle: '',
      fillRect: vi.fn(),
    })),
  });
}) as unknown as typeof OffscreenCanvas;

/** VideoFrame mock: timestamp + close() のみ。 */
function makeMockVideoFrameCtor() {
  const closed: { count: number } = { count: 0 };
  const ctor = vi.fn(function (
    this: unknown,
    _source: unknown,
    init: { timestamp: number; duration?: number },
  ) {
    Object.assign(this as Record<string, unknown>, {
      timestamp: init.timestamp,
      duration: init.duration ?? null,
      close: vi.fn(() => {
        closed.count++;
      }),
    });
  }) as unknown as typeof VideoFrame;
  return { ctor, closed };
}

/** `now()` mock: serial 全体で `serialMs` 進み、parallel 全体で `parallelMs` 進む。
 *  encoder.flush() を resolve したタイミングで進める単純実装。
 *  実装: 呼び出し履歴を順に [t0_serial, t1_serial, t0_parallel, t1_parallel] と返す。
 *  以降の呼び出しは末尾値を返す (now mock の oversaturation 対策)。 */
function makeStepNow(serialMs: number, parallelMs: number): () => number {
  const sequence: number[] = [0, serialMs, serialMs, serialMs + parallelMs];
  const last = sequence[sequence.length - 1] ?? 0;
  let i = 0;
  return (): number => {
    const v = i < sequence.length ? (sequence[i] ?? last) : last;
    i++;
    return v;
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ---- 数式: speedup = (2 * serialMs) / parallelMs ----

describe('runHevcParallelismBench: speedup 計算', () => {
  it('parallelMs が serialMs と同じ場合 speedup=2.0 (理想)', async () => {
    // serial=100ms, parallel=100ms → speedup = (2*100)/100 = 2.0
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const r = await runHevcParallelismBench({
      frameCount: 3,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 100),
    });
    expect(r.speedup).toBeCloseTo(2.0, 5);
    expect(r.slowdown).toBe(false);
    expect(r.serialMs).toBe(100);
    expect(r.parallelMs).toBe(100);
  });

  it('parallelMs が serialMs の 2 倍 → speedup=1.0 (並列で速度変わらず)', async () => {
    // serial=100ms, parallel=200ms → speedup = (2*100)/200 = 1.0
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const r = await runHevcParallelismBench({
      frameCount: 3,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 200),
    });
    expect(r.speedup).toBeCloseTo(1.0, 5);
    expect(r.slowdown).toBe(true); // < 1.3 threshold
  });

  it('parallelMs > 2*serialMs → speedup < 1.0 (リソース競合で逆効果)', async () => {
    // serial=100, parallel=300 → speedup = (2*100)/300 ≈ 0.667
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const r = await runHevcParallelismBench({
      frameCount: 3,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 300),
    });
    expect(r.speedup).toBeLessThan(1.0);
    expect(r.slowdown).toBe(true);
  });

  it('parallelMs=0 のとき speedup=0 (now() mock の同値返却を防御)', async () => {
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const r = await runHevcParallelismBench({
      frameCount: 3,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 0),
    });
    expect(r.speedup).toBe(0);
    expect(r.slowdown).toBe(true);
  });
});

// ---- 境界: slowdown threshold ----

describe('runHevcParallelismBench: slowdown 境界', () => {
  it('speedup = threshold (1.3) ちょうど → slowdown=false (< のみ)', async () => {
    // speedup=1.3 になるよう、parallelMs = 2*serialMs/1.3
    // serialMs=130 → parallelMs=200 → speedup=(2*130)/200=1.3
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const r = await runHevcParallelismBench({
      frameCount: 2,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(130, 200),
    });
    expect(r.speedup).toBeCloseTo(1.3, 5);
    expect(r.slowdown).toBe(false);
  });

  it('speedup = 1.29 (threshold 未満) → slowdown=true', async () => {
    // parallelMs = 2*serialMs/1.29 を厳密に作るのは難しいので大雑把に
    // serialMs=129, parallelMs=200 → speedup ≈ 1.29
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const r = await runHevcParallelismBench({
      frameCount: 2,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(129, 200),
    });
    expect(r.speedup).toBeLessThan(DEFAULT_SLOWDOWN_THRESHOLD);
    expect(r.slowdown).toBe(true);
  });

  it('カスタム threshold を尊重 (1.5 指定で speedup=1.4 なら slowdown=true)', async () => {
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const r = await runHevcParallelismBench({
      frameCount: 2,
      slowdownThreshold: 1.5,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      // speedup = (2*140)/200 = 1.4
      now: makeStepNow(140, 200),
    });
    expect(r.speedup).toBeCloseTo(1.4, 5);
    expect(r.slowdown).toBe(true); // 1.4 < 1.5
  });
});

// ---- encoder 生成回数 + keyframe 強制 ----

describe('runHevcParallelismBench: encoder lifecycle', () => {
  it('serial=1 encoder + parallel=2 encoder で合計 3 つ生成', async () => {
    const { ctor, instances } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    await runHevcParallelismBench({
      frameCount: 2,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 100),
    });
    expect(instances.length).toBe(3);
    // 各 encoder で configure() / flush() / close() が呼ばれる
    for (const enc of instances) {
      expect(enc.configure).toHaveBeenCalledTimes(1);
      expect(enc.flush).toHaveBeenCalledTimes(1);
      expect(enc.close).toHaveBeenCalledTimes(1);
    }
  });

  it('各 encoder で encode() が frameCount 回呼ばれる', async () => {
    const { ctor, instances } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const FRAME_COUNT = 5;
    await runHevcParallelismBench({
      frameCount: FRAME_COUNT,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 100),
    });
    for (const enc of instances) {
      expect(enc.encode).toHaveBeenCalledTimes(FRAME_COUNT);
    }
  });

  it('先頭フレームに { keyFrame: true } が渡される (ハマりどころ 33 対策)', async () => {
    const { ctor, instances } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    await runHevcParallelismBench({
      frameCount: 3,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 100),
    });
    // 全 encoder で 1 回目のみ keyFrame=true、以降は undefined
    for (const enc of instances) {
      const calls = enc.encode.mock.calls;
      const firstCall = calls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall![1]).toEqual({ keyFrame: true });
      // 2 回目以降は options なし (undefined)
      for (let i = 1; i < calls.length; i++) {
        const c = calls[i];
        expect(c).toBeDefined();
        expect(c![1]).toBeUndefined();
      }
    }
  });

  it('全 VideoFrame が close される (serial N + parallel 2N、N=frameCount)', async () => {
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor, closed } = makeMockVideoFrameCtor();
    const FRAME_COUNT = 4;
    await runHevcParallelismBench({
      frameCount: FRAME_COUNT,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 100),
    });
    // serial で N、parallel で 2N → 合計 3N
    expect(closed.count).toBe(FRAME_COUNT * 3);
  });

  it('VideoEncoderConfig: codec が解像度依存の HEVC 文字列 (720p → L93)', async () => {
    const { ctor, instances } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    await runHevcParallelismBench({
      frameCount: 2,
      // default width=1280 height=720 → longEdge=1280 → L93
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 100),
    });
    const first = instances[0];
    expect(first).toBeDefined();
    const cfg = first!.configure.mock.calls[0]?.[0] as VideoEncoderConfig;
    expect(cfg.codec).toBe('hvc1.1.6.L93.B0');
    expect(cfg.width).toBe(DEFAULT_BENCH_WIDTH);
    expect(cfg.height).toBe(DEFAULT_BENCH_HEIGHT);
  });
});

// ---- AbortSignal ----

describe('runHevcParallelismBench: signal', () => {
  it('呼び出し前に abort 済み → HevcBenchAbortError', async () => {
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const ac = new AbortController();
    ac.abort();
    await expect(
      runHevcParallelismBench({
        frameCount: 2,
        videoEncoderCtor: ctor,
        offscreenCanvasCtor: mockOffscreenCanvasCtor,
        videoFrameCtor: vfCtor,
        signal: ac.signal,
        now: makeStepNow(100, 100),
      }),
    ).rejects.toBeInstanceOf(HevcBenchAbortError);
  });

  it('HevcBenchAbortError.name === "AbortError" (DOM 慣習に合わせる)', () => {
    const err = new HevcBenchAbortError();
    expect(err.name).toBe('AbortError');
  });
});

// ---- 環境チェック ----

describe('runHevcParallelismBench: 環境不在エラー', () => {
  it('VideoEncoder 不在 → 例外メッセージに VideoEncoder unavailable', async () => {
    // override を undefined にしつつ globalThis にも無い状況を作る
    const orig = (globalThis as Record<string, unknown>).VideoEncoder;
    delete (globalThis as Record<string, unknown>).VideoEncoder;
    try {
      await expect(runHevcParallelismBench({ frameCount: 2 })).rejects.toThrow(
        /VideoEncoder unavailable/,
      );
    } finally {
      if (orig !== undefined) (globalThis as Record<string, unknown>).VideoEncoder = orig;
    }
  });

  it('OffscreenCanvas 不在 → 例外メッセージに OffscreenCanvas unavailable', async () => {
    const { ctor } = makeMockVideoEncoderCtor(0);
    const orig = (globalThis as Record<string, unknown>).OffscreenCanvas;
    delete (globalThis as Record<string, unknown>).OffscreenCanvas;
    try {
      await expect(
        runHevcParallelismBench({
          frameCount: 2,
          videoEncoderCtor: ctor,
        }),
      ).rejects.toThrow(/OffscreenCanvas unavailable/);
    } finally {
      if (orig !== undefined) (globalThis as Record<string, unknown>).OffscreenCanvas = orig;
    }
  });
});

// ---- 結果メタ情報 ----

describe('runHevcParallelismBench: 結果フィールド', () => {
  it('ranAt は実行時の Date.now() に近い (±100ms)', async () => {
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const t0 = Date.now();
    const r = await runHevcParallelismBench({
      frameCount: 2,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(100, 100),
    });
    expect(r.ranAt).toBeGreaterThanOrEqual(t0);
    expect(r.ranAt).toBeLessThanOrEqual(Date.now());
  });

  it('frameCount / width / height を結果に含む (再現性のため)', async () => {
    const { ctor } = makeMockVideoEncoderCtor(0);
    const { ctor: vfCtor } = makeMockVideoFrameCtor();
    const r = await runHevcParallelismBench({
      frameCount: 7,
      width: 640,
      height: 360,
      videoEncoderCtor: ctor,
      offscreenCanvasCtor: mockOffscreenCanvasCtor,
      videoFrameCtor: vfCtor,
      now: makeStepNow(50, 50),
    });
    expect(r.frameCount).toBe(7);
    expect(r.width).toBe(640);
    expect(r.height).toBe(360);
  });

  it('DEFAULT_BENCH_FRAME_COUNT は 60 (~2 秒 @ 720p 30fps)', () => {
    expect(DEFAULT_BENCH_FRAME_COUNT).toBe(60);
  });

  it('DEFAULT_SLOWDOWN_THRESHOLD は 1.3 (CLAUDE.md Phase 4 仕様)', () => {
    expect(DEFAULT_SLOWDOWN_THRESHOLD).toBe(1.3);
  });
});
