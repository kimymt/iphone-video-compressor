// Phase 5: 完了 QueueItem の共有ボタン。
// Phase 7: 結果は toastStore に push (onResult prop は廃止)。
// V2: i18n 化 (toast 文言を全て t() 経由)。
//
// OPFS から出力ファイルを読み出し、shareFile() で Web Share API → ダウンロードフォールバック。
// 進行中は disable + Loader 表示。各結果に対して spec 準拠の文言で toast を出す:
// - shared:      silent (iOS Share Sheet 自体が成功フィードバック)
// - downloaded:  「ダウンロードを開始しました」 (success)
// - cancelled:   「共有がキャンセルされました」 (info / S11)
// - failed:      「共有に失敗しました: …」 (error)
// - read-failed: 「出力ファイルの読み込みに失敗しました: …」 (error)

import { useState } from 'react';
import { Share, Loader } from 'lucide-react';
import { readFromOpfs } from '../db/opfs';
import { shareFile, deriveShareFileName, type ShareResult } from '../platform/share';
import { useToastStore } from '../stores/toastStore';
import { useT } from '../i18n';

/** ShareButton の結果。share.ts の ShareResult に OPFS 読み出し失敗を足したもの。 */
export type ShareOutcome = ShareResult | { kind: 'read-failed'; error: string };

export interface ShareButtonProps {
  outputOpfsPath: string;
  fileName: string;
  /** Tailwind クラスを上書きしたい場合に。デフォルトで QueueItem 既存ボタンと同形。 */
  className?: string;
}

/** V2: `deriveShareFileName` は src/platform/share.ts に移動 (shareFiles でも使うため)。
 *  既存のテスト/インポート互換のため re-export する。 */
export { deriveShareFileName };

const DEFAULT_CLASSNAME =
  'ml-1 flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--label-tertiary)] disabled:hover:bg-transparent';

export default function ShareButton({
  outputOpfsPath,
  fileName,
  className,
}: ShareButtonProps) {
  const [busy, setBusy] = useState(false);
  const t = useT();

  const reportShareOutcome = (outcome: ShareOutcome): void => {
    const toast = useToastStore.getState();
    switch (outcome.kind) {
      case 'shared':
        // iOS Share Sheet が成功 UI を出すので silent
        return;
      case 'downloaded':
        toast.show(t('share.downloaded'), { kind: 'success' });
        return;
      case 'cancelled':
        // S11 相当 (--label-secondary 系の控えめなトースト)
        toast.show(t('share.cancelled'), { kind: 'info' });
        return;
      case 'failed':
        toast.show(t('share.failed', { error: outcome.error }), { kind: 'error' });
        return;
      case 'read-failed':
        toast.show(t('share.readFailed', { error: outcome.error }), { kind: 'error' });
        return;
    }
  };

  const handleClick = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await readFromOpfs(outputOpfsPath);
      const result = await shareFile(file, deriveShareFileName(fileName));
      reportShareOutcome(result);
    } catch (err) {
      reportShareOutcome({
        kind: 'read-failed',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handleClick();
      }}
      disabled={busy}
      className={className ?? DEFAULT_CLASSNAME}
      aria-label={t('share.aria', { fileName })}
      aria-busy={busy || undefined}
      data-testid="share-button"
    >
      {busy ? (
        <Loader aria-hidden="true" size={18} className="motion-safe:animate-spin" />
      ) : (
        <Share aria-hidden="true" size={18} />
      )}
    </button>
  );
}
