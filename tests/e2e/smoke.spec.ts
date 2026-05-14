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
  await page.goto('/?dev=1');
  await expect(page).toHaveTitle('動画圧縮');
});
