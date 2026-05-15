// Phase 4b: items 配列をレンダする <ul role="list">。
// Phase 4c: terminal アイテム (done/failed/cancelled) が 1 件以上あるとき、
// リスト上部に「完了をすべて削除」ボタンを表示する (clearCompleted を呼ぶ)。
// 空状態は EmptyState (Video icon + 案内テキスト)。
// addedAt 昇順でソートして表示 (古い順)。
// V2: i18n 化 (空状態テキスト / 削除ボタン / aria を t() 経由)。

import { Video, Trash2 } from 'lucide-react';
import QueueItemRow from './QueueItem';
import { useQueueStore } from '../stores/queueStore';
import { useT } from '../i18n';
import type { QueueItem } from '../lib/types';

export interface QueueListProps {
  items: QueueItem[];
}

const TERMINAL_STATUSES: ReadonlyArray<QueueItem['status']> = ['done', 'failed', 'cancelled'];

export default function QueueList({ items }: QueueListProps) {
  const clearCompleted = useQueueStore((s) => s.clearCompleted);
  const t = useT();
  const sorted = [...items].sort((a, b) => a.addedAt - b.addedAt);

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

  const terminalCount = sorted.filter((i) => TERMINAL_STATUSES.includes(i.status)).length;

  return (
    <div className="flex flex-col">
      {terminalCount > 0 && (
        <div className="flex items-center justify-end py-2">
          <button
            type="button"
            onClick={() => {
              void clearCompleted();
            }}
            data-testid="clear-completed"
            className="flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-[var(--label-secondary)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            aria-label={t('queueList.clearAllAria', { count: terminalCount })}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>{t('queueList.clearAllCta', { count: terminalCount })}</span>
          </button>
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
