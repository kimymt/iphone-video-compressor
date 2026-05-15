import { test, expect } from '@playwright/test';

// Phase 0-2 smoke E2E: dev override で起動し、タイトル + empty state が見えることを確認。

test('?dev=1 でタイトル「動画圧縮」 + empty state が表示される', async ({ page }) => {
  await page.goto('/?dev=1');
  // OPFS と IndexedDB を空にしてから再評価
  await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        await root.removeEntry(name, { recursive: true } as FileSystemRemoveOptions);
      }
    } catch {}
    indexedDB.deleteDatabase('movie-compresser');
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: '動画圧縮', level: 1 })).toBeVisible();
  await expect(page.getByText('まだ何もありません')).toBeVisible({ timeout: 5_000 });
});

test('日本語タイトル (document.title) が設定されている', async ({ page }) => {
  // V2.x: title は「動画圧縮 — iOS 26+ 専用」(iOS 26+ シグナル付き) に変更。
  // index.html の <title> と I18nProvider の useEffect の両方でセット。
  await page.goto('/?dev=1');
  await expect(page).toHaveTitle('動画圧縮 — iOS 26+ 専用');
});
