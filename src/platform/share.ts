// Phase 5: Web Share API ラッパ。
// CLAUDE.md「主要モジュール仕様 > src/platform/share.ts」を反映。
//
// 挙動:
// 1. fileName の `:` `/` `\` を `_` に置換 (iOS Share Sheet で失敗する文字)
// 2. blob.size > 1GB なら即 download フォールバック (iOS Share API 制約)
// 3. navigator.canShare({files}) が true なら navigator.share()
// 4. それ以外 / share が AbortError 以外で失敗したら download フォールバック
//
// 戻り値は ShareResult (discriminated union) で UI が
// 「成功 / ダウンロード / キャンセル / 失敗」を区別できるようにする。
// CLAUDE.md は Promise<boolean> としていたが boolean だと UX で区別できないため拡張。

export type ShareResult =
  | { kind: 'shared' }
  | { kind: 'downloaded' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; error: string };

/** V2: バルク保存の結果。`downloaded` の代わりに `failed-multi` (個別保存に誘導) を返す。
 *  単一ファイル時は ShareResult と同じ意味論。 */
export type ShareFilesResult =
  | { kind: 'shared' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; error: string }
  /** 複数ファイルの一括ダウンロードは妥当な仕様 (zip 等) が無いため、
   *  Share Sheet 失敗時はユーザに個別保存を促す。 */
  | { kind: 'failed-multi'; error: string };

/** 1GB を超える出力は iOS Share でほぼ確実に失敗するため事前に download フォールバック。
 *  V2 のバルク保存では合計サイズに同じ閾値を適用する (Share Sheet の事実上の上限)。 */
const SHARE_SIZE_LIMIT_BYTES = 1024 * 1024 * 1024;

/** ファイル名から `:` `/` `\` を `_` に置換。iOS Share Sheet の予期せぬ拒否を避ける。 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[:/\\]/g, '_');
}

/**
 * 元のファイル名から圧縮後の共有ファイル名を導出。
 * 例: `IMG_4523.MOV` → `IMG_4523_compressed.mp4`
 * 拡張子が無いものはそのまま `_compressed.mp4` を付与。
 * V2 で ShareButton から share.ts に移動 (shareFiles でも使うため)。
 */
export function deriveShareFileName(originalName: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const stem = dotIdx > 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${stem}_compressed.mp4`;
}

/**
 * Blob を出力ファイル名で共有する。
 * 1GB 以下なら navigator.share() を試行、ダメなら `<a download>` でダウンロード。
 * ユーザーキャンセルは AbortError → kind: 'cancelled' で区別。
 */
export async function shareFile(blob: Blob, fileName: string): Promise<ShareResult> {
  const sanitized = sanitizeFileName(fileName);

  // 1GB 超は即フォールバック (iOS Share の事実上の上限)
  if (blob.size > SHARE_SIZE_LIMIT_BYTES) {
    return downloadFallback(blob, sanitized);
  }

  if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
    // File オブジェクトとして渡す必要がある (Blob のみだと canShare が false)
    const file = new File([blob], sanitized, {
      type: blob.type || 'video/mp4',
    });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return { kind: 'shared' };
      } catch (err) {
        // ユーザーが Share シートで「キャンセル」を選択 → AbortError
        if (err instanceof Error && err.name === 'AbortError') {
          return { kind: 'cancelled' };
        }
        // その他の失敗 (Permission denied 等) は download にフォールバック
      }
    }
  }

  return downloadFallback(blob, sanitized);
}

/**
 * V2: 複数ファイルを 1 回の Share Sheet で一括保存する。
 * iOS Share Sheet で「写真に保存」を選ぶと配列全件が Photos に取り込まれる
 * (1 タップで N 件保存)。AirDrop / Files / iCloud Drive も配列対応。
 *
 * 制約:
 *   - 合計サイズが SHARE_SIZE_LIMIT_BYTES (1GB) 超なら即 'failed-multi' (個別保存に誘導)
 *   - canShare({files}) が false なら 'failed-multi'
 *   - share() のユーザキャンセル (AbortError) は 'cancelled'
 *   - その他の share() 失敗は 'failed-multi' (個別保存に誘導)
 *
 * 単一要素配列を渡しても動くが、その場合は shareFile() の方が download
 * フォールバックも効くので適切 (shareFile が単一用、shareFiles がバルク用)。
 */
export async function shareFiles(
  blobs: ReadonlyArray<Blob>,
  fileNames: ReadonlyArray<string>,
): Promise<ShareFilesResult> {
  if (blobs.length === 0) {
    return { kind: 'failed-multi', error: 'no files to share' };
  }
  if (blobs.length !== fileNames.length) {
    return {
      kind: 'failed-multi',
      error: `blobs (${blobs.length}) / fileNames (${fileNames.length}) length mismatch`,
    };
  }

  // 合計サイズチェック (1GB 超 → Share Sheet が固まるので個別保存に誘導)
  const totalSize = blobs.reduce((sum, b) => sum + b.size, 0);
  if (totalSize > SHARE_SIZE_LIMIT_BYTES) {
    return {
      kind: 'failed-multi',
      error: `total size ${totalSize} exceeds ${SHARE_SIZE_LIMIT_BYTES}`,
    };
  }

  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') {
    return { kind: 'failed-multi', error: 'navigator.share not available' };
  }

  const files: File[] = blobs.map((blob, i) => {
    const name = sanitizeFileName(fileNames[i] ?? `compressed-${i}.mp4`);
    return new File([blob], name, { type: blob.type || 'video/mp4' });
  });

  if (!navigator.canShare({ files })) {
    return { kind: 'failed-multi', error: 'canShare({files: [...]}) returned false' };
  }

  try {
    await navigator.share({ files });
    return { kind: 'shared' };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    return {
      kind: 'failed-multi',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** `<a download>` で一時 URL を click する古典的なフォールバック。 */
export function downloadFallback(blob: Blob, fileName: string): ShareResult {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return { kind: 'failed', error: 'document / URL.createObjectURL が利用できません' };
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 即時 revoke すると iOS でダウンロードが途中で切れるケースあり。猶予を持って revoke。
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
    }, 30_000);
    return { kind: 'downloaded' };
  } catch (err) {
    return {
      kind: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// テスト用 internals
export const _internal = {
  SHARE_SIZE_LIMIT_BYTES,
};
