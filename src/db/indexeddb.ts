// IndexedDB ラッパ (idb)。QueueItem のメタ情報のみを永続化。
// 動画本体は OPFS に置き、こちらにはパス参照のみ。

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { QueueItem } from '../lib/types';

const DB_NAME = 'movie-compresser';
const DB_VERSION = 1;

interface MovieDBSchema extends DBSchema {
  queue: {
    key: string;
    value: QueueItem;
    indexes: { 'by-addedAt': number };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<MovieDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<MovieDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<MovieDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queue')) {
          const store = db.createObjectStore('queue', { keyPath: 'id' });
          store.createIndex('by-addedAt', 'addedAt');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

/** テスト用: DB ハンドルキャッシュをリセット (fake-indexeddb のリセットと併用) */
export function _resetDbCacheForTest(): void {
  dbPromise = null;
}

export async function loadAllQueueItems(): Promise<QueueItem[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('queue', 'by-addedAt');
  return all;
}

export async function saveQueueItem(item: QueueItem): Promise<void> {
  const db = await getDb();
  await db.put('queue', item);
}

export async function deleteQueueItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('queue', id);
}

export async function clearAllQueueItems(): Promise<void> {
  const db = await getDb();
  await db.clear('queue');
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get('settings', key)) as T | undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put('settings', value, key);
}
