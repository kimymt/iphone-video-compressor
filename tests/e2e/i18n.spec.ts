import { test, expect } from '@playwright/test';

/**
 * V2: i18n (多言語対応) の E2E。
 *
 * 検証項目:
 * - 初回 (localStorage 空 + ja-JP locale): タイトル「動画圧縮」(日本語)
 * - SettingsSheet に言語ピッカー存在
 * - 自動 / 日本語 / English の 3 オプション
 * - English に切替 → タイトル「Video Compressor」+ メイン UI 英語化
 * - リロード後も英語のまま (localStorage 永続化)
 * - 日本語に戻す → 即時日本語化
 *
 * 注: playwright.config.ts で locale='ja-JP' 固定。
 * 個別テストで localStorage を直接書く方法も使う。
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/?dev=1');
  // OPFS + IndexedDB + localStorage を空にしてから検証
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

test('初期状態 (auto + ja-JP locale): 日本語 UI で起動', async ({ page }) => {
  // ヘッダ「動画圧縮」が見える
  await expect(page.getByRole('heading', { name: '動画圧縮', level: 1 })).toBeVisible();
  // EmptyState も日本語
  await expect(page.getByText('まだ何もありません')).toBeVisible();
  // FilePicker の CTA も日本語
  await expect(page.getByRole('button', { name: '動画を選択' })).toBeVisible();
});

test('SettingsSheet に言語ピッカー (自動 / 日本語 / English)', async ({ page }) => {
  await page.getByTestId('open-settings').click();

  // 言語セクションが存在
  await expect(page.getByRole('heading', { name: /言語/, level: 3 })).toBeVisible();

  // 3 つの radio
  await expect(page.getByTestId('settings-language-auto')).toBeVisible();
  await expect(page.getByTestId('settings-language-ja')).toBeVisible();
  await expect(page.getByTestId('settings-language-en')).toBeVisible();

  // 既定 (localStorage 空) は auto
  await expect(page.getByTestId('settings-language-auto')).toHaveAttribute('aria-checked', 'true');
});

test('English に切替 → タイトルが Video Compressor に', async ({ page }) => {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-language-en').click();

  // aria-checked が en に
  await expect(page.getByTestId('settings-language-en')).toHaveAttribute('aria-checked', 'true');

  // SettingsSheet 内の見出しも英語化
  await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();

  // Sheet を閉じる
  await page.getByTestId('settings-sheet-close').click();

  // ヘッダのタイトルが英語化
  await expect(page.getByRole('heading', { name: 'Video Compressor', level: 1 })).toBeVisible();

  // EmptyState も英語化
  await expect(page.getByText('Nothing here yet')).toBeVisible();

  // FilePicker CTA も英語化
  await expect(page.getByRole('button', { name: 'Select Video' })).toBeVisible();

  // localStorage に永続化されている
  const stored = await page.evaluate(() => localStorage.getItem('iVC.settings.v1'));
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!).language).toBe('en');
});

test('English 切替後にリロードしても永続化される', async ({ page }) => {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-language-en').click();
  await page.reload();
  // ?dev=1 を保持してリロードされるはずだが念のため
  await page.goto('/?dev=1');

  // 英語で起動
  await expect(page.getByRole('heading', { name: 'Video Compressor', level: 1 })).toBeVisible();
  // SettingsSheet を開いても en が選択中
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-language-en')).toHaveAttribute('aria-checked', 'true');
});

test('English → 日本語に戻す → 即時切替', async ({ page }) => {
  // まず英語に
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-language-en').click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();

  // 日本語に戻す
  await page.getByTestId('settings-language-ja').click();
  await expect(page.getByRole('heading', { name: '設定', level: 2 })).toBeVisible();
  await page.getByTestId('settings-sheet-close').click();
  await expect(page.getByRole('heading', { name: '動画圧縮', level: 1 })).toBeVisible();
});

test('英語モード: プリセット名も翻訳される', async ({ page }) => {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-language-en').click();

  // 標準 (HEVC) ← 既定で checked → 英語化: "Standard (HEVC)"
  const standardPreset = page.getByTestId('settings-preset-standard-hevc');
  await expect(standardPreset).toContainText('Standard (HEVC)');
  await expect(standardPreset).toContainText('default');

  // 互換優先 → "Compatible (H.264)"
  await expect(page.getByTestId('settings-preset-compat-h264')).toContainText(
    'Compatible (H.264)',
  );
});

test('<html lang> が locale に追従', async ({ page }) => {
  // 初期は ja (ja-JP locale + auto preference)
  let lang = await page.evaluate(() => document.documentElement.lang);
  expect(lang).toBe('ja');

  // English に切替後 → 'en'
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-language-en').click();
  lang = await page.evaluate(() => document.documentElement.lang);
  expect(lang).toBe('en');
});
