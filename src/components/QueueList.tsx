// Phase 4b: items 配列をレンダする <ul role="list">。
// 空状態は EmptyState (Video icon + 案内テキスト)。
// addedAt 昇順でソートして表示 (古い順)。

import { Video } from 'lucide-react';
import QueueItemRow from './QueueItem';
import type { QueueItem } from '../lib/types';

export interface QueueListProps {
  items: QueueItem[];
}

export default function QueueList({ items }: QueueListProps) {
  const sorted = [...items].sort((a, b) => a.addedAt - b.addedAt);

  if (sorted.length === 0) {
    return (
      <div
        role="status"
        data-testid="empty-state"
        className="flex flex-col items-center gap-3 py-16 text-center text-[var(--label-secondary)]"
      >
        <Video size={48} aria-hidden="true" />
        <p className="font-semibold text-[var(--label)]">まだ何もありません</p>
        <p className="text-sm">下の「動画を選択」から始められます</p>
      </div>
    );
  }

  return (
    <ul
      role="list"
      aria-label="圧縮キュー"
      data-testid="queue-list"
      className="flex flex-col"
    >
      {sorted.map((item) => (
        <QueueItemRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
