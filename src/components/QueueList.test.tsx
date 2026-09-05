// Phase 4b: QueueList の空状態と要素レンダリングを検証。
// Phase 4c: terminal アイテムがあるときに「完了をすべて削除」ボタンが表示される。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import QueueList from './QueueList';
import { useQueueStore } from '../stores/queueStore';
import { useToastStore } from '../stores/toastStore';
import type { QueueItem } from '../lib/types';

function makeItem(id: string, status: QueueItem['status'], addedAt: number): QueueItem {
  const base = {
    id,
    fileName: `${id}.mov`,
    inputSize: 1024,
    inputOpfsPath: `inputs/${id}.mov`,
    progress: 0,
    preset: 'standard-hevc' as const,
    addedAt,
  };
  if (status === 'failed') return { ...base, status, error: 'err' };
  return { ...base, status };
}

beforeEach(() => {
  vi.spyOn(useQueueStore.getState(), 'cancel').mockResolvedValue(undefined);
  vi.spyOn(useQueueStore.getState(), 'remove').mockResolvedValue(undefined);
  vi.spyOn(useQueueStore.getState(), 'retry').mockResolvedValue(undefined);
  vi.spyOn(useQueueStore.getState(), 'clearCompleted').mockResolvedValue(undefined);
  vi.spyOn(useQueueStore.getState(), 'shareAllDone').mockResolvedValue({ kind: 'shared' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QueueList', () => {
  it('items=[] で empty state を表示', () => {
    render(<QueueList items={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText(/まだ何もありません/)).toBeInTheDocument();
    expect(screen.getByText(/動画を選択/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('items に要素があれば <ul role="list"> + QueueItem を描画', () => {
    render(
      <QueueList
        items={[
          makeItem('a', 'queued', 100),
          makeItem('b', 'processing', 200),
          makeItem('c', 'done', 300),
        ]}
      />,
    );
    const ul = screen.getByRole('list');
    expect(ul).toHaveAttribute('aria-label', '圧縮キュー');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  it('addedAt 昇順で並ぶ (古い順)', () => {
    render(
      <QueueList
        items={[
          makeItem('newer', 'queued', 300),
          makeItem('oldest', 'queued', 100),
          makeItem('middle', 'queued', 200),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    const labels = items.map((el) => el.getAttribute('aria-label'));
    expect(labels[0]).toContain('oldest.mov');
    expect(labels[1]).toContain('middle.mov');
    expect(labels[2]).toContain('newer.mov');
  });

  it('混在ステータス: data-status 属性が個別に正しい', () => {
    render(
      <QueueList
        items={[
          makeItem('q', 'queued', 1),
          makeItem('p', 'processing', 2),
          makeItem('d', 'done', 3),
          makeItem('f', 'failed', 4),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-status', 'queued');
    expect(items[1]).toHaveAttribute('data-status', 'processing');
    expect(items[2]).toHaveAttribute('data-status', 'done');
    expect(items[3]).toHaveAttribute('data-status', 'failed');
  });
});

describe('QueueList — 完了をすべて削除ボタン (Phase 4c)', () => {
  it('terminal アイテムが 0 件ならボタンは表示しない', () => {
    render(
      <QueueList
        items={[
          makeItem('q', 'queued', 1),
          makeItem('p', 'processing', 2),
        ]}
      />,
    );
    expect(screen.queryByTestId('clear-completed')).toBeNull();
  });

  it('done が 1 件あればボタン表示 + 件数 1', () => {
    render(
      <QueueList
        items={[
          makeItem('q', 'queued', 1),
          makeItem('d', 'done', 2),
        ]}
      />,
    );
    const btn = screen.getByTestId('clear-completed');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('完了をすべて削除 (1)');
  });

  it('done / failed / cancelled の合計を件数として表示', () => {
    render(
      <QueueList
        items={[
          makeItem('d', 'done', 1),
          makeItem('f', 'failed', 2),
          makeItem('c', 'cancelled', 3),
          makeItem('q', 'queued', 4),
          makeItem('p', 'processing', 5),
        ]}
      />,
    );
    expect(screen.getByTestId('clear-completed')).toHaveTextContent('完了をすべて削除 (3)');
  });

  it('ボタンタップで queueStore.clearCompleted() が呼ばれる', async () => {
    const spy = vi.spyOn(useQueueStore.getState(), 'clearCompleted');
    render(
      <QueueList
        items={[makeItem('d', 'done', 1), makeItem('q', 'queued', 2)]}
      />,
    );
    await act(async () => { fireEvent.click(screen.getByTestId('clear-completed')); });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('aria-label に件数が含まれる', () => {
    render(
      <QueueList
        items={[makeItem('d', 'done', 1), makeItem('f', 'failed', 2)]}
      />,
    );
    const btn = screen.getByTestId('clear-completed');
    expect(btn).toHaveAttribute('aria-label', '完了したアイテム 2 件をすべて削除');
  });
});

describe('QueueList — V2: 完了をすべて保存ボタン', () => {
  it('done が 0 件なら保存ボタンは表示しない (failed/cancelled だけでは出さない)', () => {
    render(
      <QueueList
        items={[
          makeItem('q', 'queued', 1),
          makeItem('f', 'failed', 2),
          makeItem('c', 'cancelled', 3),
        ]}
      />,
    );
    expect(screen.queryByTestId('save-all-done')).toBeNull();
    // 削除ボタンは出る (failed + cancelled = 2 件)
    expect(screen.getByTestId('clear-completed')).toBeInTheDocument();
  });

  it('done が 1 件以上で保存ボタン表示 + 件数', () => {
    render(
      <QueueList
        items={[
          makeItem('d1', 'done', 1),
          makeItem('d2', 'done', 2),
          makeItem('f', 'failed', 3),
        ]}
      />,
    );
    const btn = screen.getByTestId('save-all-done');
    expect(btn).toBeInTheDocument();
    // done だけカウント (failed は含めない)
    expect(btn).toHaveTextContent('完了をすべて保存 (2)');
  });

  it('保存ボタンタップで shareAllDone() が呼ばれる', async () => {
    const spy = vi.spyOn(useQueueStore.getState(), 'shareAllDone');
    render(<QueueList items={[makeItem('d', 'done', 1)]} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-all-done'));
      // finally の setSavingAll(false) が flush するまで待つ
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('aria-label に done 件数', () => {
    render(
      <QueueList
        items={[
          makeItem('d1', 'done', 1),
          makeItem('d2', 'done', 2),
          makeItem('d3', 'done', 3),
        ]}
      />,
    );
    expect(screen.getByTestId('save-all-done')).toHaveAttribute(
      'aria-label',
      '完了したアイテム 3 件をすべて保存',
    );
  });

  it('保存ボタンは削除ボタンより先 (左) に並ぶ', () => {
    render(
      <QueueList
        items={[makeItem('d', 'done', 1), makeItem('f', 'failed', 2)]}
      />,
    );
    const saveBtn = screen.getByTestId('save-all-done');
    const clearBtn = screen.getByTestId('clear-completed');
    // DOM 順で save が先
    const cmp = saveBtn.compareDocumentPosition(clearBtn);
    expect(cmp & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});


it('一括削除の失敗を通知し、再試行できる', async () => {
  vi.spyOn(useQueueStore.getState(), 'clearCompleted').mockRejectedValueOnce(new Error('locked'));
  const toast = vi.spyOn(useToastStore.getState(), 'show');
  render(<QueueList items={[makeItem('locked', 'cancelled', 1)]} />);
  await act(async () => { fireEvent.click(screen.getByTestId('clear-completed')); });
  expect(toast).toHaveBeenCalledWith(expect.stringContaining('端末内に残っている可能性'), { kind: 'error' });
  expect(screen.getByTestId('clear-completed')).toBeEnabled();
});
