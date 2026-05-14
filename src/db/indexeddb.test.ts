// fake-indexeddb で IndexedDB を JSDOM 上に模す。
// 各テスト前に DB を完全リセットして独立した状態で開始。
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import {
  loadAllQueueItems,
  saveQueueItem,
  deleteQueueItem,
  clearAllQueueItems,
  getSetting,
  setSetting,
  _resetDbCacheForTest,
} from './indexeddb';
import type { QueueItem } from '../lib/types';

function makeItem(id: string, status: QueueItem['status'], addedAt = Date.now()): QueueItem {
  const base = {
    id,
    fileName: `${id}.mov`,
    inputSize: 100,
    inputOpfsPath: `inputs/${id}.mov`,
    progress: 0,
    preset: 'standard-hevc' as const,
    addedAt,
  };
  if (status === 'failed') {
    return { ...base, status, error: 'test error' };
  }
  return { ...base, status };
}

describe('indexeddb.ts', () => {
  beforeEach(async () => {
    // fake-indexeddb のグローバル状態を完全リセット
    Object.defineProperty(globalThis, 'indexedDB', {
      value: new (indexedDB.constructor as new () => IDBFactory)(),
      configurable: true,
      writable: true,
    });
    _resetDbCacheForTest();
  });

  describe('queue ストア', () => {
    it('空 DB で loadAllQueueItems は []', async () => {
      const items = await loadAllQueueItems();
      expect(items).toEqual([]);
    });

    it('save → loadAll で復元される', async () => {
      await saveQueueItem(makeItem('a', 'queued', 100));
      await saveQueueItem(makeItem('b', 'processing', 200));
      const items = await loadAllQueueItems();
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.id).sort()).toEqual(['a', 'b']);
    });

    it('loadAllQueueItems は addedAt 昇順', async () => {
      await saveQueueItem(makeItem('newer', 'queued', 200));
      await saveQueueItem(makeItem('older', 'queued', 100));
      const items = await loadAllQueueItems();
      expect(items.map((i) => i.id)).toEqual(['older', 'newer']);
    });

    it('同 id の save は上書き', async () => {
      await saveQueueItem(makeItem('a', 'queued', 100));
      await saveQueueItem(makeItem('a', 'done', 100));
      const items = await loadAllQueueItems();
      expect(items).toHaveLength(1);
      expect(items[0]?.status).toBe('done');
    });

    it('failed item は error フィールドも保存される', async () => {
      await saveQueueItem(makeItem('x', 'failed'));
      const items = await loadAllQueueItems();
      expect(items[0]?.status).toBe('failed');
      // discriminated union narrowing
      if (items[0]?.status === 'failed') {
        expect(items[0].error).toBe('test error');
      }
    });

    it('deleteQueueItem で該当のみ削除', async () => {
      await saveQueueItem(makeItem('a', 'queued', 100));
      await saveQueueItem(makeItem('b', 'queued', 200));
      await deleteQueueItem('a');
      const items = await loadAllQueueItems();
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe('b');
    });

    it('clearAllQueueItems で全削除', async () => {
      await saveQueueItem(makeItem('a', 'queued', 100));
      await saveQueueItem(makeItem('b', 'queued', 200));
      await clearAllQueueItems();
      expect(await loadAllQueueItems()).toEqual([]);
    });
  });

  describe('settings ストア', () => {
    it('未保存キーは undefined', async () => {
      expect(await getSetting('missing')).toBeUndefined();
    });

    it('boolean / null / object を保存・復元', async () => {
      await setSetting('hevcBenchSlowdown', true);
      expect(await getSetting('hevcBenchSlowdown')).toBe(true);

      await setSetting('hevcBenchSlowdown', null);
      expect(await getSetting('hevcBenchSlowdown')).toBeNull();

      await setSetting('preset', 'standard-hevc');
      expect(await getSetting('preset')).toBe('standard-hevc');
    });
  });
});
