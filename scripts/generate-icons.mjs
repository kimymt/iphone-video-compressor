#!/usr/bin/env node
/**
 * PWA アイコン PNG を SVG master からレンダリングする。
 *
 * - 入力: scripts/icons/icon.svg (rounded) + scripts/icons/icon-maskable.svg (full-bleed)
 * - 出力: public/icons/{icon-192,icon-512,icon-maskable,apple-touch-icon}.png
 *
 * ImageMagick / librsvg / sharp 等を入れずに済むよう、Playwright (chromium) で
 * SVG を viewport 全画面に表示 → screenshot で PNG を吐く。
 * Playwright は test:e2e 用にすでに devDep に入っているので追加依存なし。
 *
 * 実行: npm run icons
 * 単独: node scripts/generate-icons.mjs
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const iconSrcDir = join(__dirname, 'icons');
const publicIcons = join(repoRoot, 'public', 'icons');

const rounded = readFileSync(join(iconSrcDir, 'icon.svg'), 'utf-8');
const maskable = readFileSync(join(iconSrcDir, 'icon-maskable.svg'), 'utf-8');

// SVG の width/height 属性を 100% に置換 (viewBox はそのまま) して viewport にフィットさせる。
function fitToViewport(svg) {
  return svg.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, 'height="100%"');
}

const targets = [
  { size: 192, output: 'icon-192.png', svg: fitToViewport(rounded), label: 'rounded' },
  { size: 512, output: 'icon-512.png', svg: fitToViewport(rounded), label: 'rounded' },
  { size: 512, output: 'icon-maskable.png', svg: fitToViewport(maskable), label: 'maskable' },
  { size: 180, output: 'apple-touch-icon.png', svg: fitToViewport(rounded), label: 'rounded' },
];

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });

try {
  for (const { size, output, svg, label } of targets) {
    const page = await context.newPage();
    await page.setViewportSize({ width: size, height: size });
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { width: 100vw; height: 100vh; overflow: hidden; }
  svg { display: block; width: 100vw; height: 100vh; }
</style>
</head>
<body>
${svg}
</body>
</html>`;
    await page.setContent(html);
    // SVG の rasterize 完了を 1 frame 待つ
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.screenshot({
      path: join(publicIcons, output),
      type: 'png',
      omitBackground: false,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
    console.log(`✓ ${output.padEnd(24)} ${size}x${size} (${label})`);
  }
} finally {
  await context.close();
  await browser.close();
}
