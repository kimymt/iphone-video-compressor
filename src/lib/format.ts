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

/**
 * 過去の timestamp を「5 分前」「2 日前」のような相対時間に変換する。
 * Intl.RelativeTimeFormat を使うので locale 自動対応 (iOS Safari 14+ で利用可)。
 *
 * - 60 秒未満 → "今"
 * - 60 分未満 → "N 分前"
 * - 24 時間未満 → "N 時間前"
 * - 30 日未満 → "N 日前"
 * - それ以上 → "N ヶ月前" / "N 年前"
 *
 * 未来時刻 (時計巻き戻し) は "今" として返す。
 * Intl 未対応の環境 (古い jsdom) では英語フォールバック ("N min ago")。
 */
export function formatRelativeTime(
  timestampMs: number,
  locale: string = typeof navigator !== 'undefined' ? navigator.language : 'en',
  now: () => number = Date.now,
): string {
  const diffMs = timestampMs - now();
  const absSec = Math.abs(diffMs) / 1000;

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;
  if (absSec < 60) {
    value = 0;
    unit = 'second';
  } else if (absSec < 3600) {
    value = Math.round(diffMs / (60 * 1000));
    unit = 'minute';
  } else if (absSec < 86400) {
    value = Math.round(diffMs / (3600 * 1000));
    unit = 'hour';
  } else if (absSec < 30 * 86400) {
    value = Math.round(diffMs / (86400 * 1000));
    unit = 'day';
  } else if (absSec < 365 * 86400) {
    value = Math.round(diffMs / (30 * 86400 * 1000));
    unit = 'month';
  } else {
    value = Math.round(diffMs / (365 * 86400 * 1000));
    unit = 'year';
  }

  try {
    const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    return fmt.format(value, unit);
  } catch {
    // 古い環境 (Intl.RelativeTimeFormat 未対応) のフォールバック
    if (value === 0) return 'just now';
    const abs = Math.abs(value);
    const suffix = value < 0 ? 'ago' : 'from now';
    return `${abs} ${unit}${abs !== 1 ? 's' : ''} ${suffix}`;
  }
}
