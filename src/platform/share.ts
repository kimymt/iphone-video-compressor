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

/** 1GB を超える出力は iOS Share でほぼ確実に失敗するため事前に download フォールバック。 */
const SHARE_SIZE_LIMIT_BYTES = 1024 * 1024 * 1024;

/** ファイル名から `:` `/` `\` を `_` に置換。iOS Share Sheet の予期せぬ拒否を避ける。 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[:/\\]/g, '_');
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
