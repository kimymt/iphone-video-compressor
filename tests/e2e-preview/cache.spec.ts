import { test, expect } from '@playwright/test';

test('WebKit stores HTML and manifest in CacheStorage before going offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  // This proves cache contents only, not offline navigation or fetch delivery.
  const entries = await page.evaluate(async () => {
    const found: Record<string, string> = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        if (path === '/index.html' || path === '/manifest.webmanifest') {
          const response = await cache.match(request);
          if (response?.ok) found[path] = await response.text();
        }
      }
    }
    return found;
  });
  expect(entries['/index.html']).toContain('id="root"');
  expect(JSON.parse(entries['/manifest.webmanifest']!).name).toBe('動画圧縮');
});
