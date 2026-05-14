// Phase 4b: QueueList の空状態と要素レンダリングを検証。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import QueueList from './QueueList';
import { useQueueStore } from '../stores/queueStore';
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
