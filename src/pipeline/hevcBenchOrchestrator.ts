// V2: HEVC ベンチマークの実行 + 永続化のグルー。
//
// 役割:
//   - hevcBench.ts の純粋な計測関数 (runHevcParallelismBench) と
//     stores (settingsStore で rich record / queueStore で operational boolean) を繋ぐ
//   - 「ベンチが古い / 未実行 → 走らせるべき」の判定 (shouldRunBench)
//   - 自動再ベンチ判定の閾値定数 (MAX_BENCH_AGE_MS = 90 日)
//
// なぜ pipeline/ 以下に置くか:
//   stores/ は zustand 各 store の宣言の場 + UI 連動のロジック。
//   pipeline/ は WebCodecs 周辺の手続き的処理。本ファイルは bench の手続き的呼出を
//   stores に「向きを変える」だけのプリミティブなので、pipeline/ の方が筋。
//   (orchestrator は side-effectful なので test では mock store を差し替える)

import {
  runHevcParallelismBench,
  HevcBenchAbortError,
  type HevcBenchResult,
  type HevcBenchOptions,
} from './hevcBench';
import { useSettingsStore } from '../stores/settingsStore';
import { useQueueStore } from '../stores/queueStore';

/** 自動再ベンチの閾値 (ms)。90 日経過したら再計測する (端末ハードウェアは普通変わらないが、
 *  iOS バージョンアップ / WebKit エンジン更新で VideoToolbox の挙動が変わる可能性に対応)。 */
export const MAX_BENCH_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** bench を走らせるべきかの判定。
 *  - record === null (未実行) → true
 *  - record.ranAt が MAX_BENCH_AGE_MS より古い → true
 *  - 未来時刻 (時計巻き戻し) → true (再計測した方が安全)
 *  - その他 → false
 *
 *  now はテスト用に注入可能 (default: Date.now)。 */
export function shouldRunBench(
  record: HevcBenchResult | null,
  now: () => number = Date.now,
): boolean {
  if (record === null) return true;
  const age = now() - record.ranAt;
  if (age < 0) return true; // 未来時刻 (時計巻き戻し)
  if (age > MAX_BENCH_AGE_MS) return true;
  return false;
}

/** 依存差し替え可能な orchestrator。テストで store actions を mock するために
 *  渡せる形にしておく。Production からは runAndPersistHevcBench を呼ぶ。 */
export interface RunAndPersistDeps {
  /** bench 実行関数 (default: runHevcParallelismBench)。 */
  bench?: (opts?: HevcBenchOptions) => Promise<HevcBenchResult>;
  /** settingsStore.setHevcBench へのアクセサ (default: zustand state action)。 */
  setHevcBench?: (result: HevcBenchResult | null) => void;
  /** queueStore.setHevcBenchSlowdown へのアクセサ (default: zustand state action)。 */
  setHevcBenchSlowdown?: (value: boolean | null) => Promise<void>;
}

/** bench を実行して、結果を両 store + 永続化層に書き込む。
 *
 *  失敗ケース:
 *    - HevcBenchAbortError → re-throw (caller 側で 'cancelled' UX を出すため)
 *    - その他の bench Error → re-throw (caller 側で toast 出す等)、store は更新しない
 *
 *  返り値: bench の結果 (caller が UI 表示に使える)。 */
export async function runAndPersistHevcBench(
  options: HevcBenchOptions = {},
  deps: RunAndPersistDeps = {},
): Promise<HevcBenchResult> {
  const bench = deps.bench ?? runHevcParallelismBench;
  const setHevcBench =
    deps.setHevcBench ?? ((r: HevcBenchResult | null) => useSettingsStore.getState().setHevcBench(r));
  const setHevcBenchSlowdown =
    deps.setHevcBenchSlowdown ??
    ((v: boolean | null) => useQueueStore.getState().setHevcBenchSlowdown(v));

  const result = await bench(options);
  // bench 成功 → 両 store を更新
  setHevcBench(result);
  await setHevcBenchSlowdown(result.slowdown);
  return result;
}

/** 自動実行のエントリポイント。App.tsx の useEffect から呼ぶ。
 *  - envCheck.hevcEncode が false なら skip
 *  - shouldRunBench(record) が false なら skip
 *  - 既に bench が走っている (進行中 promise が module-level に残っている) なら skip
 *  - 失敗は console.warn のみ (致命的でない、次回起動で再試行)
 *
 *  返り値:
 *    - { status: 'started', promise } → bench が走った
 *    - { status: 'skipped', reason } → skip 理由 (テストで観測可能) */
export type AutoRunResult =
  | { status: 'started'; promise: Promise<HevcBenchResult> }
  | { status: 'skipped'; reason: 'hevc-unsupported' | 'fresh' | 'in-flight' };

let inFlight: Promise<HevcBenchResult> | null = null;

export function maybeAutoRunHevcBench(
  envCheck: { hevcEncode: boolean },
  currentRecord: HevcBenchResult | null,
  options: HevcBenchOptions = {},
  deps: RunAndPersistDeps = {},
  now: () => number = Date.now,
): AutoRunResult {
  if (!envCheck.hevcEncode) return { status: 'skipped', reason: 'hevc-unsupported' };
  if (inFlight !== null) return { status: 'skipped', reason: 'in-flight' };
  if (!shouldRunBench(currentRecord, now)) return { status: 'skipped', reason: 'fresh' };

  const promise = runAndPersistHevcBench(options, deps)
    .catch((err) => {
      if (err instanceof HevcBenchAbortError) {
        // cancel は失敗扱いしない (再試行は次回起動で)
        throw err;
      }
      // それ以外の失敗はログだけ残して swallow (致命的でない)
      // eslint-disable-next-line no-console
      console.warn('[hevcBench] auto-run failed:', err);
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = promise;
  return { status: 'started', promise };
}

/** テスト用: in-flight ロックをリセット。 */
export function _resetInFlightForTest(): void {
  inFlight = null;
}
