// Phase 5: 完了 QueueItem の共有ボタン。
// OPFS から出力ファイルを読み出し、shareFile() で Web Share API → ダウンロードフォールバック。
// 進行中は disable + Loader 表示。結果は onResult で QueueItem 側にバブルアップして
// toast や inline メッセージに使えるようにする。

import { useState } from 'react';
import { Share, Loader } from 'lucide-react';
import { readFromOpfs } from '../db/opfs';
import { shareFile, type ShareResult } from '../platform/share';

/** ShareButton の結果。share.ts の ShareResult に OPFS 読み出し失敗を足したもの。 */
export type ShareOutcome = ShareResult | { kind: 'read-failed'; error: string };

export interface ShareButtonProps {
  outputOpfsPath: string;
  fileName: string;
  /** share 完了後にコールバック (toast 表示用)。 */
  onResult?: (outcome: ShareOutcome) => void;
  /** Tailwind クラスを上書きしたい場合に。デフォルトで QueueItem 既存ボタンと同形。 */
  className?: string;
}

/**
 * 元のファイル名から圧縮後の共有ファイル名を導出。
 * 例: `IMG_4523.MOV` → `IMG_4523_compressed.mp4`
 * 拡張子が無いものはそのまま `_compressed.mp4` を付与。
 */
export function deriveShareFileName(originalName: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const stem = dotIdx > 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${stem}_compressed.mp4`;
}

const DEFAULT_CLASSNAME =
  'ml-1 flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--label-tertiary)] disabled:hover:bg-transparent';

export default function ShareButton({
  outputOpfsPath,
  fileName,
  onResult,
  className,
}: ShareButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await readFromOpfs(outputOpfsPath);
      const result = await shareFile(file, deriveShareFileName(fileName));
      onResult?.(result);
    } catch (err) {
      onResult?.({
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
      aria-label={`${fileName} を共有`}
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
