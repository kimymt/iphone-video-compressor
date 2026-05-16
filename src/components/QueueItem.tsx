// Phase 4b: 1 アイテム分の UI。6 ステータスに応じてアイコン / 進捗バー / アクションを切り替える。
// Phase 4c: failed/cancelled に Retry ボタンを追加 (input が残っていれば有効)。
// Phase 5: done に Share ボタンを追加 (outputOpfsPath を共有 / ダウンロード)。
// CLAUDE.md「インタラクションステートカバレッジ」表に対応。
// V2: i18n 化 (status / aria / sub-text を全て t() 経由)。
//
// 本ファイルが提供するのは:
// - queued: Clock + テキスト + Cancel + Remove
// - starting: Loader (spin) + テキスト + Cancel
// - processing: ProgressBar + percent + ETA + Cancel
// - done: CheckCircle2 (success) + 圧縮率 + Share + Remove
// - failed: AlertTriangle (error) + エラーメッセージ + Retry + Remove
// - cancelled: XCircle (secondary) + テキスト + Retry + Remove

import {
  Clock,
  Loader,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useQueueStore } from '../stores/queueStore';
import { formatBytes, formatDuration } from '../lib/format';
import { estimatedOutputSize, findPreset } from '../lib/presets';
import { useT } from '../i18n';
import type { QueueItem } from '../lib/types';
import ShareButton from './ShareButton';

export interface QueueItemProps {
  item: QueueItem;
}

/** status キーから翻訳済みステータス文字列を取得。 */
function useStatusLabel(): (status: QueueItem['status']) => string {
  const t = useT();
  return (status) => t(`status.${status}`);
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
  const retry = useQueueStore((s) => s.retry);
  const t = useT();
  const statusLabel = useStatusLabel();

  const showProgressBar = item.status === 'processing';
  const showCancelBtn = item.status === 'queued' || item.status === 'starting' || item.status === 'processing';
  // Retry は failed / cancelled で表示。done は input 削除済みなので表示しない (Phase 4a 仕様)。
  const showRetryBtn = item.status === 'failed' || item.status === 'cancelled';
  // 防御: 不整合状態 (failed なのに input が空) では disable で残す
  const retryDisabled = !item.inputOpfsPath;
  // Share は done かつ outputOpfsPath があるときのみ。
  const showShareBtn = item.status === 'done' && !!item.outputOpfsPath;
  const showRemoveBtn = !showCancelBtn || item.status === 'queued';

  const aria = t('queueItem.aria', {
    fileName: item.fileName,
    status: statusLabel(item.status),
    percent: item.progress,
  });

  return (
    <li
      role="listitem"
      aria-label={aria}
      data-testid="queue-item"
      data-status={item.status}
      // V2: View Transitions API で per-item morph を有効化。
      // V2.x MINOR #6: tiebreaker として addedAt を suffix に含める。UUID 衝突は
      // 実質ゼロだが、`_resetQueueStoreForTest()` 後の同一データ再投入や
      // テスト fixture でハードコード id を使うケースで「old + new で同名」が
      // 一瞬発生する race を防ぐ。本番影響なし、テスト / debug の堅牢性向上。
      style={{ viewTransitionName: `queue-item-${item.id}-${item.addedAt}` }}
      className="flex flex-col gap-2 border-b border-[var(--separator)] py-3"
    >
      {/* 1行目: ファイル名 + ステータスアイコン + アクション */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.fileName}</p>
          <p className="tabular text-xs text-[var(--label-secondary)]">
            {renderSubText(item, t, statusLabel)}
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
              aria-label={t('queueItem.cancelAria', { fileName: item.fileName })}
            >
              <X aria-hidden="true" size={18} />
            </button>
          )}
          {showRetryBtn && (
            <button
              type="button"
              onClick={() => {
                if (!retryDisabled) void retry(item.id);
              }}
              disabled={retryDisabled}
              className="ml-1 flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--label-tertiary)] disabled:hover:bg-transparent"
              aria-label={t('queueItem.retryAria', { fileName: item.fileName })}
              aria-disabled={retryDisabled || undefined}
              title={retryDisabled ? t('queueItem.retryDisabledTitle') : undefined}
            >
              <RefreshCw aria-hidden="true" size={18} />
            </button>
          )}
          {showShareBtn && item.outputOpfsPath && (
            <ShareButton outputOpfsPath={item.outputOpfsPath} fileName={item.fileName} />
          )}
          {showRemoveBtn && (
            <button
              type="button"
              onClick={() => {
                void remove(item.id);
              }}
              className="ml-1 flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--label-secondary)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              aria-label={t('queueItem.removeAria', { fileName: item.fileName })}
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
 * V2.x (D2): 動画長 + preset から圧縮後の予測サイズ (バイト) を返す。
 * `durationSec` 未設定 or preset 不在のときは null。表示判定に使う。
 */
function tryEstimateOutputSize(item: QueueItem): number | null {
  if (typeof item.durationSec !== 'number' || item.durationSec <= 0) return null;
  const preset = findPreset(item.preset);
  if (!preset) return null;
  const bytes = estimatedOutputSize(item.durationSec, preset);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return bytes;
}

/**
 * status に応じた副次テキストを返す。
 * - queued/starting: 入力サイズ + ラベル (durationSec 取得済みなら「→ 約 {予測}」)
 * - processing: 入力サイズ + ETA / 予測サイズ (どちらも利用可能なら ETA 優先)
 * - done: 入力 → 出力 + 圧縮率
 * - failed: 「この動画は処理できません」(CLAUDE.md S10)
 * - cancelled: 入力サイズ + ラベル
 *
 * V2.x (D2): peek (A2) で得た `durationSec` を使って queued/starting/processing 中も
 * 圧縮後サイズを予測表示する。ETA が未算出 (transcode 開始 10 秒以内) でも予測値が
 * 出るので、ユーザは投入直後にプリセット選択の妥当性を判断できる。
 */
function renderSubText(
  item: QueueItem,
  t: (path: string, vars?: Record<string, string | number>) => string,
  statusLabel: (status: QueueItem['status']) => string,
): string {
  const estBytes = tryEstimateOutputSize(item);

  switch (item.status) {
    case 'queued':
      if (estBytes !== null) {
        return t('queueItem.sub.queuedWithEstimate', {
          size: formatBytes(item.inputSize),
          estimatedSize: formatBytes(estBytes),
        });
      }
      return t('queueItem.sub.queued', {
        size: formatBytes(item.inputSize),
        status: statusLabel('queued'),
      });
    case 'starting':
      if (estBytes !== null) {
        return t('queueItem.sub.queuedWithEstimate', {
          size: formatBytes(item.inputSize),
          estimatedSize: formatBytes(estBytes),
        });
      }
      return t('queueItem.sub.queued', {
        size: formatBytes(item.inputSize),
        status: statusLabel('starting'),
      });
    case 'processing': {
      const sizeLabel = formatBytes(item.inputSize);
      // ETA があれば最優先 (実測ベースで予測より正確)
      if (item.etaSec !== undefined && item.etaSec !== null) {
        return t('queueItem.sub.processingEta', {
          size: sizeLabel,
          duration: formatDuration(item.etaSec),
        });
      }
      // ETA まだなくても予測サイズが分かれば見せる (transcode 序盤の空白対策)
      if (estBytes !== null) {
        return t('queueItem.sub.processingWithEstimate', {
          size: sizeLabel,
          estimatedSize: formatBytes(estBytes),
        });
      }
      return t('queueItem.sub.processing', {
        size: sizeLabel,
        status: statusLabel('processing'),
      });
    }
    case 'done': {
      if (typeof item.outputSize === 'number') {
        const ratio = Math.round((item.outputSize / item.inputSize) * 100);
        return t('queueItem.sub.done', {
          inputSize: formatBytes(item.inputSize),
          outputSize: formatBytes(item.outputSize),
          ratio,
        });
      }
      return t('queueItem.sub.doneNoOutput', { size: formatBytes(item.inputSize) });
    }
    case 'failed':
      // M6: 旧実装は {error} 補間で Worker 内部の英語例外メッセージ
      // (NotSupportedError 等) を生で UI に出していて i18n が破れていた。
      // ユーザ向けには「処理できませんでした」のみ表示し、raw error は
      // item.error に保持され dev コンソール / IndexedDB 経由で診断可能。
      return t('queueItem.sub.failed');
    case 'cancelled':
      return t('queueItem.sub.cancelled', {
        size: formatBytes(item.inputSize),
        status: statusLabel('cancelled'),
      });
  }
}
