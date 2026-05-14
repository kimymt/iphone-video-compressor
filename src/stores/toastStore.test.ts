// Phase 7: toastStore のユニットテスト。

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  useToastStore,
  _resetToastStoreForTest,
  DEFAULT_TOAST_DURATION_MS,
} from './toastStore';

beforeEach(() => {
  _resetToastStoreForTest();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toastStore', () => {
  it('show() でアイテムが items に追加される', () => {
    useToastStore.getState().show('hello');
    expect(useToastStore.getState().items).toHaveLength(1);
    expect(useToastStore.getState().items[0]?.message).toBe('hello');
    expect(useToastStore.getState().items[0]?.kind).toBe('info');
  });

  it('show() の kind パラメータが反映される', () => {
    useToastStore.getState().show('e', { kind: 'error' });
    useToastStore.getState().show('s', { kind: 'success' });
    const items = useToastStore.getState().items;
    expect(items.map((t) => t.kind)).toEqual(['error', 'success']);
  });

  it('show() の id は単調増加', () => {
    const id1 = useToastStore.getState().show('a');
    const id2 = useToastStore.getState().show('b');
    expect(id2).toBeGreaterThan(id1);
  });

  it('既定 duration 経過後に自動 dismiss される', () => {
    useToastStore.getState().show('temp');
    expect(useToastStore.getState().items).toHaveLength(1);
    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS - 1);
    expect(useToastStore.getState().items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().items).toHaveLength(0);
  });

  it('durationMs=0 は自動 dismiss しない', () => {
    useToastStore.getState().show('persistent', { durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(useToastStore.getState().items).toHaveLength(1);
  });

  it('カスタム duration が効く', () => {
    useToastStore.getState().show('quick', { durationMs: 500 });
    vi.advanceTimersByTime(499);
    expect(useToastStore.getState().items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().items).toHaveLength(0);
  });

  it('dismiss(id) で個別に削除', () => {
    const id1 = useToastStore.getState().show('a', { durationMs: 0 });
    useToastStore.getState().show('b', { durationMs: 0 });
    useToastStore.getState().dismiss(id1);
    expect(useToastStore.getState().items).toHaveLength(1);
    expect(useToastStore.getState().items[0]?.message).toBe('b');
  });

  it('dismiss(存在しない id) は no-op', () => {
    useToastStore.getState().show('a', { durationMs: 0 });
    useToastStore.getState().dismiss(99999);
    expect(useToastStore.getState().items).toHaveLength(1);
  });

  it('clear() で一括削除', () => {
    useToastStore.getState().show('a', { durationMs: 0 });
    useToastStore.getState().show('b', { durationMs: 0 });
    useToastStore.getState().show('c', { durationMs: 0 });
    useToastStore.getState().clear();
    expect(useToastStore.getState().items).toHaveLength(0);
  });

  it('複数 show が時系列順 (FIFO) で並ぶ', () => {
    useToastStore.getState().show('1', { durationMs: 0 });
    useToastStore.getState().show('2', { durationMs: 0 });
    useToastStore.getState().show('3', { durationMs: 0 });
    expect(useToastStore.getState().items.map((t) => t.message)).toEqual(['1', '2', '3']);
  });

  it('show は createdAt にタイムスタンプを記録', () => {
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
    useToastStore.getState().show('a');
    const createdAt = useToastStore.getState().items[0]?.createdAt;
    expect(createdAt).toBe(new Date('2026-05-15T12:00:00Z').getTime());
  });
});
