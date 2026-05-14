// Phase 5: installSideEffects のテスト。
// queueStore は実体を使い、wakeLockAcquire / wakeLockRelease / playDoneSound のみ mock。
// 状態遷移を setState で直接シミュレートして effect が呼ばれることを確認。

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { installSideEffects } from './sideEffects';
import { useQueueStore, _resetQueueStoreForTest } from './queueStore';
import { _resetDbCacheForTest } from '../db/indexeddb';
import { installMockOpfs, resetMockOpfs } from '../../tests/helpers/mock-opfs';
import type { QueueItem } from '../lib/types';

function makeItem(id: string, status: QueueItem['status'], overrides: Partial<QueueItem> = {}): QueueItem {
  const base = {
    id,
    fileName: `${id}.mov`,
    inputSize: 100,
    inputOpfsPath: `inputs/${id}.mov`,
    progress: status === 'done' ? 100 : 0,
    preset: 'standard-hevc' as const,
    addedAt: 100,
    ...overrides,
  };
  if (status === 'failed') return { ...base, status, error: 'err' };
  return { ...base, status };
}

async function resetAll(): Promise<void> {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new (indexedDB.constructor as new () => IDBFactory)(),
    configurable: true,
    writable: true,
  });
  _resetDbCacheForTest();
  installMockOpfs();
  _resetQueueStoreForTest();
}

describe('installSideEffects', () => {
  let acquireSpy: ReturnType<typeof vi.fn>;
  let releaseSpy: ReturnType<typeof vi.fn>;
  let soundSpy: ReturnType<typeof vi.fn>;
  let unsubscribe: (() => void) | null = null;

  beforeEach(async () => {
    await resetAll();
    acquireSpy = vi.fn(async () => undefined);
    releaseSpy = vi.fn(async () => undefined);
    soundSpy = vi.fn(async () => undefined);
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = null;
    resetMockOpfs();
  });

  function install(): void {
    unsubscribe = installSideEffects({
      wakeLockAcquire: acquireSpy,
      wakeLockRelease: releaseSpy,
      playDoneSound: soundSpy,
    });
  }

  it('isProcessing false→true で wakeLockAcquire を呼ぶ', () => {
    install();
    expect(acquireSpy).not.toHaveBeenCalled();
    useQueueStore.setState({ isProcessing: true });
    expect(acquireSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('isProcessing true→false で wakeLockRelease を呼ぶ', () => {
    install();
    useQueueStore.setState({ isProcessing: true });
    useQueueStore.setState({ isProcessing: false });
    expect(acquireSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
  });

  it('isProcessing が同値のまま変化しても acquire/release は呼ばれない', () => {
    install();
    useQueueStore.setState({ items: [] }); // 他フィールドの変更
    useQueueStore.setState({ items: [makeItem('a', 'queued')] });
    expect(acquireSpy).not.toHaveBeenCalled();
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('item が queued→done に遷移すると playDoneSound が 1 回呼ばれる', () => {
    install();
    useQueueStore.setState({ items: [makeItem('a', 'queued')] });
    expect(soundSpy).not.toHaveBeenCalled();
    useQueueStore.setState({ items: [makeItem('a', 'done', { outputSize: 50 })] });
    expect(soundSpy).toHaveBeenCalledTimes(1);
  });

  it('done のまま追加 update があっても重複再生しない', () => {
    install();
    useQueueStore.setState({ items: [makeItem('a', 'done', { outputSize: 50 })] });
    expect(soundSpy).toHaveBeenCalledTimes(1);
    // 他フィールドだけ更新
    useQueueStore.setState({
      items: [makeItem('a', 'done', { outputSize: 50, finishedAt: 999 })],
    });
    expect(soundSpy).toHaveBeenCalledTimes(1);
  });

  it('初期 state に既に done が含まれていても再生しない (初回スナップショット扱い)', () => {
    useQueueStore.setState({ items: [makeItem('a', 'done', { outputSize: 50 })] });
    install();
    // 同じ item を更新
    useQueueStore.setState({
      items: [makeItem('a', 'done', { outputSize: 50, finishedAt: 999 })],
    });
    expect(soundSpy).not.toHaveBeenCalled();
  });

  it('複数 item が同時に done になれば各々鳴る', () => {
    install();
    useQueueStore.setState({
      items: [makeItem('a', 'queued'), makeItem('b', 'queued')],
    });
    useQueueStore.setState({
      items: [
        makeItem('a', 'done', { outputSize: 50 }),
        makeItem('b', 'done', { outputSize: 60 }),
      ],
    });
    expect(soundSpy).toHaveBeenCalledTimes(2);
  });

  it('done になった item が remove された後で再 add → done で再度鳴る', () => {
    install();
    useQueueStore.setState({ items: [makeItem('a', 'done', { outputSize: 50 })] });
    expect(soundSpy).toHaveBeenCalledTimes(1);
    // remove
    useQueueStore.setState({ items: [] });
    // 同じ id で再投入 → queued → done
    useQueueStore.setState({ items: [makeItem('a', 'queued')] });
    useQueueStore.setState({ items: [makeItem('a', 'done', { outputSize: 70 })] });
    expect(soundSpy).toHaveBeenCalledTimes(2);
  });

  it('failed / cancelled では鳴らない', () => {
    install();
    useQueueStore.setState({ items: [makeItem('a', 'queued')] });
    useQueueStore.setState({ items: [makeItem('a', 'failed', { error: 'x' })] });
    useQueueStore.setState({ items: [makeItem('b', 'cancelled')] });
    expect(soundSpy).not.toHaveBeenCalled();
  });

  it('unsubscribe を呼ぶと以降の遷移には反応しない', () => {
    install();
    unsubscribe?.();
    unsubscribe = null;
    useQueueStore.setState({ isProcessing: true });
    useQueueStore.setState({ items: [makeItem('a', 'done', { outputSize: 50 })] });
    expect(acquireSpy).not.toHaveBeenCalled();
    expect(soundSpy).not.toHaveBeenCalled();
  });
});
