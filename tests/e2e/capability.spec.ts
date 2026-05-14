import { test, expect } from '@playwright/test';

// Phase 1 capability check の E2E。

test('?dev=1 なしで起動: UnsupportedScreen または メイン画面 のどちらかが描画される', async ({ page }) => {
  await page.goto('/');
  // capability check が終わるまで待つ (aria-busy=true が剥がれる)
  await page.waitForFunction(
    () => {
      const main = document.querySelector('main');
      if (!main) return false;
      return main.getAttribute('aria-busy') !== 'true';
    },
    { timeout: 5_000 },
  );

  // どちらかの画面が描画されている (Webkit のフル WebCodecs サポートに依存)
  const mainHeading = page.getByRole('heading', { name: '動画圧縮', level: 1 });
  const unsupportedHeading = page.getByRole('heading', { name: /iOS 26 以降の Safari/ });

  const mainVisible = await mainHeading.isVisible().catch(() => false);
  const unsupportedVisible = await unsupportedHeading.isVisible().catch(() => false);
  expect(mainVisible || unsupportedVisible).toBe(true);
});

test('?dev=1 強制でメイン画面 (UnsupportedScreen にならない)', async ({ page }) => {
  await page.goto('/?dev=1');
  await expect(page.getByRole('heading', { name: '動画圧縮', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).not.toBeAttached();
});
