import { test, expect } from '@playwright/test';

// Phase 1 以降: capability check を経て分岐する。
// Playwright WebKit (26.x) は WebCodecs の audio classes が無いことがあるため、
// 確実に Hello を出すには ?dev=1 を使う。

test('?dev=1 で Hello が表示される', async ({ page }) => {
  await page.goto('/?dev=1');
  await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
});

test('日本語タイトルが設定されている', async ({ page }) => {
  await page.goto('/?dev=1');
  await expect(page).toHaveTitle('動画圧縮');
});
