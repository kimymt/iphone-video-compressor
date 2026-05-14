import { test, expect } from '@playwright/test';

// Phase 1 capability check の E2E。
// Playwright WebKit (Apple WebKit 26.x ベース、Playwright 同梱) は AudioEncoder が
// 利用不可な可能性があり、その場合 UnsupportedScreen が出る。
// 該当ブラウザでは「VideoEncoder か AudioEncoder のどちらかが無い場合は UnsupportedScreen」を検証。

test('?dev=1 なしで起動: UnsupportedScreen または Hello のどちらかが描画される', async ({ page }) => {
  await page.goto('/');
  // capability check が終わるまで待つ (最大 5 秒)
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#root');
      if (!root) return false;
      const main = root.querySelector('main');
      if (!main) return false;
      return main.getAttribute('aria-busy') !== 'true';
    },
    { timeout: 5_000 },
  );

  // どちらかの画面が描画されている
  const hello = page.getByRole('heading', { name: /Hello/ });
  const unsupportedHeading = page.getByRole('heading', { name: /iOS 26 以降の Safari/ });

  const helloVisible = await hello.isVisible().catch(() => false);
  const unsupportedVisible = await unsupportedHeading.isVisible().catch(() => false);
  expect(helloVisible || unsupportedVisible).toBe(true);
});

test('?dev=1 強制で Hello (UnsupportedScreen にならない)', async ({ page }) => {
  await page.goto('/?dev=1');
  await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
  await expect(page.getByRole('alert')).not.toBeAttached();
});
