import { test, expect } from '@playwright/test';

/**
 * Phase 6 offline E2E:
 * vite preview で配信される本番 SW + precache が、オフラインリロード後も
 * メイン画面を描画できることを確認する。
 *
 * dev mode の SW は precache 範囲が異なるため、この検証は preview 限定。
 * `npm run test:e2e:offline` で実行。
 */

test.describe('Phase 6 offline (preview build)', () => {
  test('SW 登録 → controller セット → オフラインで index.html がキャッシュから返る', async ({
    page,
    context,
  }) => {
    await page.goto('/?dev=1');

    // 本番 SW が controller を握るまで待つ
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      { timeout: 10_000 },
    );

    await context.setOffline(true);
    const uncachedFailed = await page.evaluate(async () => {
      try { await fetch('/offline-network-probe.txt', { cache: 'no-store' }); return false; }
      catch { return true; }
    });
    expect(uncachedFailed).toBe(true);

    // APIRequestContext is not affected by context.setOffline(). Fetch from the
    // controlled browser page so this really exercises offline Service Worker routing.
    const res = await page.evaluate(async () => {
      const response = await fetch('/index.html');
      return { status: response.status, html: await response.text() };
    });
    expect(res.status).toBe(200);
    const html = res.html;
    // V2.x: title は「動画圧縮 — iOS 26+ 専用」(iOS 26+ シグナル付き)
    expect(html).toMatch(/<title>動画圧縮 — iOS 26\+ 専用<\/title>/);
    expect(html).toMatch(/id="root"/);
    await page.reload();
    await expect(page.getByRole('heading', { name: '動画圧縮', level: 1 })).toBeVisible();
    await expect(page.getByText('まだ何もありません')).toBeVisible();

    await context.setOffline(false);
  });

  test('manifest.webmanifest もオフラインで配信される (precache 範囲確認)', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      { timeout: 10_000 },
    );

    await context.setOffline(true);
    const uncachedFailed = await page.evaluate(async () => {
      try { await fetch('/offline-network-probe.txt', { cache: 'no-store' }); return false; }
      catch { return true; }
    });
    expect(uncachedFailed).toBe(true);
    const res = await page.evaluate(async () => {
      const response = await fetch('/manifest.webmanifest');
      return { status: response.status, manifest: await response.json() };
    });
    expect(res.status).toBe(200);
    const m = res.manifest as { name: string };
    expect(m.name).toBe('動画圧縮');
    await context.setOffline(false);
  });
});
