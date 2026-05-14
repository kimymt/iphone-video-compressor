// Phase 4b: QueueItem の 6 ステータス UI / 副次テキスト / アクションボタンを検証。
// queueStore の cancel / remove メソッドは vi.spyOn で監視するだけで実体は走らせない。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import QueueItemRow from './QueueItem';
import { useQueueStore } from '../stores/queueStore';
import type { QueueItem } from '../lib/types';

function makeItem(status: QueueItem['status'], overrides: Partial<QueueItem> = {}): QueueItem {
  const base = {
    id: 'item-1',
    fileName: 'IMG_4523.mov',
    inputSize: 10 * 1024 * 1024, // 10 MB
    inputOpfsPath: 'inputs/item-1.mov',
    progress: 0,
    preset: 'standard-hevc' as const,
    addedAt: 1000,
    ...overrides,
  };
  if (status === 'failed') {
    return { ...base, status, error: (overrides as { error?: string }).error ?? 'unsupported codec' };
  }
  return { ...base, status };
}

beforeEach(() => {
  // queueStore の関数を mock。実体は呼ばない。
  vi.spyOn(useQueueStore.getState(), 'cancel').mockResolvedValue(undefined);
  vi.spyOn(useQueueStore.getState(), 'remove').mockResolvedValue(undefined);
  vi.spyOn(useQueueStore.getState(), 'retry').mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QueueItem — レンダリング (6 ステータス)', () => {
  it('queued: Clock アイコン + 「キュー待ち」 + Remove + Cancel', () => {
    render(<QueueItemRow item={makeItem('queued')} />);
    expect(screen.getByText(/キュー待ち/)).toBeInTheDocument();
    expect(screen.getByLabelText(/削除/)).toBeInTheDocument();
    expect(screen.getByLabelText(/処理を中止/)).toBeInTheDocument();
  });

  it('starting: Loader + 「開始中…」 + Cancel (remove 非表示)', () => {
    render(<QueueItemRow item={makeItem('starting')} />);
    expect(screen.getByText(/開始中…/)).toBeInTheDocument();
    expect(screen.getByLabelText(/処理を中止/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/削除/)).toBeNull();
  });

  it('processing: ProgressBar + percent + Cancel (remove 非表示)', () => {
    render(<QueueItemRow item={makeItem('processing', { progress: 67 })} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-valuenow', '67');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByLabelText(/処理を中止/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/削除/)).toBeNull();
  });

  it('processing: etaSec があれば残り時間を表示', () => {
    render(
      <QueueItemRow item={makeItem('processing', { progress: 50, etaSec: 90 })} />,
    );
    // 90 秒 → "1:30"
    expect(screen.getByText(/残り 1:30/)).toBeInTheDocument();
  });

  it('processing: etaSec=null なら ETA 行は出さない', () => {
    render(
      <QueueItemRow item={makeItem('processing', { progress: 30, etaSec: null })} />,
    );
    expect(screen.queryByText(/残り/)).toBeNull();
  });

  it('done: CheckCircle2 + 圧縮率 + Remove (cancel 非表示)', () => {
    render(
      <QueueItemRow
        item={makeItem('done', {
          progress: 100,
          inputOpfsPath: '',
          outputOpfsPath: 'outputs/item-1.mp4',
          outputSize: 2 * 1024 * 1024, // 2 MB
          finishedAt: 2000,
        })}
      />,
    );
    // 10 MB → 2 MB = 20%
    expect(screen.getByText(/10\.0 MB → 2\.0 MB \(20%\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/削除/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/処理を中止/)).toBeNull();
  });

  it('failed: AlertTriangle + エラーメッセージ + Retry + Remove', () => {
    render(<QueueItemRow item={makeItem('failed', { error: 'unsupported codec' })} />);
    expect(screen.getByText('unsupported codec')).toBeInTheDocument();
    expect(screen.getByLabelText(/削除/)).toBeInTheDocument();
    expect(screen.getByLabelText(/再試行/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/処理を中止/)).toBeNull();
  });

  it('cancelled: XCircle + キャンセル済み + Retry + Remove', () => {
    render(<QueueItemRow item={makeItem('cancelled')} />);
    expect(screen.getByText(/キャンセル済み/)).toBeInTheDocument();
    expect(screen.getByLabelText(/削除/)).toBeInTheDocument();
    expect(screen.getByLabelText(/再試行/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/処理を中止/)).toBeNull();
  });
});

describe('QueueItem — アクション', () => {
  it('Cancel ボタンタップで queueStore.cancel(id) を呼ぶ', () => {
    const cancelSpy = vi.spyOn(useQueueStore.getState(), 'cancel');
    render(<QueueItemRow item={makeItem('processing', { progress: 30 })} />);
    fireEvent.click(screen.getByLabelText(/処理を中止/));
    expect(cancelSpy).toHaveBeenCalledWith('item-1');
  });

  it('Remove ボタンタップで queueStore.remove(id) を呼ぶ', () => {
    const removeSpy = vi.spyOn(useQueueStore.getState(), 'remove');
    render(<QueueItemRow item={makeItem('done', { outputSize: 100 })} />);
    fireEvent.click(screen.getByLabelText(/削除/));
    expect(removeSpy).toHaveBeenCalledWith('item-1');
  });

  it('queued の Cancel と Remove はどちらも有効', () => {
    const cancelSpy = vi.spyOn(useQueueStore.getState(), 'cancel');
    const removeSpy = vi.spyOn(useQueueStore.getState(), 'remove');
    render(<QueueItemRow item={makeItem('queued')} />);
    fireEvent.click(screen.getByLabelText(/処理を中止/));
    fireEvent.click(screen.getByLabelText(/削除/));
    expect(cancelSpy).toHaveBeenCalledWith('item-1');
    expect(removeSpy).toHaveBeenCalledWith('item-1');
  });

  it('failed の Retry ボタンタップで queueStore.retry(id) を呼ぶ', () => {
    const retrySpy = vi.spyOn(useQueueStore.getState(), 'retry');
    render(<QueueItemRow item={makeItem('failed', { error: 'x' })} />);
    fireEvent.click(screen.getByLabelText(/再試行/));
    expect(retrySpy).toHaveBeenCalledWith('item-1');
  });

  it('cancelled の Retry ボタンタップでも queueStore.retry(id) を呼ぶ', () => {
    const retrySpy = vi.spyOn(useQueueStore.getState(), 'retry');
    render(<QueueItemRow item={makeItem('cancelled')} />);
    fireEvent.click(screen.getByLabelText(/再試行/));
    expect(retrySpy).toHaveBeenCalledWith('item-1');
  });

  it('inputOpfsPath="" の failed で Retry は disabled、click でも retry は呼ばれない', () => {
    const retrySpy = vi.spyOn(useQueueStore.getState(), 'retry');
    render(<QueueItemRow item={makeItem('failed', { error: 'x', inputOpfsPath: '' })} />);
    const btn = screen.getByLabelText(/再試行/);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(retrySpy).not.toHaveBeenCalled();
  });

  it('done では Retry ボタンは表示されない', () => {
    render(<QueueItemRow item={makeItem('done', { outputSize: 100, inputOpfsPath: '' })} />);
    expect(screen.queryByLabelText(/再試行/)).toBeNull();
  });

  it('processing / queued / starting では Retry ボタンは表示されない', () => {
    const { unmount: u1 } = render(<QueueItemRow item={makeItem('queued')} />);
    expect(screen.queryByLabelText(/再試行/)).toBeNull();
    u1();
    const { unmount: u2 } = render(<QueueItemRow item={makeItem('starting')} />);
    expect(screen.queryByLabelText(/再試行/)).toBeNull();
    u2();
    render(<QueueItemRow item={makeItem('processing', { progress: 30 })} />);
    expect(screen.queryByLabelText(/再試行/)).toBeNull();
  });
});

describe('QueueItem — a11y', () => {
  it('aria-label にファイル名 + ステータス + 進捗が含まれる', () => {
    render(<QueueItemRow item={makeItem('processing', { progress: 42 })} />);
    const li = screen.getByRole('listitem');
    expect(li).toHaveAttribute(
      'aria-label',
      expect.stringContaining('IMG_4523.mov'),
    );
    expect(li).toHaveAttribute('aria-label', expect.stringContaining('処理中'));
    expect(li).toHaveAttribute('aria-label', expect.stringContaining('42%'));
  });

  it('全ステータスで listitem role を持つ', () => {
    const statuses: QueueItem['status'][] = [
      'queued',
      'starting',
      'processing',
      'done',
      'failed',
      'cancelled',
    ];
    for (const status of statuses) {
      const { unmount } = render(<QueueItemRow item={makeItem(status)} />);
      expect(screen.getByRole('listitem')).toBeInTheDocument();
      unmount();
    }
  });

  it('data-status 属性で CSS / テスト selector で状態を区別できる', () => {
    render(<QueueItemRow item={makeItem('done', { outputSize: 100 })} />);
    expect(screen.getByRole('listitem')).toHaveAttribute('data-status', 'done');
  });
});
