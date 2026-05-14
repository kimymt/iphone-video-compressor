// Zustand store。Phase 4a で Worker 連携 + 処理ループを追加。
// cancel/retry/share/clearCompleted/HEVC ベンチ判定は Phase 4c。

import { create } from 'zustand';
import type { QueueItem, PresetKey, Preset } from '../lib/types';
import { writeInputToOpfs, deleteFromOpfs, outputPath } from '../db/opfs';
import {
  loadAllQueueItems,
  saveQueueItem,
  deleteQueueItem,
  getSetting,
} from '../db/indexeddb';
import { hasEnoughQuota } from '../platform/storage';
import { findPreset } from '../lib/presets';
import {
  spawnTranscodeWorker as defaultSpawnTranscodeWorker,
  runTranscodeJob as defaultRunTranscodeJob,
  type TranscodeJobResult,
} from '../workers/compressor-client';

// ---- Worker factory のインジェクション (テストで差し替え可能) ----

type SpawnFn = () => Worker;
type RunFn = typeof defaultRunTranscodeJob;

let spawnWorkerImpl: SpawnFn = defaultSpawnTranscodeWorker;
let runJobImpl: RunFn = defaultRunTranscodeJob;

/** テスト用: Worker spawner と runner を差し替える。 */
export function _setWorkerImplsForTest(spawn: SpawnFn, run: RunFn): void {
  spawnWorkerImpl = spawn;
  runJobImpl = run;
}

/** テスト用: 実装をデフォルトに戻す。 */
export function _resetWorkerImplsForTest(): void {
  spawnWorkerImpl = defaultSpawnTranscodeWorker;
  runJobImpl = defaultRunTranscodeJob;
}

// ---- 進行中ジョブの管理 (zustand state には乗せない、in-memory のみ) ----

const runningAbortControllers = new Map<string, AbortController>();

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
   * 'queued' なアイテムを並列度の上限まで起動する。
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
    if (item.status === 'processing' || item.status === 'starting') {
      if (item.outputOpfsPath) {
        await deleteFromOpfs(item.outputOpfsPath).catch(() => {});
      }
      const reset: QueueItem = {
        ...item,
        status: 'queued',
        progress: 0,
        startedAt: undefined,
        outputOpfsPath: undefined,
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
    set({
      items,
      parallelism: computeParallelism(),
      hevcBenchSlowdown,
      initialized: true,
    });
    // 復元後に queued が残っていれば自動再開
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

    const addedIds: string[] = [];
    const now = Date.now();
    for (const file of files) {
      const id = crypto.randomUUID();
      let inputOpfsPath: string;
      try {
        inputOpfsPath = await writeInputToOpfs(file, id);
      } catch (err) {
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
      set((state) => ({ items: [...state.items, item] }));
    }

    // 追加直後に処理を起動
    get().processNext();
    return { ok: true, addedIds };
  },

  async remove(id) {
    // 実行中なら abort して Worker 側 cancelled を待たずに先に進む
    // (Worker は cancelled 応答後に terminate される。状態更新は items から削除されるので
    //  race で来る `cancelled` の patchItem は no-op になる。)
    abortRunningJob(id);

    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    if (item.inputOpfsPath) {
      await deleteFromOpfs(item.inputOpfsPath).catch(() => {});
    }
    if (item.outputOpfsPath) {
      await deleteFromOpfs(item.outputOpfsPath).catch(() => {});
    }
    await deleteFromOpfs(outputPath(id)).catch(() => {});
    await deleteQueueItem(id);
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
  },

  processNext() {
    const state = get();
    const running = state.items.filter(
      (i) => i.status === 'starting' || i.status === 'processing',
    ).length;
    const slots = state.parallelism - running;
    if (slots <= 0) {
      // 余裕がなくても isProcessing フラグは管理しておく
      set({ isProcessing: running > 0 });
      return;
    }

    const nextItems = state.items
      .filter((i) => i.status === 'queued')
      .sort((a, b) => a.addedAt - b.addedAt)
      .slice(0, slots);

    if (nextItems.length === 0) {
      set({ isProcessing: running > 0 });
      return;
    }

    set({ isProcessing: true });
    for (const item of nextItems) {
      void runJob(set, get, item);
    }
  },
}));

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
  if (!get().items.find((i) => i.id === item.id)) return;

  const worker = spawnWorkerImpl();
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
      onProgress: (percent) => {
        void transition(set, get, item.id, { progress: percent });
      },
      signal: abortController.signal,
    });

    if (result.kind === 'done') {
      // done 遷移: input OPFS 削除 (CLAUDE.md ハマりどころ 20)
      await deleteFromOpfs(item.inputOpfsPath).catch(() => {});
      await transition(set, get, item.id, {
        status: 'done',
        outputOpfsPath: outPath,
        outputSize: result.outputSize,
        durationSec: result.durationSec,
        finishedAt: Date.now(),
        progress: 100,
        // input 削除済みの目印 (UI 側で retry をグレーアウトする判定に使う)
        inputOpfsPath: '',
      });
    } else if (result.kind === 'cancelled') {
      // 中途出力を削除
      await deleteFromOpfs(outPath).catch(() => {});
      await transition(set, get, item.id, {
        status: 'cancelled',
        finishedAt: Date.now(),
      });
    } else {
      // failed
      await deleteFromOpfs(outPath).catch(() => {});
      await markFailed(set, get, item.id, result.error);
    }
  } catch (err) {
    // runTranscodeJob 自体が throw した場合 (基本的には resolve するが防御)
    await deleteFromOpfs(outPath).catch(() => {});
    await markFailed(
      set,
      get,
      item.id,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    runningAbortControllers.delete(item.id);
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
  if (!existing) return;

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
  if (!existing) return;
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

/** テスト用: ストア状態を初期値に戻す。runningAbortControllers もクリア。 */
export function _resetQueueStoreForTest(): void {
  for (const [, ac] of runningAbortControllers) ac.abort();
  runningAbortControllers.clear();
  useQueueStore.setState({
    items: [],
    parallelism: 1,
    hevcBenchSlowdown: null,
    isProcessing: false,
    initialized: false,
  });
}
