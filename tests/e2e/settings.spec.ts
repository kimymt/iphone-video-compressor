import { test, expect } from '@playwright/test';

/**
 * V1.1: SettingsSheet (歯車) の E2E。
 *
 * 確認項目:
 * - 歯車ボタンが header に存在
 * - 歯車タップで sheet が data-state=open に
 * - 閉じるボタンで sheet が data-state=closed に
 * - プリセット選択で aria-checked が切り替わる
 * - localStorage に永続化される (リロードで保持)
 * - backdrop クリックで閉じる
 *
 * 注意: Playwright WebKit headless では `touch` イベントの emulation が限定的なので、
 * drag-to-dismiss は unit テスト側で検証する。E2E では tap-backdrop / close ボタンを覆う。
 */

test.beforeEach(async ({ page }) => {
  // 既存のキューと localStorage を空にしてからテスト開始
  await page.goto('/?dev=1');
  await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        await root.removeEntry(name, { recursive: true } as FileSystemRemoveOptions);
      }
    } catch {}
    indexedDB.deleteDatabase('movie-compresser');
    localStorage.removeItem('iVC.settings.v1');
  });
  await page.reload();
});

test('歯車ボタンが表示され、タップで SettingsSheet が開く', async ({ page }) => {
  const gearButton = page.getByTestId('open-settings');
  await expect(gearButton).toBeVisible();
  await expect(gearButton).toHaveAttribute('aria-label', '設定を開く');

  await gearButton.click();
  const sheet = page.getByTestId('settings-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await expect(sheet).toHaveAttribute('role', 'dialog');
});

test('閉じるボタンで sheet が閉じる (data-state=closed)', async ({ page }) => {
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-sheet')).toHaveAttribute('data-state', 'open');

  await page.getByTestId('settings-sheet-close').click();
  await expect(page.getByTestId('settings-sheet')).toHaveAttribute('data-state', 'closed');
});

test('backdrop タップで sheet が閉じる', async ({ page }) => {
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-sheet')).toHaveAttribute('data-state', 'open');

  // backdrop は inset-0 で画面全体を覆うが、panel が下部 85vh を占めるので
  // 上部の領域 (y=10) をタップして panel に被らないようにする。
  await page.getByLabel('設定を閉じる').click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('settings-sheet')).toHaveAttribute('data-state', 'closed');
});

test('プリセットを切り替えると aria-checked が反映、localStorage に永続化', async ({
  page,
}) => {
  await page.getByTestId('open-settings').click();

  // 既定は standard-hevc
  await expect(page.getByTestId('settings-preset-standard-hevc')).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // light-hevc に切り替え
  await page.getByTestId('settings-preset-light-hevc').click();
  await expect(page.getByTestId('settings-preset-light-hevc')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('settings-preset-standard-hevc')).toHaveAttribute(
    'aria-checked',
    'false',
  );

  // localStorage に書き込まれている
  const stored = await page.evaluate(() => localStorage.getItem('iVC.settings.v1'));
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!).preset).toBe('light-hevc');

  // リロードしても保持
  await page.reload();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-preset-light-hevc')).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('バージョン情報が v1.0.0 形式で表示される', async ({ page }) => {
  await page.getByTestId('open-settings').click();
  const version = page.getByTestId('settings-version');
  await expect(version).toBeVisible();
  await expect(version).toHaveText(/^v\d+\.\d+\.\d+/);
});

test('カメラ案内を dismiss すると非表示になる', async ({ page }) => {
  await page.getByTestId('open-settings').click();
  const dismissButton = page.getByTestId('settings-camera-dismiss');
  await expect(dismissButton).toBeVisible();
  await dismissButton.click();
  await expect(dismissButton).not.toBeVisible();

  // 閉じて再度開いても表示されない (localStorage 永続化)
  await page.getByTestId('settings-sheet-close').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-camera-dismiss')).not.toBeVisible();
});
