// Phase 6: PWA 関連の静的アセット & index.html の構成チェック。
// build を走らせずにファイルシステムから直接検証する (vitest, jsdom 環境)。

import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

function readBytes(rel: string): Buffer {
  return readFileSync(resolve(ROOT, rel));
}

/**
 * PNG のヘッダから幅 × 高さを読む。
 * PNG signature 8 bytes + IHDR length 4 + type 4 + width 4 + height 4。
 * IHDR の width / height はそれぞれ big-endian 4 バイト。
 */
function pngDimensions(rel: string): { width: number; height: number } {
  const buf = readBytes(rel);
  // 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A = PNG signature
  expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

describe('public/icons/ アイコン', () => {
  it('icon-192.png は 192×192', () => {
    const path = 'public/icons/icon-192.png';
    expect(existsSync(resolve(ROOT, path))).toBe(true);
    expect(pngDimensions(path)).toEqual({ width: 192, height: 192 });
  });

  it('icon-512.png は 512×512', () => {
    const path = 'public/icons/icon-512.png';
    expect(existsSync(resolve(ROOT, path))).toBe(true);
    expect(pngDimensions(path)).toEqual({ width: 512, height: 512 });
  });

  it('icon-maskable.png は 512×512 (maskable safe area 80% 想定)', () => {
    const path = 'public/icons/icon-maskable.png';
    expect(existsSync(resolve(ROOT, path))).toBe(true);
    expect(pngDimensions(path)).toEqual({ width: 512, height: 512 });
  });

  it('apple-touch-icon.png は 180×180 (iOS home screen 用)', () => {
    const path = 'public/icons/apple-touch-icon.png';
    expect(existsSync(resolve(ROOT, path))).toBe(true);
    expect(pngDimensions(path)).toEqual({ width: 180, height: 180 });
  });

  it('各 PNG は非空 (生成失敗ガード)', () => {
    for (const f of [
      'public/icons/icon-192.png',
      'public/icons/icon-512.png',
      'public/icons/icon-maskable.png',
      'public/icons/apple-touch-icon.png',
    ]) {
      const stat = statSync(resolve(ROOT, f));
      expect(stat.size).toBeGreaterThan(100);
    }
  });
});

describe('index.html meta タグ', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');

  it('apple-touch-icon link が含まれる', () => {
    expect(html).toMatch(/<link[^>]*rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon\.png"/);
  });

  it('apple-mobile-web-app-capable=yes', () => {
    expect(html).toMatch(/<meta[^>]*name="apple-mobile-web-app-capable"[^>]*content="yes"/);
  });

  it('apple-mobile-web-app-status-bar-style=black-translucent', () => {
    expect(html).toMatch(
      /<meta[^>]*name="apple-mobile-web-app-status-bar-style"[^>]*content="black-translucent"/,
    );
  });

  it('apple-mobile-web-app-title=動画圧縮', () => {
    expect(html).toMatch(/<meta[^>]*name="apple-mobile-web-app-title"[^>]*content="動画圧縮"/);
  });

  it('theme-color=#0a0a0a (manifest と同じ)', () => {
    expect(html).toMatch(/<meta[^>]*name="theme-color"[^>]*content="#0a0a0a"/);
  });

  it('lang="ja"', () => {
    expect(html).toMatch(/<html[^>]*lang="ja"/);
  });

  it('viewport-fit=cover (Safe Area inset 対応)', () => {
    expect(html).toMatch(/<meta[^>]*name="viewport"[^>]*content="[^"]*viewport-fit=cover/);
  });
});

describe('vite.config.ts VitePWA manifest 構成', () => {
  const src = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf-8');

  it('VitePWA plugin が import されている', () => {
    expect(src).toMatch(/import\s+\{\s*VitePWA\s*\}\s+from\s+['"]vite-plugin-pwa['"]/);
  });

  it('registerType: autoUpdate', () => {
    expect(src).toMatch(/registerType:\s*['"]autoUpdate['"]/);
  });

  it('manifest.name = 動画圧縮', () => {
    expect(src).toMatch(/name:\s*['"]動画圧縮['"]/);
  });

  it('manifest.display = standalone', () => {
    expect(src).toMatch(/display:\s*['"]standalone['"]/);
  });

  it('manifest.orientation = portrait', () => {
    expect(src).toMatch(/orientation:\s*['"]portrait['"]/);
  });

  it('manifest.background_color = #0a0a0a', () => {
    expect(src).toMatch(/background_color:\s*['"]#0a0a0a['"]/);
  });

  it('manifest icons に 192 / 512 / maskable がある', () => {
    expect(src).toMatch(/\/icons\/icon-192\.png/);
    expect(src).toMatch(/\/icons\/icon-512\.png/);
    expect(src).toMatch(/\/icons\/icon-maskable\.png/);
    expect(src).toMatch(/purpose:\s*['"]maskable['"]/);
  });
});
