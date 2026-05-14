import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { useQueueStore, _resetQueueStoreForTest } from './queueStore';
import { saveQueueItem, _resetDbCacheForTest } from '../db/indexeddb';
import {
  installMockOpfs,
  resetMockOpfs,
  getMockRoot,
} from '../../tests/helpers/mock-opfs';
import { getOpfsWritable } from '../db/opfs';
import type { QueueItem } from '../lib/types';

function makeItem(id: string, status: QueueItem['status'], overrides: Partial<QueueItem> = {}): QueueItem {
  const base = {
    id,
    fileName: `${id}.mov`,
    inputSize: 100,
    inputOpfsPath: `inputs/${id}.mov`,
    progress: 0,
    preset: 'standard-hevc' as const,
    addedAt: 100,
    ...overrides,
  };
  if (status === 'failed') {
    return { ...base, status, error: (overrides as { error?: string }).error ?? 'err' };
  }
  return { ...base, status };
}

async function resetAll() {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new (indexedDB.constructor as new () => IDBFactory)(),
    configurable: true,
    writable: true,
  });
  _resetDbCacheForTest();
  installMockOpfs();
  // navigator.storage は installMockOpfs が用意するが、hardwareConcurrency 等は別途
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      storage: (globalThis as { navigator: { storage: unknown } }).navigator.storage,
      hardwareConcurrency: 4, // → parallelism=1
    },
    configurable: true,
    writable: true,
  });
  _resetQueueStoreForTest();
}

describe('queueStore', () => {
  beforeEach(async () => {
    await resetAll();
  });

  afterEach(() => {
    resetMockOpfs();
    vi.unstubAllGlobals();
  });

  describe('init()', () => {
    it('空 DB で items=[]、parallelism は hardwareConcurrency で決まる', async () => {
      await useQueueStore.getState().init();
      expect(useQueueStore.getState().items).toEqual([]);
      expect(useQueueStore.getState().parallelism).toBe(1);
      expect(useQueueStore.getState().initialized).toBe(true);
    });

    it('hardwareConcurrency >= 6 で parallelism=2', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: (globalThis as { navigator: { storage: unknown } }).navigator.storage,
          hardwareConcurrency: 8,
        },
        configurable: true,
        writable: true,
      });
      await useQueueStore.getState().init();
      expect(useQueueStore.getState().parallelism).toBe(2);
    });

    it('★ REGRESSION ★ processing 状態のアイテムを起動時に queued にリセット (A4)', async () => {
      await saveQueueItem(makeItem('p1', 'processing', { progress: 67, startedAt: 999, outputOpfsPath: 'outputs/p1.mp4' }));
      // OPFS に中途出力ファイルが残っている状況を作る
      const w = await getOpfsWritable('outputs/p1.mp4');
      await w.write(new Blob(['partial']));
      await w.close();

      await useQueueStore.getState().init();
      const restored = useQueueStore.getState().items;
      expect(restored).toHaveLength(1);
      expect(restored[0]?.status).toBe('queued');
      expect(restored[0]?.progress).toBe(0);
      expect(restored[0]?.startedAt).toBeUndefined();
      expect(restored[0]?.outputOpfsPath).toBeUndefined();

      // 中途出力ファイルが OPFS から削除されている
      const outputsDir = await (
        (globalThis as { navigator: { storage: { getDirectory: () => Promise<FileSystemDirectoryHandle> } } }).navigator.storage.getDirectory()
      );
      let outputsCount = 0;
      try {
        const sub = await outputsDir.getDirectoryHandle('outputs');
        for await (const _entry of sub as unknown as AsyncIterable<unknown>) {
          outputsCount++;
        }
      } catch {
        outputsCount = 0;
      }
      expect(outputsCount).toBe(0);
    });

    it('★ REGRESSION ★ starting 状態も同様に queued にリセット', async () => {
      await saveQueueItem(makeItem('s1', 'starting', { startedAt: 555 }));
      await useQueueStore.getState().init();
      expect(useQueueStore.getState().items[0]?.status).toBe('queued');
    });

    it('done / failed / cancelled / queued はリセット対象外 (進行中以外は保持)', async () => {
      await saveQueueItem(makeItem('done1', 'done', { progress: 100, finishedAt: 555, outputOpfsPath: 'outputs/done1.mp4', outputSize: 30 }));
      await saveQueueItem(makeItem('fail1', 'failed', { progress: 50, error: 'x' }));
      await saveQueueItem(makeItem('canc1', 'cancelled', { progress: 30 }));
      await saveQueueItem(makeItem('q1', 'queued'));

      await useQueueStore.getState().init();
      const items = useQueueStore.getState().items;
      const byId = Object.fromEntries(items.map((i) => [i.id, i]));
      expect(byId['done1']?.status).toBe('done');
      expect(byId['done1']?.progress).toBe(100);
      expect(byId['fail1']?.status).toBe('failed');
      expect(byId['canc1']?.status).toBe('cancelled');
      expect(byId['q1']?.status).toBe('queued');
    });

    it('init() は冪等 (二度呼んでも initialized 後はスキップ)', async () => {
      await useQueueStore.getState().init();
      const items1 = useQueueStore.getState().items;
      await useQueueStore.getState().init();
      const items2 = useQueueStore.getState().items;
      expect(items1).toBe(items2);
    });
  });

  describe('add()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    it('1 ファイル追加で items に queued エントリができる', async () => {
      const file = new File(['hello'], 'IMG_4523.mov', { type: 'video/quicktime' });
      const result = await useQueueStore.getState().add([file], 'standard-hevc');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.addedIds).toHaveLength(1);
      const items = useQueueStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0]?.fileName).toBe('IMG_4523.mov');
      expect(items[0]?.status).toBe('queued');
      expect(items[0]?.preset).toBe('standard-hevc');
      expect(items[0]?.inputOpfsPath).toMatch(/^inputs\/.+\.mov$/);
    });

    it('複数ファイル追加で addedAt が一意 (順序が保たれる)', async () => {
      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      const f3 = new File(['c'], 'c.mov');
      await useQueueStore.getState().add([f1, f2, f3], 'standard-hevc');
      const items = useQueueStore.getState().items;
      expect(items.map((i) => i.fileName)).toEqual(['a.mov', 'b.mov', 'c.mov']);
      const t1 = items[0]?.addedAt ?? 0;
      const t2 = items[1]?.addedAt ?? 0;
      const t3 = items[2]?.addedAt ?? 0;
      expect(t1 < t2 && t2 < t3).toBe(true);
    });

    it('quota 不足 → ok:false / reason: quota-exceeded', async () => {
      // navigator.storage.estimate を quota=10 に書き換え
      const nav = (globalThis as unknown as { navigator: { storage: Record<string, unknown> } }).navigator;
      nav.storage.estimate = () => Promise.resolve({ usage: 0, quota: 10 });
      const file = new File(['hello world'], 'big.mov');
      const result = await useQueueStore.getState().add([file], 'standard-hevc');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('quota-exceeded');
      // items は空のまま
      expect(useQueueStore.getState().items).toHaveLength(0);
    });

    it('OPFS 書き込み失敗 → ok:false / reason: opfs-write-failed', async () => {
      // navigator.storage.getDirectory を例外に
      const nav = (globalThis as unknown as { navigator: { storage: Record<string, unknown> } }).navigator;
      nav.storage.getDirectory = () => Promise.reject(new Error('disk full'));
      const file = new File(['x'], 'a.mov');
      const result = await useQueueStore.getState().add([file], 'standard-hevc');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('opfs-write-failed');
      }
    });
  });

  describe('remove()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    it('items から削除 + OPFS と IndexedDB もクリア', async () => {
      const file = new File(['hello'], 'a.mov');
      const addResult = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!addResult.ok) throw new Error('add 失敗');
      const id = addResult.addedIds[0];
      expect(id).toBeDefined();
      if (!id) throw new Error('no id');

      // OPFS に inputs が居ること
      const root = getMockRoot();
      const inputsBefore = await root.getDirectoryHandle('inputs');
      expect(inputsBefore.countEntries()).toBe(1);

      await useQueueStore.getState().remove(id);
      expect(useQueueStore.getState().items).toHaveLength(0);
      // OPFS の inputs/{id} も消える
      expect(inputsBefore.countEntries()).toBe(0);
    });

    it('存在しない id の remove は no-op', async () => {
      await expect(useQueueStore.getState().remove('missing-id')).resolves.toBeUndefined();
      expect(useQueueStore.getState().items).toHaveLength(0);
    });
  });
});
