// Phase 4b: QueueItem の 6 ステータス UI / 副次テキスト / アクションボタンを検証。
// queueStore の cancel / remove メソッドは vi.spyOn で監視するだけで実体は走らせない。
// Phase 5 で Share ボタンの表示テストも追加。ShareButton 内部の OPFS / Share 動作は
// ShareButton.test.tsx で別途検証。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// QueueItem は ShareButton を内部 import するが、ShareButton は ../db/opfs と
// ../platform/share に依存する。QueueItem テストでは Share ボタンを click しないので
// stub だけ用意して副作用が走らないようにしておく。
vi.mock('../db/opfs', () => ({
  readFromOpfs: vi.fn(),
}));
vi.mock('../platform/share', () => ({
  shareFile: vi.fn(),
}));

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

  it('done: CheckCircle2 + 圧縮率 + Share + Remove (cancel 非表示)', () => {
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
    expect(screen.getByLabelText(/共有/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/処理を中止/)).toBeNull();
    expect(screen.queryByLabelText(/再試行/)).toBeNull();
  });

  it('failed: AlertTriangle + 「この動画は処理できませんでした」 (raw error は UI 非表示、item.error に保持) + Retry + Remove', () => {
    render(<QueueItemRow item={makeItem('failed', { error: 'unsupported codec' })} />);
    expect(screen.getByText(/この動画は処理できませんでした/)).toBeInTheDocument();
    // M6: 生のエラーは UI には表示しない (i18n の網を維持するため)。
    // raw error は item.error に保持され dev コンソール / IndexedDB 経由で参照可能。
    expect(screen.queryByText(/unsupported codec/)).toBeNull();
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

describe('QueueItem — Share ボタン (Phase 5)', () => {
  it('done で outputOpfsPath があれば Share ボタンを表示', () => {
    render(
      <QueueItemRow
        item={makeItem('done', {
          progress: 100,
          inputOpfsPath: '',
          outputOpfsPath: 'outputs/item-1.mp4',
          outputSize: 100,
        })}
      />,
    );
    expect(screen.getByTestId('share-button')).toBeInTheDocument();
    expect(screen.getByLabelText('IMG_4523.mov を共有')).toBeInTheDocument();
  });

  it('done でも outputOpfsPath が未定義のときは Share ボタンを表示しない', () => {
    // 防御的: 通常 done 遷移時に outputOpfsPath は必ずセットされるが、不整合時の挙動を確認
    render(
      <QueueItemRow
        item={makeItem('done', {
          progress: 100,
          inputOpfsPath: '',
          outputOpfsPath: undefined,
          outputSize: 100,
        })}
      />,
    );
    expect(screen.queryByTestId('share-button')).toBeNull();
  });

  it('queued / starting / processing / failed / cancelled では Share ボタンは表示しない', () => {
    const statuses: Array<{ s: QueueItem['status']; ov?: Partial<QueueItem> }> = [
      { s: 'queued' },
      { s: 'starting' },
      { s: 'processing', ov: { progress: 50 } },
      { s: 'failed', ov: { error: 'x' } },
      { s: 'cancelled' },
    ];
    for (const { s, ov } of statuses) {
      const { unmount } = render(<QueueItemRow item={makeItem(s, ov)} />);
      expect(screen.queryByTestId('share-button')).toBeNull();
      unmount();
    }
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

// ----- V2.x (D2): 推定出力サイズの表示 -----

describe('QueueItem — V2.x (D2) 推定出力サイズ', () => {
  it('queued + durationSec があれば「{入力} → 約 {予測}」を表示', () => {
    // standard-hevc: 3.128 Mbps × 10 sec / 8 = 3.91 MB ≈ "3.7 MB" (1024 進)
    render(
      <QueueItemRow
        item={makeItem('queued', {
          inputSize: 100 * 1024 * 1024,
          preset: 'standard-hevc',
          durationSec: 10,
        })}
      />,
    );
    const text = screen.getByText(/約\s+[\d.]+\s*MB/);
    expect(text.textContent).toMatch(/100\.0 MB.*→.*約.*MB/);
  });

  it('queued + durationSec 未設定なら従来の「{size} · キュー待ち」のまま', () => {
    render(<QueueItemRow item={makeItem('queued', { inputSize: 5 * 1024 * 1024 })} />);
    expect(screen.getByText(/5\.0 MB.*キュー待ち/)).toBeInTheDocument();
    expect(screen.queryByText(/約.*MB/)).toBeNull();
  });

  it('starting + durationSec があれば queued と同じ「→ 約」を表示 (UX 一貫性)', () => {
    render(
      <QueueItemRow
        item={makeItem('starting', {
          inputSize: 50 * 1024 * 1024,
          preset: 'min-h264',
          durationSec: 20,
        })}
      />,
    );
    // min-h264: 864 kbps × 20 sec / 8 ≈ 2.06 MB
    expect(screen.getByText(/50\.0 MB.*→.*約.*MB/)).toBeInTheDocument();
  });

  it('processing + ETA があれば ETA 優先 (予測サイズは出さない)', () => {
    render(
      <QueueItemRow
        item={makeItem('processing', {
          inputSize: 30 * 1024 * 1024,
          preset: 'standard-hevc',
          durationSec: 10,
          progress: 50,
          etaSec: 25,
        })}
      />,
    );
    // ETA 0:25 を表示、予測サイズは表示しない
    expect(screen.getByText(/残り.*0:25/)).toBeInTheDocument();
    expect(screen.queryByText(/約.*MB/)).toBeNull();
  });

  it('processing + ETA 未算出 + durationSec があれば予測サイズで埋める (序盤の空白対策)', () => {
    render(
      <QueueItemRow
        item={makeItem('processing', {
          inputSize: 30 * 1024 * 1024,
          preset: 'standard-hevc',
          durationSec: 10,
          progress: 5,
          // etaSec: undefined (ETA まだ算出されていない)
        })}
      />,
    );
    expect(screen.getByText(/30\.0 MB.*→.*約.*MB/)).toBeInTheDocument();
  });

  it('durationSec が 0 / 負数なら予測表示しない (NaN guard)', () => {
    render(
      <QueueItemRow
        item={makeItem('queued', {
          inputSize: 10 * 1024 * 1024,
          preset: 'standard-hevc',
          durationSec: 0,
        })}
      />,
    );
    expect(screen.getByText(/キュー待ち/)).toBeInTheDocument();
    expect(screen.queryByText(/約.*MB/)).toBeNull();
  });

  it('未知の preset (型から外れた値) なら予測表示しない', () => {
    render(
      <QueueItemRow
        item={makeItem('queued', {
          inputSize: 10 * 1024 * 1024,
          preset: 'bogus' as unknown as QueueItem['preset'],
          durationSec: 10,
        })}
      />,
    );
    expect(screen.getByText(/キュー待ち/)).toBeInTheDocument();
    expect(screen.queryByText(/約.*MB/)).toBeNull();
  });
});
