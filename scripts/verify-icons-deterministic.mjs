#!/usr/bin/env node
/**
 * V2.x MINOR #6: icon generation の決定性 smoke test。
 *
 * 目的:
 *   committed されている public/icons/*.png が現在の SVG ソース + 現在の
 *   Playwright/chromium バージョンで再現可能か (byte-identical か) を確認する。
 *
 * 検出できる回帰:
 *   - SVG ソースの意図しない変更
 *   - generate-icons.mjs のロジック変更で出力が変わる
 *   - Playwright/chromium のバージョン違いで anti-aliasing が変わる
 *
 * 実行: npm run icons:verify
 *   exit 0: 全アイコンが committed と byte-identical (決定性 OK)
 *   exit 1: 1 つ以上のアイコンが differ → 詳細を出力
 *
 * 注意:
 *   このスクリプトは public/icons/*.png を上書きする。途中で異常終了した
 *   場合は `git checkout public/icons/` で元に戻せる。
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const iconFiles = [
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/icon-maskable.png',
  'public/icons/apple-touch-icon.png',
];

/** ファイルの SHA-256 を 16 進数で返す。 */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

console.log('=== Icon determinism smoke test ===\n');

// 1) baseline = 現在 committed されているアイコンの hash
const baselineHashes = Object.fromEntries(
  iconFiles.map((p) => [p, sha256(join(repoRoot, p))]),
);
console.log('Baseline (currently committed):');
for (const [p, h] of Object.entries(baselineHashes)) {
  console.log(`  ${p.padEnd(35)} sha256=${h.slice(0, 16)}...`);
}

// 2) regenerate (public/icons/*.png を上書き)
console.log('\nRegenerating icons (`node scripts/generate-icons.mjs`)...\n');
execSync('node scripts/generate-icons.mjs', { stdio: 'inherit', cwd: repoRoot });

// 3) compare
const newHashes = Object.fromEntries(
  iconFiles.map((p) => [p, sha256(join(repoRoot, p))]),
);
console.log('\nRegenerated:');
let mismatchCount = 0;
for (const [p, h] of Object.entries(newHashes)) {
  const match = h === baselineHashes[p];
  const marker = match ? '✓ (identical)' : '⚠ DIFFERS';
  console.log(`  ${p.padEnd(35)} sha256=${h.slice(0, 16)}... ${marker}`);
  if (!match) mismatchCount++;
}

console.log();
if (mismatchCount > 0) {
  console.error(`❌ Icon generation is NOT deterministic. ${mismatchCount} / ${iconFiles.length} PNG differs from committed baseline.\n`);
  console.error('考えられる原因:');
  console.error('  - SVG ソース (scripts/icons/*.svg) を変更したまま icons を再生成していない');
  console.error('  - Playwright / chromium のバージョンが committed 時から変わった');
  console.error('  - generate-icons.mjs のロジックが変わった (rendering pipeline)');
  console.error('\n復元: `git checkout public/icons/` で committed バージョンに戻す');
  process.exit(1);
}

console.log('✅ Icon generation is deterministic (regenerated PNGs are byte-identical to committed baseline).');
console.log('   SVG → PNG パイプライン (Playwright / chromium) は現在再現可能。');
