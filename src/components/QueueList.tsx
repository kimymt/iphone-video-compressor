// Phase 4b: items 配列をレンダする <ul role="list">。
// Phase 4c: terminal アイテム (done/failed/cancelled) が 1 件以上あるとき、
// リスト上部に「完了をすべて削除」ボタンを表示する (clearCompleted を呼ぶ)。
// 空状態は EmptyState (Video icon + 案内テキスト)。
// addedAt 昇順でソートして表示 (古い順)。
// V2: i18n 化 (空状態テキスト / 削除ボタン / aria を t() 経由)。
// V2: 「完了をすべて保存」ボタン追加 (done が 1 件以上のとき、Share Sheet で
//      一括「写真に保存」できる、1 タップ UX)。文言は「保存」で統一 (ユーザの
//      メンタルモデル: Share Sheet を経由するが意図は写真への保存)。

import { useState } from 'react';
import { Video, Trash2, Share } from 'lucide-react';
import QueueItemRow from './QueueItem';
import { useQueueStore } from '../stores/queueStore';
import { useToastStore } from '../stores/toastStore';
import { useT } from '../i18n';
import type { QueueItem } from '../lib/types';

export interface QueueListProps {
  items: QueueItem[];
}

const TERMINAL_STATUSES: ReadonlyArray<QueueItem['status']> = ['done', 'failed', 'cancelled'];

export default function QueueList({ items }: QueueListProps) {
  const clearCompleted = useQueueStore((s) => s.clearCompleted);
  const shareAllDone = useQueueStore((s) => s.shareAllDone);
  const t = useT();
  const sorted = [...items].sort((a, b) => a.addedAt - b.addedAt);
  /** V2: 一括保存中フラグ。連打防止 + ボタン disable。 */
  const [savingAll, setSavingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const handleClearAll = async (): Promise<void> => {
    if (clearingAll) return;
    setClearingAll(true);
    try {
      await clearCompleted();
    } catch {
      useToastStore.getState().show(t('queueItem.deletionFailed'), { kind: 'error' });
    } finally {
      setClearingAll(false);
    }
  };

  const handleSaveAll = async (): Promise<void> => {
    if (savingAll) return;
    setSavingAll(true);
    try {
      const result = await shareAllDone();
      const toast = useToastStore.getState();
      switch (result.kind) {
        case 'shared':
          // iOS Share Sheet 自体が成功 UI を出す (「写真に保存しました」等)
          return;
        case 'cancelled':
          toast.show(t('share.saveAllCancelled'), { kind: 'info' });
          return;
        case 'failed-multi':
          // done 0 件 / 全 read 失敗 / canShare=false / share 失敗 → 個別保存に誘導
          if (result.error === 'no done items') {
            toast.show(t('share.saveAllNoneAvailable'), { kind: 'info' });
          } else {
            toast.show(t('share.saveAllFailedMulti'), { kind: 'error' });
          }
          return;
        case 'failed':
          toast.show(t('share.failed', { error: result.error }), { kind: 'error' });
          return;
      }
    } finally {
      setSavingAll(false);
    }
  };

  if (sorted.length === 0) {
    return (
      <div
        role="status"
        data-testid="empty-state"
        className="flex flex-col items-center gap-3 py-16 text-center text-[var(--label-secondary)]"
      >
        <Video size={48} aria-hidden="true" />
        <p className="font-semibold text-[var(--label)]">{t('empty.title')}</p>
        <p className="text-sm">{t('empty.hint')}</p>
      </div>
    );
  }

  const terminalCount = sorted.filter((i) => i.deletionPending || TERMINAL_STATUSES.includes(i.status)).length;
  const doneCount = sorted.filter((i) => i.status === 'done' && !i.deletionPending).length;

  return (
    <div className="flex flex-col">
      {(terminalCount > 0 || doneCount > 0) && (
        // V2: flex-nowrap + 詰めた padding/gap で 393px iPhone 標準幅にも横並びで収まる
        // (5 言語すべてで 1 行表示)。両方表示時の合計幅: JA 約 332px, EN 約 318px,
        // zh-CN/zh-TW 約 280px, ko 約 340px (393 - px-4 = 361px に収まる)。
        <div className="flex flex-nowrap items-center justify-end gap-1.5 py-2">
          {doneCount > 0 && (
            <button
              type="button"
              onClick={() => {
                void handleSaveAll();
              }}
              disabled={savingAll}
              data-testid="save-all-done"
              className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-50"
              aria-label={t('queueList.saveAllAria', { count: doneCount })}
            >
              <Share size={14} aria-hidden="true" />
              <span>{t('queueList.saveAllCta', { count: doneCount })}</span>
            </button>
          )}
          {terminalCount > 0 && (
            <button
              type="button"
              onClick={() => {
                void handleClearAll();
              }}
              disabled={clearingAll}
              aria-busy={clearingAll || undefined}
              data-testid="clear-completed"
              className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm text-[var(--label-secondary)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              aria-label={t('queueList.clearAllAria', { count: terminalCount })}
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>{t('queueList.clearAllCta', { count: terminalCount })}</span>
            </button>
          )}
        </div>
      )}
      <ul
        role="list"
        aria-label={t('queueList.aria')}
        data-testid="queue-list"
        className="flex flex-col"
      >
        {sorted.map((item) => (
          <QueueItemRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}
