// バイトと時間の表示用フォーマッタ。
// 仕様書ディレクトリ構造に含まれる src/lib/format.ts。

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * バイト数を人間が読める単位に変換。
 * 1024 進。少数 1 桁。
 * 0 → "0 B"、1024 → "1.0 KB"、1.5GB → "1.5 GB"。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1) return '0 B';
  const idx = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  const unit = BYTE_UNITS[idx];
  if (idx === 0) return `${Math.round(value)} ${unit}`;
  return `${value.toFixed(1)} ${unit}`;
}

/**
 * 秒数を MM:SS / HH:MM:SS に変換。
 * Phase 4 で残り時間（ETA）表示に使う。
 */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * ファイル名から拡張子を取り出す（先頭の '.' は除外）。
 * 拡張子無しなら 'bin'。OPFS の inputs/{id}.{ext} に使う。
 */
export function extractExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0 || idx === fileName.length - 1) return 'bin';
  return fileName.slice(idx + 1).toLowerCase();
}
