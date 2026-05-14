// Phase 4b: 1 アイテム分の UI。6 ステータスに応じてアイコン / 進捗バー / アクションを切り替える。
// CLAUDE.md「インタラクションステートカバレッジ」表に対応。
//
// Share / Retry ボタンは UI を用意せず、Phase 4c (retry) / Phase 5 (share) で追加する。
// 本ファイルが提供するのは:
// - queued: Clock + テキスト + Remove
// - starting: Loader (spin) + テキスト + Cancel
// - processing: ProgressBar + percent + ETA + Cancel
// - done: CheckCircle2 (success) + 圧縮率 + Remove
// - failed: AlertTriangle (error) + エラーメッセージ + Remove
// - cancelled: XCircle (secondary) + テキスト + Remove

import { Clock, Loader, CheckCircle2, AlertTriangle, XCircle, X, Trash2 } from 'lucide-react';
import { useQueueStore } from '../stores/queueStore';
import { formatBytes, formatDuration } from '../lib/format';
import type { QueueItem } from '../lib/types';

export interface QueueItemProps {
  item: QueueItem;
}

function statusLabel(status: QueueItem['status']): string {
  switch (status) {
    case 'queued':
      return 'キュー待ち';
    case 'starting':
      return '開始中…';
    case 'processing':
      return '処理中';
    case 'done':
      return '完了';
    case 'failed':
      return 'エラー';
    case 'cancelled':
      return 'キャンセル済み';
  }
}

/** 進捗バー (0..100)。Reduced Motion 対応は CSS 側で transition を消す。 */
function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 w-full overflow-hidden rounded-full bg-[var(--separator)]"
    >
      <div
        data-testid="progress-fill"
        className="motion-safe:transition-transform motion-safe:duration-200 h-full origin-left bg-[var(--accent)]"
        style={{ transform: `scaleX(${clamped / 100})` }}
      />
    </div>
  );
}

/** ステータス用アイコン (右端側)。 */
function StatusIcon({ status }: { status: QueueItem['status'] }) {
  switch (status) {
    case 'queued':
      return <Clock aria-hidden="true" size={18} className="text-[var(--label-secondary)]" />;
    case 'starting':
      return (
        <Loader
          aria-hidden="true"
          size={18}
          className="text-[var(--accent)] motion-safe:animate-spin"
        />
      );
    case 'processing':
      return null; // ProgressBar が代替
    case 'done':
      return (
        <CheckCircle2
          aria-hidden="true"
          size={18}
          className="text-[var(--success)] motion-safe:animate-[scale-in_0.5s_ease-out]"
        />
      );
    case 'failed':
      return <AlertTriangle aria-hidden="true" size={18} className="text-[var(--error)]" />;
    case 'cancelled':
      return <XCircle aria-hidden="true" size={18} className="text-[var(--label-secondary)]" />;
  }
}

export default function QueueItemRow({ item }: QueueItemProps) {
  const cancel = useQueueStore((s) => s.cancel);
  const remove = useQueueStore((s) => s.remove);

  const showProgressBar = item.status === 'processing';
  const showCancelBtn = item.status === 'queued' || item.status === 'starting' || item.status === 'processing';
  const showRemoveBtn = !showCancelBtn || item.status === 'queued';
  // queued は cancel と remove 両方表示。queued の cancel は items に残す (cancelled に遷移)、
  // remove は削除。

  const aria = `${item.fileName}、${statusLabel(item.status)}、進捗 ${item.progress}%`;

  return (
    <li
      role="listitem"
      aria-label={aria}
      data-testid="queue-item"
      data-status={item.status}
      className="flex flex-col gap-2 border-b border-[var(--separator)] py-3"
    >
      {/* 1行目: ファイル名 + ステータスアイコン + アクション */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.fileName}</p>
          <p className="tabular text-xs text-[var(--label-secondary)]">
            {renderSubText(item)}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <StatusIcon status={item.status} />
          {showCancelBtn && (
            <button
              type="button"
              onClick={() => {
                void cancel(item.id);
              }}
              className="ml-1 flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--label-secondary)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              aria-label={`${item.fileName} の処理を中止`}
            >
              <X aria-hidden="true" size={18} />
            </button>
          )}
          {showRemoveBtn && (
            <button
              type="button"
              onClick={() => {
                void remove(item.id);
              }}
              className="ml-1 flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--label-secondary)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              aria-label={`${item.fileName} を削除`}
            >
              <Trash2 aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      </div>

      {/* 2行目: processing のときだけ ProgressBar を表示 */}
      {showProgressBar && (
        <div className="flex items-center gap-3">
          <ProgressBar value={item.progress} />
          <span className="tabular shrink-0 text-xs text-[var(--label-secondary)]">
            {Math.round(item.progress)}%
          </span>
        </div>
      )}
    </li>
  );
}

/**
 * status に応じた副次テキストを返す。
 * - queued/starting/cancelled: 入力サイズ + ラベル
 * - processing: 入力サイズ + ETA (利用可能なら)
 * - done: 入力 → 出力 + 圧縮率
 * - failed: エラーメッセージ
 */
function renderSubText(item: QueueItem): string {
  switch (item.status) {
    case 'queued':
    case 'starting':
      return `${formatBytes(item.inputSize)} · ${statusLabel(item.status)}`;
    case 'processing': {
      const sizeLabel = formatBytes(item.inputSize);
      if (item.etaSec !== undefined && item.etaSec !== null) {
        return `${sizeLabel} · 残り ${formatDuration(item.etaSec)}`;
      }
      return `${sizeLabel} · ${statusLabel(item.status)}`;
    }
    case 'done': {
      if (typeof item.outputSize === 'number') {
        const ratio = Math.round((item.outputSize / item.inputSize) * 100);
        return `${formatBytes(item.inputSize)} → ${formatBytes(item.outputSize)} (${ratio}%)`;
      }
      return `${formatBytes(item.inputSize)} · 完了`;
    }
    case 'failed':
      return item.error;
    case 'cancelled':
      return `${formatBytes(item.inputSize)} · ${statusLabel(item.status)}`;
  }
}
