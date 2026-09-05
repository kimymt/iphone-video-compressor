// Zustand store。Phase 4a で Worker 連携 + 処理ループを追加。
// Phase 4b で cancel、Phase 4c で retry / clearCompleted / effectiveParallelism を追加。
// HEVC ベンチは Phase 4c では作らない (TODOS.md 参照)。
// effectiveParallelism は hevcBenchSlowdown=== null/false なら parallelism と同等。

import { create } from 'zustand';
import type { QueueItem, PresetKey, Preset } from '../lib/types';
import {
  writeInputToOpfs,
  deleteFromOpfs,
  readFromOpfs,
  outputPath,
} from '../db/opfs';
import {
  shareFiles,
  deriveShareFileName,
  type ShareFilesResult,
} from '../platform/share';
import {
  loadAllQueueItems,
  saveQueueItem as writeQueueItem,
  deleteQueueItem,
  getSetting,
  setSetting,
} from '../db/indexeddb';
import { hasEnoughQuota } from '../platform/storage';
import { findPreset } from '../lib/presets';
import { withViewTransition } from '../lib/viewTransition';
import {
  spawnTranscodeWorker as defaultSpawnTranscodeWorker,
  runTranscodeJob as defaultRunTranscodeJob,
  peekFile as defaultPeekFile,
  type TranscodeJobResult,
} from '../workers/compressor-client';

// ---- Worker factory のインジェクション (テストで差し替え可能) ----

type SpawnFn = () => Worker;
type RunFn = typeof defaultRunTranscodeJob;
type PeekFn = typeof defaultPeekFile;

let spawnWorkerImpl: SpawnFn = defaultSpawnTranscodeWorker;
let runJobImpl: RunFn = defaultRunTranscodeJob;
let peekFileImpl: PeekFn = defaultPeekFile;

/**
 * テスト用: Worker spawner と runner (任意で peek 関数) を差し替える。
 *
 * V2.x (A2): peek を省略した呼び出しでは、即座に `peekFailed` を返すスタブを使う
 * (silent drop の挙動と一致)。queueStore.add の `await peekPromise` がハングしない
 * よう、jsdom の Worker mock が postMessage を no-op にしているケースでも安全に進む。
 */
export function _setWorkerImplsForTest(spawn: SpawnFn, run: RunFn, peek?: PeekFn): void {
  spawnWorkerImpl = spawn;
  runJobImpl = run;
  peekFileImpl = peek ?? (async () => ({ kind: 'peekFailed', error: 'test stub' }));
}

/** テスト用: 実装をデフォルトに戻す。 */
export function _resetWorkerImplsForTest(): void {
  spawnWorkerImpl = defaultSpawnTranscodeWorker;
  runJobImpl = defaultRunTranscodeJob;
  peekFileImpl = defaultPeekFile;
}

// ---- V2.x (A1): persistent Worker pool ----
//
// transcode 用と peek 用で別ステートを持つ:
//
// - transcodePool / inUseTranscode: parallelism (1 or 2) ぶんの worker を pre-spawn し、
//   runJob が acquire → run → release で再利用。terminate しないので cold-start
//   (mediabunny パース + Worker spawn = 500ms〜2s, CLAUDE.md ハマりどころ #18) を
//   2 回目以降の transcode で完全に消す。
//
// - peekWorker: 単一の共有 worker。複数 peek を同時受け付けることもできる
//   (handlePeek は currentJobId / terminalSent を触らないので並行安全)。
//   transcode 中の worker を peek が圧迫しないよう、pool とは別に分離。
//
// Worker error 時は pool から自動 drop して、次の acquire で再 spawn する。
// テスト時は `_resetWorkerPoolForTest()` で全 worker を terminate する。

const transcodePool: Worker[] = [];
const inUseTranscode = new Set<Worker>();
let peekWorker: Worker | null = null;

/**
 * transcode pool から idle な worker を 1 個取得。空きがなければ新規 spawn。
 * 戻り値の worker は必ず `releaseWorker(worker)` で返却すること。
 */
function acquireTranscodeWorker(): Worker {
  const idle = transcodePool.find((w) => !inUseTranscode.has(w));
  if (idle) {
    inUseTranscode.add(idle);
    return idle;
  }
  const w = spawnWorkerImpl();
  registerWorkerErrorHandler(w);
  transcodePool.push(w);
  inUseTranscode.add(w);
  return w;
}

/** transcode worker を pool に返却。次の acquireWorker で再利用される。 */
function releaseTranscodeWorker(w: Worker): void {
  inUseTranscode.delete(w);
}

/** Worker error 発火時に pool から drop。次の acquire で fresh worker が spawn される。 */
function registerWorkerErrorHandler(w: Worker): void {
  w.addEventListener('error', () => {
    inUseTranscode.delete(w);
    const idx = transcodePool.indexOf(w);
    if (idx !== -1) transcodePool.splice(idx, 1);
    if (peekWorker === w) peekWorker = null;
    try {
      w.terminate();
    } catch {
      /* terminate 失敗は無視 */
    }
  });
}

/**
 * peek 用 worker を取得 (lazy spawn、単一インスタンス共有)。
 * handlePeek は worker 内部状態を触らないので、複数 peek を並行で受けても安全。
 */
function getPeekWorker(): Worker {
  if (!peekWorker) {
    peekWorker = spawnWorkerImpl();
    registerWorkerErrorHandler(peekWorker);
  }
  return peekWorker;
}

/**
 * 起動時に transcode worker を `count` 個 pre-spawn する。
 * `init()` で parallelism ぶん呼ぶことで、最初のファイル投入時に Worker cold-start を払わずに済む。
 */
function prewarmTranscodePool(count: number): void {
  while (transcodePool.length < count) {
    const w = spawnWorkerImpl();
    registerWorkerErrorHandler(w);
    transcodePool.push(w);
  }
}

/** テスト用: pool 全 worker を terminate して空にする。 */
export function _resetWorkerPoolForTest(): void {
  for (const w of transcodePool) {
    try {
      w.terminate();
    } catch {
      /* terminate 失敗は無視 */
    }
  }
  transcodePool.length = 0;
  inUseTranscode.clear();
  if (peekWorker) {
    try {
      peekWorker.terminate();
    } catch {
      /* terminate 失敗は無視 */
    }
    peekWorker = null;
  }
}

// ---- 進行中ジョブの管理 (zustand state には乗せない、in-memory のみ) ----

const runningAbortControllers = new Map<string, AbortController>();
const removingItemIds = new Set<string>();
const runningJobs = new Map<string, Promise<void>>();
const removalTasks = new Map<string, Promise<void>>();
const pendingSaves = new Map<string, Promise<void>>();

// 遅れて完了した進捗保存が、削除済みのレコードを復活させないよう順序を固定する。
function saveQueueItem(item: QueueItem): Promise<void> {
  const saved = (pendingSaves.get(item.id) ?? Promise.resolve())
    .catch(() => {})
    .then(() => writeQueueItem(item));
  pendingSaves.set(item.id, saved);
  void saved.finally(() => {
    if (pendingSaves.get(item.id) === saved) pendingSaves.delete(item.id);
  }).catch(() => {});
  return saved;
}

async function tryDeleteFromOpfs(path: string): Promise<boolean> {
  try {
    await deleteFromOpfs(path);
    return true;
  } catch {
    return false;
  }
}

function abortRunningJob(id: string): void {
  const ac = runningAbortControllers.get(id);
  if (ac) ac.abort();
}

// ---- Store 型定義 ----

export type QueueStoreState = {
  items: QueueItem[];
  parallelism: 1 | 2;
  hevcBenchSlowdown: boolean | null;
  isProcessing: boolean;
  initialized: boolean;
};

export type QueueStoreActions = {
  init: () => Promise<void>;
  add: (files: File[], preset: PresetKey) => Promise<AddResult>;
  remove: (id: string) => Promise<void>;
  /**
   * 実行中のジョブを cancel する。
   * - queued: 直接 cancelled に遷移 (Worker 未起動)
   * - starting/processing: abortController.abort()、Worker からの cancelled 応答で
   *   runJob が status='cancelled' に遷移
   * - 既に terminal (done/failed/cancelled): no-op
   */
  cancel: (id: string) => Promise<void>;
  /**
   * failed / cancelled の item を 'queued' に戻して processNext を起動する。
   * 入力 OPFS が残っていること (inputOpfsPath !== '') が前提。
   * done からの retry は不可 (done 遷移時に input を削除しているため)。
   * queued / starting / processing / done の状態では no-op。
   */
  retry: (id: string) => Promise<void>;
  /**
   * done / failed / cancelled (= terminal な) アイテムをまとめて削除する。
   * OPFS の入出力と IndexedDB を含めて remove() と同じ後始末を行う。
   * queued / starting / processing は残す。
   */
  clearCompleted: () => Promise<void>;
  /**
   * preset 固有の並列度上限。
   * - parallelism=1 なら preset を問わず 1
   * - hevc + hevcBenchSlowdown=true なら 1 (VideoToolbox の単一リソース対策、ハマりどころ 17)
   * - その他は parallelism (1 or 2)
   * hevcBenchSlowdown が null (= 未計測) は false 扱い。
   * V2 で実機ベンチでの動的判定を実装 (hevcBench.ts + hevcBenchOrchestrator.ts)。
   */
  effectiveParallelism: (preset: Preset) => 1 | 2;
  /** V2: HEVC bench の slowdown フラグを更新 + IndexedDB に永続化。
   *  orchestrator (runAndPersistHevcBench) が bench 完了時に呼ぶ。
   *  null を渡すと未計測扱いに戻す (テスト/設定リセット用)。 */
  setHevcBenchSlowdown: (value: boolean | null) => Promise<void>;
  /** V2: status='done' な全アイテムの出力を OPFS から読み出して 1 回の Share Sheet
   *  でまとめて保存する。ユーザは「写真に保存」を 1 タップで全件取り込み。
   *  - done が 0 件のときは `{ kind: 'failed-multi', error: 'no done items' }`
   *  - OPFS 読み出し失敗のアイテムは skip し、残りで shareFiles を呼ぶ
   *    (全件 read 失敗なら 'failed-multi')
   *  - 合計サイズ 1GB 超や canShare=false は shareFiles 内で failed-multi 判定 */
  shareAllDone: () => Promise<ShareFilesResult>;
  /**
   * 'queued' なアイテムを並列度の上限まで起動する。
   * 並列度は effectiveParallelism(preset) で per-preset に決まる。
   * add() / init() / 各ジョブ完了時に自動呼び出し。手動でも呼べる (idempotent)。
   */
  processNext: () => void;
};

export type AddResult =
  | { ok: true; addedIds: string[] }
  | { ok: false; reason: 'quota-exceeded'; required: number; available: number }
  | { ok: false; reason: 'opfs-write-failed'; error: string };

// ---- ヘルパー ----

function computeParallelism(): 1 | 2 {
  if (typeof navigator === 'undefined' || !navigator.hardwareConcurrency) return 1;
  return navigator.hardwareConcurrency >= 6 ? 2 : 1;
}

/** items 配列内の 1 アイテムを部分更新する。id が存在しなければ no-op。 */
function patchItem(
  items: QueueItem[],
  id: string,
  patch: Partial<QueueItem> & { status?: QueueItem['status'] },
): QueueItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    // discriminated union を維持するため、新 status の variant 形に組み替える
    const merged = { ...item, ...patch } as QueueItem;
    return merged;
  });
}

/**
 * A4 で決定したリセットロジック (Phase 2 から):
 * status === 'processing' || 'starting' のアイテムを 'queued' に戻し、
 * progress=0、startedAt=undefined、outputOpfsPath を OPFS から削除。
 */
async function resetInProgressItems(items: QueueItem[]): Promise<QueueItem[]> {
  const resetItems: QueueItem[] = [];
  for (const item of items) {
    if (!item.deletionPending && (item.status === 'processing' || item.status === 'starting')) {
      const cleaned = await tryDeleteFromOpfs(item.outputOpfsPath || outputPath(item.id));
      const reset: QueueItem = {
        ...item,
        status: 'queued',
        progress: 0,
        startedAt: undefined,
        outputOpfsPath: cleaned ? undefined : item.outputOpfsPath || outputPath(item.id),
        cleanupFailed: !cleaned,
        outputSize: undefined,
      };
      resetItems.push(reset);
      await saveQueueItem(reset);
    } else {
      resetItems.push(item);
    }
  }
  return resetItems;
}

// ---- Store 本体 ----

export const useQueueStore = create<QueueStoreState & QueueStoreActions>((set, get) => ({
  items: [],
  parallelism: 1,
  hevcBenchSlowdown: null,
  isProcessing: false,
  initialized: false,

  async init() {
    if (get().initialized) return;
    const raw = await loadAllQueueItems();
    const items = await resetInProgressItems(raw);
    const hevcBenchSlowdown = (await getSetting<boolean | null>('hevcBenchSlowdown')) ?? null;
    const parallelism = computeParallelism();
    set({
      items,
      parallelism,
      hevcBenchSlowdown,
      initialized: true,
    });
    // V2.x (A1): transcode worker を parallelism ぶん pre-spawn する。
    // 初回 add() の cold-start (500ms〜2s) を払わずに済む。
    // 失敗 (Worker spawn 例外) は致命的でない (acquireWorker で lazy spawn にフォールバック)。
    try {
      prewarmTranscodePool(parallelism);
    } catch {
      /* prewarm 失敗は無視。後続の acquire で lazy spawn される。 */
    }
    // 前回途中で止まった削除は圧縮として再開しない。失敗時は行を残す。
    await Promise.allSettled(items.filter((i) => i.deletionPending).map((i) => get().remove(i.id)));
    // 圧縮済みの元動画の清掃も、パスを保持したまま再試行する。
    for (const item of get().items) {
      if (item.status === 'done' && item.inputOpfsPath && !item.deletionPending) {
        const cleaned = await tryDeleteFromOpfs(item.inputOpfsPath);
        await transition(set, get, item.id, {
          inputOpfsPath: cleaned ? '' : item.inputOpfsPath,
          cleanupFailed: !cleaned,
        });
      }
    }
    get().processNext();
  },

  async add(files, preset) {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const okQuota = await hasEnoughQuota(totalSize);
    if (!okQuota) {
      return {
        ok: false,
        reason: 'quota-exceeded',
        required: Math.ceil(totalSize * 2.5),
        available: 0,
      };
    }

    // M1: OPFS write を逐次で全て終わらせてから、1 つの View Transition で
    // まとめて state に反映する。これにより N 件選択時に全アイテムが並列に
    // slide-in する (旧実装は各 add で startViewTransition が連鎖し、前の
    // transition が skip されて最後の 1 件だけアニメする問題があった)。
    //
    // V2.x (A2): 各 file に対して peek (投機的 demux) を OPFS write と並列に発火する。
    // peek は推定サイズ表示のための任意処理なので、キュー追加を待たせない。
    // 結果は item 追加後に非同期反映し、失敗は silent drop する。
    const addedIds: string[] = [];
    const newItems: QueueItem[] = [];
    const peekJobs: Array<{ id: string; result: ReturnType<PeekFn> }> = [];
    const now = Date.now();
    for (const file of files) {
      const id = crypto.randomUUID();
      // Worker 生成や postMessage の同期例外も peekFailed に正規化する。
      // Promise.resolve().then() に包むことで OPFS write と並列に開始しつつ、add() 本体へ
      // 例外を伝播させない。
      const peekResult = Promise.resolve()
        .then(() => peekFileImpl(getPeekWorker(), id, file))
        .catch((error) => ({
          kind: 'peekFailed' as const,
          error: error instanceof Error ? error.message : String(error),
        }));
      peekJobs.push({ id, result: peekResult });

      let inputOpfsPath: string;
      try {
        inputOpfsPath = await writeInputToOpfs(file, id);
      } catch (err) {
        // peek が裏で走り続けるのは無害 (worker は persistent、結果は捨てられる)
        return {
          ok: false,
          reason: 'opfs-write-failed',
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const item: QueueItem = {
        id,
        fileName: file.name,
        inputSize: file.size,
        inputOpfsPath,
        progress: 0,
        preset,
        addedAt: now + addedIds.length,
        status: 'queued',
      };
      await saveQueueItem(item);
      addedIds.push(id);
      newItems.push(item);
    }

    // 全 OPFS write 完了後、1 トランジションでまとめて反映 (全アイテム並列 slide-in)
    if (newItems.length > 0) {
      await withViewTransition(() => {
        set((state) => ({ items: [...state.items, ...newItems] }));
      });
    }

    // item が state に入った後で peek 結果を反映する。Worker が応答しない・落ちる場合でも
    // add() と transcode 開始はこの Promise を待たないため、UI は先へ進める。
    for (const peek of peekJobs) {
      void peek.result.then((result) => {
        if (result.kind !== 'peeked') return;
        const current = get().items.find((item) => item.id === peek.id);
        // remove()/clearCompleted() の永続化削除中に put し直さない。
        // また、progress/done が設定した確定値を投機的な値で上書きしない。
        if (!current || removingItemIds.has(peek.id) || current.durationSec !== undefined) return;
        void transition(set, get, peek.id, { durationSec: result.meta.durationSec }).catch(() => {
          // 推定サイズの永続化失敗は圧縮処理を止めない。
        });
      });
    }

    // 追加直後に処理を起動
    get().processNext();
    return { ok: true, addedIds };
  },

  async remove(id) {
    await deleteItemData(id, set, get);
    await withViewTransition(() => {
      set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
    });
    get().processNext();
  },

  async cancel(id) {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === 'queued') {
      // Worker 未起動、直接 cancelled に遷移
      await transition(set, get, id, {
        status: 'cancelled',
        finishedAt: Date.now(),
        etaSec: undefined,
        currentSec: undefined,
      });
      return;
    }
    if (item.status === 'starting' || item.status === 'processing') {
      // 実行中: abort を発火、Worker からの cancelled 応答で runJob が遷移を行う
      abortRunningJob(id);
      return;
    }
    // done / failed / cancelled は no-op
  },

  async retry(id) {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    if (item.deletionPending || removingItemIds.has(id)) return;
    if (item.status !== 'failed' && item.status !== 'cancelled') return;
    if (!item.inputOpfsPath) {
      // done 遷移で input 削除済みの状態。UI 側で disabled の想定だが防御。
      return;
    }

    if (!(await tryDeleteFromOpfs(outputPath(id)))) {
      await transition(set, get, id, { cleanupFailed: true });
      return;
    }
    const current = get().items.find((i) => i.id === id);
    if (!current || current.deletionPending || removingItemIds.has(id)) return;

    // failed variant の `error` を切り離し queued に戻す。
    // discriminated union を維持するため明示的に新しいオブジェクトを構築する。
    // addedAt は保持して FIFO 順序を維持。中途出力 / ephemeral フィールドはクリア。
    const retried: QueueItem = {
      id: item.id,
      fileName: item.fileName,
      inputSize: item.inputSize,
      inputOpfsPath: item.inputOpfsPath,
      preset: item.preset,
      addedAt: item.addedAt,
      progress: 0,
      status: 'queued',
    };

    // V2 / V2.x MINOR #5: View Transitions の意味論を明示。
    //
    // retry は同じ `id` を保つので `viewTransitionName: queue-item-${id}-${addedAt}`
    // 経由で **per-item morph** が走る (status icon が AlertTriangle → Clock に
    // smooth に切り替わる)。CSS の `::view-transition-new(*):only-child` で定義した
    // slide-in アニメは「old が存在しない新規追加」専用のため、retry では
    // **意図的に走らない** (item は DOM 上に残ったまま morph するのが正しい挙動)。
    //
    // 「再投入感」を強く出したい場合は `addedAt` を update するか retryCount を
    // 追加して viewTransitionName を bump すれば slide-out + slide-in が走るが、
    // iOS native の retry UX に合わせて subtle morph のままにしている。
    await withViewTransition(() => {
      const current = get().items.find((i) => i.id === id);
      if (!current || current.deletionPending || removingItemIds.has(id)) return;
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? retried : i)),
      }));
    });
    const updated = get().items.find((i) => i.id === id);
    if (!updated || updated.deletionPending || removingItemIds.has(id)) return;
    await saveQueueItem(updated).catch(() => {});

    get().processNext();
  },

  async clearCompleted() {
    const targets = get().items.filter(
      (i) => i.deletionPending || i.status === 'done' || i.status === 'failed' || i.status === 'cancelled',
    );
    if (targets.length === 0) return;
    const results = await Promise.allSettled(targets.map((i) => deleteItemData(i.id, set, get)));
    const removed = new Set(targets.filter((_, i) => results[i]?.status === 'fulfilled').map((i) => i.id));
    // 一部が失敗しても成功した項目は除去し、失敗した行だけを再試行可能にする。
    await withViewTransition(() => {
      set((state) => ({ items: state.items.filter((i) => !removed.has(i.id)) }));
    });
    if (results.some((r) => r.status === 'rejected')) throw new Error('Video deletion failed');
  },

  effectiveParallelism(preset) {
    const state = get();
    if (state.parallelism === 1) return 1;
    if (preset.codec === 'hevc' && state.hevcBenchSlowdown === true) return 1;
    return 2;
  },

  async setHevcBenchSlowdown(value) {
    set({ hevcBenchSlowdown: value });
    // IndexedDB に永続化。失敗は致命的でないので握り潰す
    // (次回 init 時に古い値が読まれるだけで bench 自体は再実行される)。
    await setSetting('hevcBenchSlowdown', value).catch(() => {});
    // 並列度が変わったかもしれないので、queued アイテムがあれば再評価して起動
    get().processNext();
  },

  async shareAllDone() {
    const dones = get().items.filter((i) => i.status === 'done' && !i.deletionPending);
    if (dones.length === 0) {
      return { kind: 'failed-multi', error: 'no done items' };
    }

    // OPFS から並列に読み出し → arrayBuffer() で即時メモリに buffer して
    // 後続の remove()/clearCompleted() による OPFS 削除レースを防ぐ
    // (Adversarial review #4: readFromOpfs は File reference を返すだけで data は lazy
    //  読込み、share() 中に remove() で消されると iOS Photos に空ファイルが行く)。
    type ReadOk = { ok: true; blob: Blob; fileName: string };
    type ReadFail = { ok: false; error: string };
    const reads: Array<ReadOk | ReadFail> = await Promise.all(
      dones.map(async (item): Promise<ReadOk | ReadFail> => {
        if (!item.outputOpfsPath) {
          return { ok: false, error: 'no outputOpfsPath' };
        }
        try {
          const file = await readFromOpfs(item.outputOpfsPath);
          // 即時 arrayBuffer 読込みでメモリにコピー → これ以降 OPFS 削除されても OK
          const buffer = await file.arrayBuffer();
          const blob = new Blob([buffer], { type: file.type || 'video/mp4' });
          return {
            ok: true,
            blob,
            fileName: deriveShareFileName(item.fileName),
          };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const okReads = reads.filter((r): r is ReadOk => r.ok);
    if (okReads.length === 0) {
      // すべて読み出し失敗
      const firstError = reads.find((r): r is ReadFail => !r.ok)?.error ?? 'unknown';
      return { kind: 'failed-multi', error: `all reads failed: ${firstError}` };
    }

    return shareFiles(
      okReads.map((r) => r.blob),
      okReads.map((r) => r.fileName),
    );
  },

  processNext() {
    const state = get();
    const running = state.items.filter(
      (i) => (i.status === 'starting' || i.status === 'processing') &&
        (!i.deletionPending || runningAbortControllers.has(i.id)),
    ).length;

    const queued = state.items
      .filter((i) => i.status === 'queued' && !i.deletionPending && !removingItemIds.has(i.id))
      .sort((a, b) => a.addedAt - b.addedAt);

    if (queued.length === 0) {
      set({ isProcessing: running > 0 });
      return;
    }

    // per-item で limit を計算しながら起動可能なジョブを集める。
    // 例: parallelism=2 / hevcBenchSlowdown=true で queued=[hevc1, hevc2] なら
    //     hevc1 だけ起動 (limit=1)。queued=[h264a, h264b] なら 2 件起動 (limit=2)。
    const toStart: QueueItem[] = [];
    let projected = running;
    for (const item of queued) {
      const preset = findPreset(item.preset);
      // 無効プリセットの item はそのまま runJob に渡して markFailed させる。
      // limit 判定なしで通すと無限に進むため、projected は増やさない (terminal 即遷移)。
      if (!preset) {
        toStart.push(item);
        continue;
      }
      const limit = state.effectiveParallelism(preset);
      if (projected >= limit) break;
      toStart.push(item);
      projected++;
    }

    if (toStart.length === 0) {
      set({ isProcessing: running > 0 });
      return;
    }

    set({ isProcessing: true });
    for (const item of toStart) {
      const job = runJob(set, get, item);
      runningJobs.set(item.id, job);
      void job.finally(() => {
        if (runningJobs.get(item.id) === job) runningJobs.delete(item.id);
      }).catch(() => {});
    }
  },
}));

/** OPFS の削除成功を確認するまでは、削除要求と全パスを IndexedDB に残す。 */
function deleteItemData(
  id: string,
  set: typeof useQueueStore.setState,
  get: typeof useQueueStore.getState,
): Promise<void> {
  const active = removalTasks.get(id);
  if (active) return active;
  const original = get().items.find((i) => i.id === id);
  if (!original) return Promise.resolve();
  removingItemIds.add(id);
  // 同期でマークして新しいジョブ・進捗・peek・共有を止める。
  set((state) => ({ items: patchItem(state.items, id, { deletionPending: true, cleanupFailed: false }) }));
  abortRunningJob(id);
  const task = (async () => {
    try {
      const pending = get().items.find((i) => i.id === id)!;
      // この保存に失敗した場合はファイルを消さない。
      await saveQueueItem(pending);
      const running = runningJobs.get(id);
      if (running) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            running,
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('Video is still in use')), 10_000);
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      }
      // 既に走り始めた保存処理もすべて完了させる。
      await pendingSaves.get(id);
      const paths = new Set([original.inputOpfsPath, original.outputOpfsPath, outputPath(id)]);
      for (const path of paths) if (path) await deleteFromOpfs(path);
      await deleteQueueItem(id);
    } catch (error) {
      set((state) => ({ items: patchItem(state.items, id, { cleanupFailed: true }) }));
      const retained = get().items.find((i) => i.id === id);
      if (retained) await saveQueueItem(retained).catch(() => {});
      throw error;
    } finally {
      removingItemIds.delete(id);
    }
  })();
  removalTasks.set(id, task);
  void task.finally(() => {
    if (removalTasks.get(id) === task) removalTasks.delete(id);
  }).catch(() => {});
  return task;
}

// ---- 1 ジョブ実行 (store 外関数、closure で set/get を受け取る) ----

async function runJob(
  set: (
    arg:
      | Partial<QueueStoreState & QueueStoreActions>
      | ((s: QueueStoreState & QueueStoreActions) => Partial<QueueStoreState & QueueStoreActions>),
  ) => void,
  get: () => QueueStoreState & QueueStoreActions,
  item: QueueItem,
): Promise<void> {
  const preset = findPreset(item.preset);
  if (!preset) {
    await markFailed(set, get, item.id, `unknown preset: ${item.preset}`);
    return;
  }

  // queued → starting (Worker 起動前に遷移、UI 即反応のため)
  await transition(set, get, item.id, {
    status: 'starting',
    startedAt: Date.now(),
    progress: 0,
  });

  // 防御: transition の async 中に state が remove / reset で消えていれば spawn しない。
  // テスト間の leftover runJob が次の mockEnv で spawn を発火する race を防ぐ意味もある。
  const current = get().items.find((i) => i.id === item.id);
  if (!current || current.deletionPending || removingItemIds.has(item.id)) return;

  // V2.x (A1): persistent pool から worker を 1 つ acquire。
  // pool が空なら lazy spawn、parallelism 上限を超えた場合は新規 spawn (processNext 側で
  // 並列度を制御しているので通常発生しない)。
  const worker = acquireTranscodeWorker();
  const abortController = new AbortController();
  runningAbortControllers.set(item.id, abortController);

  const outPath = outputPath(item.id);

  try {
    const result: TranscodeJobResult = await runJobImpl(worker, {
      id: item.id,
      inputPath: item.inputOpfsPath,
      outputPath: outPath,
      preset,
      onStarted: () => {
        // Worker が transcode を受信して started を返した = cold-start 完了
        // starting → processing に切り替えて UI に進捗バーを表示開始させる
        void transition(set, get, item.id, { status: 'processing' });
      },
      onProgress: (percent, currentSec, totalSec, etaSec) => {
        void transition(set, get, item.id, {
          progress: percent,
          currentSec,
          etaSec,
          // totalSec は item.durationSec として使う (Worker からの確定値)
          durationSec: totalSec,
        });
      },
      signal: abortController.signal,
    });

    if (removingItemIds.has(item.id) || get().items.find((i) => i.id === item.id)?.deletionPending) return;

    if (result.kind === 'done') {
      // done 遷移: input OPFS 削除 (CLAUDE.md ハマりどころ 20)
      const cleaned = await tryDeleteFromOpfs(item.inputOpfsPath);
      await transition(set, get, item.id, {
        status: 'done',
        outputOpfsPath: outPath,
        outputSize: result.outputSize,
        durationSec: result.durationSec,
        finishedAt: Date.now(),
        progress: 100,
        // input 削除済みの目印 (UI 側で retry をグレーアウトする判定に使う)
        inputOpfsPath: cleaned ? '' : item.inputOpfsPath,
        cleanupFailed: !cleaned,
        // terminal で ephemeral フィールドをクリア
        etaSec: undefined,
        currentSec: undefined,
      });
    } else if (result.kind === 'cancelled') {
      // 中途出力を削除
      const cleaned = await tryDeleteFromOpfs(outPath);
      await transition(set, get, item.id, {
        status: 'cancelled',
        cleanupFailed: !cleaned,
        outputOpfsPath: cleaned ? undefined : outPath,
        finishedAt: Date.now(),
        etaSec: undefined,
        currentSec: undefined,
      });
    } else {
      // failed
      const cleaned = await tryDeleteFromOpfs(outPath);
      await transition(set, get, item.id, { cleanupFailed: !cleaned, outputOpfsPath: cleaned ? undefined : outPath });
      await markFailed(set, get, item.id, result.error);
    }
  } catch (err) {
    // runTranscodeJob 自体が throw した場合 (基本的には resolve するが防御)
    if (get().items.find((i) => i.id === item.id)?.deletionPending) return;
    const cleaned = await tryDeleteFromOpfs(outPath);
    await transition(set, get, item.id, { cleanupFailed: !cleaned, outputOpfsPath: cleaned ? undefined : outPath });
    await markFailed(
      set,
      get,
      item.id,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    runningAbortControllers.delete(item.id);
    // V2.x (A1): worker を pool に返却。次の transcode で再利用される (terminate しない)。
    releaseTranscodeWorker(worker);
    // 次のジョブを起動 (parallel slot が空いたかもしれない)
    get().processNext();
  }
}

async function transition(
  set: (
    arg:
      | Partial<QueueStoreState & QueueStoreActions>
      | ((s: QueueStoreState & QueueStoreActions) => Partial<QueueStoreState & QueueStoreActions>),
  ) => void,
  get: () => QueueStoreState & QueueStoreActions,
  id: string,
  patch: Partial<QueueItem>,
): Promise<void> {
  // items 内に id がまだ存在することを確認 (remove() で消えていれば no-op)
  const existing = get().items.find((i) => i.id === id);
  if (!existing || existing.deletionPending || removingItemIds.has(id)) return;

  set((state) => ({ items: patchItem(state.items, id, patch) }));

  // 永続化: 更新後の item を IndexedDB に save
  const updated = get().items.find((i) => i.id === id);
  if (updated) {
    await saveQueueItem(updated).catch(() => {
      // 永続化失敗は致命的でないので握り潰す (次回 init 時に整合性は保たれる)
    });
  }
}

async function markFailed(
  set: (
    arg:
      | Partial<QueueStoreState & QueueStoreActions>
      | ((s: QueueStoreState & QueueStoreActions) => Partial<QueueStoreState & QueueStoreActions>),
  ) => void,
  get: () => QueueStoreState & QueueStoreActions,
  id: string,
  error: string,
): Promise<void> {
  // failed variant は error フィールド必須なので discriminated union を満たすよう組み立て
  const existing = get().items.find((i) => i.id === id);
  if (!existing || existing.deletionPending || removingItemIds.has(id)) return;
  const failedItem: QueueItem = {
    ...existing,
    status: 'failed',
    error,
    finishedAt: Date.now(),
  };
  set((state) => ({
    items: state.items.map((i) => (i.id === id ? failedItem : i)),
  }));
  await saveQueueItem(failedItem).catch(() => {});
}

// findPreset を re-export しないが、Preset の型のために import を維持
export type { Preset };

/** テスト用: ストア状態を初期値に戻す。runningAbortControllers もクリア。
 * V2.x (A1): worker pool もクリアして worker leak を防ぐ。 */
export function _resetQueueStoreForTest(): void {
  for (const [, ac] of runningAbortControllers) ac.abort();
  runningAbortControllers.clear();
  runningJobs.clear();
  removalTasks.clear();
  removingItemIds.clear();
  pendingSaves.clear();
  _resetWorkerPoolForTest();
  useQueueStore.setState({
    items: [],
    parallelism: 1,
    hevcBenchSlowdown: null,
    isProcessing: false,
    initialized: false,
  });
}
