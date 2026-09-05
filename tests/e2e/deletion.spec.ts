import { test, expect } from '@playwright/test';

// WebKit headless は OPFS 書込みに制限があるため、実ストレージの検証は Chromium。
// phase4c.spec.ts は WebKit で個別・一括削除の画面操作を検証する。
test.use({ browserName: 'chromium' });

test('削除失敗した動画は警告と管理情報を残し、再起動で削除を完了する', async ({ page }) => {
  await page.goto('/?dev=1');
  await page.waitForFunction(() =>
    (window as unknown as { __movieCompresserStore?: { initialized: boolean } })
      .__movieCompresserStore?.initialized === true,
  );
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const outputs = await root.getDirectoryHandle('outputs', { create: true });
    const file = await outputs.getFileHandle('deletion-regression.mp4', { create: true });
    const writable = await file.createWritable();
    await writable.write('synthetic private video');
    await writable.close();
    const prototype = Object.getPrototypeOf(outputs) as FileSystemDirectoryHandle;
    const originalRemove = prototype.removeEntry;
    prototype.removeEntry = async function (name, options) {
      if (name === 'deletion-regression.mp4') {
        throw new DOMException('synthetic lock', 'NoModificationAllowedError');
      }
      return originalRemove.call(this, name, options);
    };
  });
  await page.evaluate((items) => {
    (window as unknown as { __movieCompresserSetState: (state: unknown) => void })
      .__movieCompresserSetState({ items });
  }, [{
    id: 'deletion-regression', fileName: 'private.mov', inputSize: 100,
    inputOpfsPath: '', outputOpfsPath: 'outputs/deletion-regression.mp4',
    progress: 100, preset: 'standard-hevc', addedAt: 100, status: 'done',
  }]);

  const item = page.getByTestId('queue-item').filter({ hasText: 'private.mov' });
  await item.getByLabel(/削除/).click();
  await expect(item.getByRole('alert')).toContainText('端末内に残っている可能性');
  await expect(item.getByLabel(/削除/)).toBeEnabled();
  expect(await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const outputs = await root.getDirectoryHandle('outputs');
    return (await (await outputs.getFileHandle('deletion-regression.mp4')).getFile()).text();
  })).toBe('synthetic private video');

  // reload で合成ロックが消える。保存された削除要求から自動で再試行する。
  await page.reload();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  expect(await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const outputs = await root.getDirectoryHandle('outputs');
    try {
      await outputs.getFileHandle('deletion-regression.mp4');
      return false;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return true;
      throw error;
    }
  })).toBe(true);
});
