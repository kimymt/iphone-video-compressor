import { describe, it, expect } from 'vitest';
import { formatBytes, formatDuration, extractExtension, formatRelativeTime } from './format';

describe('formatBytes', () => {
  it('0 / 負 / NaN は "—" もしくは "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });

  it('B 単位 (1024 未満) は整数', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('KB / MB / GB は少数 1 桁', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('iPhone 4K HEVC 想定サイズ (124MB) を正しく表示', () => {
    expect(formatBytes(124 * 1024 * 1024)).toBe('124.0 MB');
  });
});

describe('formatDuration', () => {
  it('M:SS 形式 (< 1 時間)', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(125)).toBe('2:05');
  });

  it('H:MM:SS 形式 (>= 1 時間)', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('負 / NaN は "—"', () => {
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('extractExtension', () => {
  it('一般的な拡張子', () => {
    expect(extractExtension('movie.mp4')).toBe('mp4');
    expect(extractExtension('IMG_4523.MOV')).toBe('mov');
    expect(extractExtension('video.heic')).toBe('heic');
  });

  it('拡張子無しは "bin"', () => {
    expect(extractExtension('myvideo')).toBe('bin');
    expect(extractExtension('')).toBe('bin');
  });

  it('"." だけ / 末尾 "." も "bin"', () => {
    expect(extractExtension('.hidden')).toBe('bin');
    expect(extractExtension('movie.')).toBe('bin');
  });

  it('複数 "." はあとの 1 つだけ', () => {
    expect(extractExtension('my.video.MP4')).toBe('mp4');
  });
});

describe('formatRelativeTime', () => {
  // Locale 固定で出力安定化 (Intl.RelativeTimeFormat の en は "5 minutes ago" 形式)
  const en = 'en';
  const now = () => 1_000_000_000_000;

  it('60 秒以内は "now" 相当 (en で "now")', () => {
    const result = formatRelativeTime(now() - 5_000, en, now);
    // en の Intl.RelativeTimeFormat({ numeric: 'auto' }) は 0 秒 → "now"
    expect(result.toLowerCase()).toContain('now');
  });

  it('5 分前は "5 minutes ago" 相当', () => {
    const result = formatRelativeTime(now() - 5 * 60 * 1000, en, now);
    expect(result).toMatch(/5 minutes? ago/);
  });

  it('2 時間前は "2 hours ago" 相当', () => {
    const result = formatRelativeTime(now() - 2 * 60 * 60 * 1000, en, now);
    expect(result).toMatch(/2 hours? ago/);
  });

  it('3 日前は "3 days ago" 相当', () => {
    const result = formatRelativeTime(now() - 3 * 24 * 60 * 60 * 1000, en, now);
    expect(result).toMatch(/3 days? ago/);
  });

  it('2 ヶ月前は "2 months ago" 相当', () => {
    const result = formatRelativeTime(now() - 60 * 24 * 60 * 60 * 1000, en, now);
    expect(result).toMatch(/2 months? ago/);
  });

  it('未来時刻 (時計巻き戻し) は "in N" 形式', () => {
    const result = formatRelativeTime(now() + 10 * 60 * 1000, en, now);
    // en では "in 10 minutes" のような表記になる
    expect(result.toLowerCase()).toMatch(/in 10 minutes?/);
  });

  it('日本語 locale で「5 分前」相当の表示', () => {
    const result = formatRelativeTime(now() - 5 * 60 * 1000, 'ja', now);
    // ja: "5 分前"
    expect(result).toMatch(/5\s*分前/);
  });
});
