// V2: HEVC ベンチマーク orchestrator のユニットテスト。
// 検証する不変量:
//   - shouldRunBench: null / 新鮮 / 古い / 未来時刻 の各ケース
//   - runAndPersistHevcBench: bench 結果が両 store に流れる
//   - maybeAutoRunHevcBench: skip 条件 3 つ (hevc 非対応 / 新鮮 / 進行中)
//   - bench 失敗時に store は更新されない
//
// stores は dep injection で mock し、本物の zustand store には触れない。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldRunBench,
  runAndPersistHevcBench,
  maybeAutoRunHevcBench,
  MAX_BENCH_AGE_MS,
  _resetInFlightForTest,
} from './hevcBenchOrchestrator';
import { HevcBenchAbortError, type HevcBenchResult } from './hevcBench';

function makeRecord(overrides: Partial<HevcBenchResult> = {}): HevcBenchResult {
  return {
    speedup: 1.8,
    slowdown: false,
    serialMs: 1000,
    parallelMs: 1111,
    ranAt: Date.now(),
    frameCount: 60,
    width: 1280,
    height: 720,
    ...overrides,
  };
}

beforeEach(() => {
  _resetInFlightForTest();
});

// ---- shouldRunBench ----

describe('shouldRunBench', () => {
  it('null (未実行) → true', () => {
    expect(shouldRunBench(null)).toBe(true);
  });

  it('直近 (ranAt = now) → false', () => {
    const now = 1_000_000;
    const record = makeRecord({ ranAt: now });
    expect(shouldRunBench(record, () => now)).toBe(false);
  });

  it('1 日前 → false (MAX_BENCH_AGE_MS=90日 未満)', () => {
    const now = 100_000_000_000;
    const record = makeRecord({ ranAt: now - 24 * 60 * 60 * 1000 });
    expect(shouldRunBench(record, () => now)).toBe(false);
  });

  it('90 日ちょうど → false (> のみ true)', () => {
    const now = 100_000_000_000;
    const record = makeRecord({ ranAt: now - MAX_BENCH_AGE_MS });
    expect(shouldRunBench(record, () => now)).toBe(false);
  });

  it('91 日前 → true (古すぎる)', () => {
    const now = 100_000_000_000;
    const record = makeRecord({ ranAt: now - (MAX_BENCH_AGE_MS + 1) });
    expect(shouldRunBench(record, () => now)).toBe(true);
  });

  it('未来時刻 (時計巻き戻し) → true', () => {
    const now = 1_000_000;
    const record = makeRecord({ ranAt: now + 10_000 });
    expect(shouldRunBench(record, () => now)).toBe(true);
  });

  it('MAX_BENCH_AGE_MS は 90 日 (= 7,776,000,000 ms)', () => {
    expect(MAX_BENCH_AGE_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

// ---- runAndPersistHevcBench ----

describe('runAndPersistHevcBench', () => {
  it('bench 結果を両 store に伝播 (setHevcBench + setHevcBenchSlowdown)', async () => {
    const benchResult = makeRecord({ slowdown: true, speedup: 1.0 });
    const bench = vi.fn(async () => benchResult);
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});

    const r = await runAndPersistHevcBench(
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );

    expect(r).toBe(benchResult);
    expect(setHevcBench).toHaveBeenCalledTimes(1);
    expect(setHevcBench).toHaveBeenCalledWith(benchResult);
    expect(setHevcBenchSlowdown).toHaveBeenCalledTimes(1);
    expect(setHevcBenchSlowdown).toHaveBeenCalledWith(true);
  });

  it('slowdown=false でも setHevcBenchSlowdown(false) が呼ばれる', async () => {
    const benchResult = makeRecord({ slowdown: false, speedup: 2.0 });
    const bench = vi.fn(async () => benchResult);
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});

    await runAndPersistHevcBench({}, { bench, setHevcBench, setHevcBenchSlowdown });

    expect(setHevcBenchSlowdown).toHaveBeenCalledWith(false);
  });

  it('bench 失敗時は store を更新せず例外を re-throw', async () => {
    const err = new Error('encoder crash');
    const bench = vi.fn(async () => {
      throw err;
    });
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});

    await expect(
      runAndPersistHevcBench({}, { bench, setHevcBench, setHevcBenchSlowdown }),
    ).rejects.toBe(err);

    expect(setHevcBench).not.toHaveBeenCalled();
    expect(setHevcBenchSlowdown).not.toHaveBeenCalled();
  });

  it('options を bench に転送する', async () => {
    const bench = vi.fn(async () => makeRecord());
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});
    const opts = { frameCount: 30, slowdownThreshold: 1.5 };

    await runAndPersistHevcBench(opts, { bench, setHevcBench, setHevcBenchSlowdown });

    expect(bench).toHaveBeenCalledWith(opts);
  });
});

// ---- maybeAutoRunHevcBench: skip ケース ----

describe('maybeAutoRunHevcBench', () => {
  it('hevc 非対応端末は skip (reason="hevc-unsupported")', () => {
    const bench = vi.fn();
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});
    const result = maybeAutoRunHevcBench(
      { hevcEncode: false },
      null,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );
    expect(result).toEqual({ status: 'skipped', reason: 'hevc-unsupported' });
    expect(bench).not.toHaveBeenCalled();
  });

  it('新鮮な record (1 時間前) → skip (reason="fresh")', () => {
    const now = 100_000_000_000;
    const record = makeRecord({ ranAt: now - 60 * 60 * 1000 });
    const bench = vi.fn();
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});
    const result = maybeAutoRunHevcBench(
      { hevcEncode: true },
      record,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
      () => now,
    );
    expect(result).toEqual({ status: 'skipped', reason: 'fresh' });
    expect(bench).not.toHaveBeenCalled();
  });

  it('既に進行中の bench がある場合 skip (reason="in-flight")', async () => {
    // 1 回目: started を返す
    let resolveBench: (v: HevcBenchResult) => void = () => {};
    const bench = vi.fn(
      () =>
        new Promise<HevcBenchResult>((res) => {
          resolveBench = res;
        }),
    );
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});

    const first = maybeAutoRunHevcBench(
      { hevcEncode: true },
      null,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );
    expect(first.status).toBe('started');

    // 2 回目: in-flight で skip
    const second = maybeAutoRunHevcBench(
      { hevcEncode: true },
      null,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );
    expect(second).toEqual({ status: 'skipped', reason: 'in-flight' });
    expect(bench).toHaveBeenCalledTimes(1); // 2 回目は呼ばれない

    // クリーンアップ: 進行中の bench を resolve させる
    resolveBench(makeRecord());
    if (first.status === 'started') await first.promise;
  });

  it('null record + hevc 対応 → started (bench が走る)', async () => {
    const benchResult = makeRecord({ slowdown: true });
    const bench = vi.fn(async () => benchResult);
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});

    const result = maybeAutoRunHevcBench(
      { hevcEncode: true },
      null,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );
    expect(result.status).toBe('started');
    if (result.status === 'started') {
      const r = await result.promise;
      expect(r).toBe(benchResult);
      expect(setHevcBench).toHaveBeenCalledWith(benchResult);
      expect(setHevcBenchSlowdown).toHaveBeenCalledWith(true);
    }
  });

  it('bench 失敗後に再度呼べる (in-flight ロックが解放される)', async () => {
    const bench = vi.fn();
    bench.mockRejectedValueOnce(new Error('first attempt failed'));
    bench.mockResolvedValueOnce(makeRecord());
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});

    // 1 回目: 失敗
    const first = maybeAutoRunHevcBench(
      { hevcEncode: true },
      null,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );
    if (first.status === 'started') {
      await expect(first.promise).rejects.toThrow('first attempt failed');
    }

    // 2 回目: 成功できる (in-flight が解放されているので skipped にならない)
    const second = maybeAutoRunHevcBench(
      { hevcEncode: true },
      null,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );
    expect(second.status).toBe('started');
    if (second.status === 'started') {
      await second.promise;
    }
    expect(bench).toHaveBeenCalledTimes(2);
  });

  it('AbortError 後も in-flight ロックが解放される', async () => {
    const bench = vi
      .fn()
      .mockRejectedValueOnce(new HevcBenchAbortError())
      .mockResolvedValueOnce(makeRecord());
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});

    const first = maybeAutoRunHevcBench(
      { hevcEncode: true },
      null,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );
    if (first.status === 'started') {
      await expect(first.promise).rejects.toBeInstanceOf(HevcBenchAbortError);
    }

    // 2 回目: in-flight ロックが解放されていれば呼び出せる + 成功する
    const second = maybeAutoRunHevcBench(
      { hevcEncode: true },
      null,
      {},
      { bench, setHevcBench, setHevcBenchSlowdown },
    );
    expect(second.status).toBe('started');
    if (second.status === 'started') {
      // unhandled rejection を防ぐため必ず await する
      await second.promise;
    }
  });
});
