// Zustand store。Phase 2 では init/add/remove のみ実装。
// cancel/retry/clearCompleted/share/effectiveParallelism は Phase 4 以降。

import { create } from 'zustand';
import type { QueueItem, PresetKey } from '../lib/types';
import {
  writeInputToOpfs,
  deleteFromOpfs,
  outputPath,
} from '../db/opfs';
import {
  loadAllQueueItems,
  saveQueueItem,
  deleteQueueItem,
  getSetting,
} from '../db/indexeddb';
import { hasEnoughQuota } from '../platform/storage';

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
};

export type AddResult =
  | { ok: true; addedIds: string[] }
  | { ok: false; reason: 'quota-exceeded'; required: number; available: number }
  | { ok: false; reason: 'opfs-write-failed'; error: string };

function computeParallelism(): 1 | 2 {
  if (typeof navigator === 'undefined' || !navigator.hardwareConcurrency) return 1;
  return navigator.hardwareConcurrency >= 6 ? 2 : 1;
}

/**
 * A4 で決定したリセットロジック:
 * status === 'processing' || 'starting' のアイテムを 'queued' に戻し、
 * progress=0、startedAt=undefined、outputOpfsPath を OPFS から削除。
 */
async function resetInProgressItems(items: QueueItem[]): Promise<QueueItem[]> {
  const resetItems: QueueItem[] = [];
  for (const item of items) {
    if (item.status === 'processing' || item.status === 'starting') {
      // 中途出力ファイルがあれば削除
      if (item.outputOpfsPath) {
        await deleteFromOpfs(item.outputOpfsPath).catch(() => {
          // 削除失敗は致命的でない、ログのみ
        });
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
  },

  async add(files, preset) {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const okQuota = await hasEnoughQuota(totalSize);
    if (!okQuota) {
      return {
        ok: false,
        reason: 'quota-exceeded',
        required: Math.ceil(totalSize * 2.5),
        available: 0, // UI 側で getStorageInfo を呼んで詳細表示する
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
        addedAt: now + addedIds.length, // ファイル順を保つ
        status: 'queued',
      };
      await saveQueueItem(item);
      addedIds.push(id);
      set((state) => ({ items: [...state.items, item] }));
    }

    return { ok: true, addedIds };
  },

  async remove(id) {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    // OPFS から入力と出力を削除
    if (item.inputOpfsPath) {
      await deleteFromOpfs(item.inputOpfsPath).catch(() => {});
    }
    if (item.outputOpfsPath) {
      await deleteFromOpfs(item.outputOpfsPath).catch(() => {});
    }
    // outputs/{id}.mp4 も念のため (まだ outputOpfsPath をセットしてなくても残る可能性)
    await deleteFromOpfs(outputPath(id)).catch(() => {});
    await deleteQueueItem(id);
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
  },
}));

/** テスト用: ストア状態を初期値に戻す */
export function _resetQueueStoreForTest(): void {
  useQueueStore.setState({
    items: [],
    parallelism: 1,
    hevcBenchSlowdown: null,
    isProcessing: false,
    initialized: false,
  });
}
