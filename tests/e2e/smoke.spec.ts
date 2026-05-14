import { test, expect } from '@playwright/test';

// Phase 0 smoke test: dev サーバーが起動して「Hello」が表示される。
// 各 Phase で機能ごとに E2E test を追加していく。
test('Hello が表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
});

test('日本語タイトルが表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('動画圧縮');
});
