import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 5 E2E:
 * - done で outputOpfsPath があれば Share ボタンが表示される
 * - done でも outputOpfsPath が無ければ Share ボタンは表示しない
 *
 * 実際の navigator.share() 動作は WebKit headless で限定的なため、
 * ボタンの可視性 / 順序のみを検証。
 *
 * Phase 4c E2E と同じく setState seed パターン。
 */

type SeededItem = {
  id: string;
  fileName: string;
  inputSize: number;
  inputOpfsPath: string;
  progress: number;
  preset: 'standard-hevc' | 'compat-h264';
  addedAt: number;
  status: 'queued' | 'starting' | 'processing' | 'done' | 'failed' | 'cancelled';
  outputSize?: number;
  outputOpfsPath?: string;
  finishedAt?: number;
  error?: string;
};

async function preparePage(page: Page): Promise<void> {
  await page.goto('/?dev=1');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('movie-compresser');
  });
  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __movieCompresserSetState?: unknown }).__movieCompresserSetState !== undefined,
    { timeout: 5_000 },
  );
}

async function seedItems(page: Page, items: SeededItem[]): Promise<void> {
  await page.evaluate((seeded: SeededItem[]) => {
    const setState = (
      window as unknown as {
        __movieCompresserSetState: (
          update: (state: { items: SeededItem[] }) => { items: SeededItem[] },
        ) => void;
      }
    ).__movieCompresserSetState;
    setState(() => ({ items: seeded }));
  }, items);
}

test.describe('Phase 5 Share button UI', () => {
  test.beforeEach(async ({ page }) => {
    await preparePage(page);
  });

  test('done + outputOpfsPath で Share ボタン表示 + aria-label 検証', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'sh1',
        fileName: 'IMG_4523.mov',
        inputSize: 10 * 1024 * 1024,
        inputOpfsPath: '',
        outputOpfsPath: 'outputs/sh1.mp4',
        outputSize: 2 * 1024 * 1024,
        finishedAt: 200,
        progress: 100,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'done',
      },
    ]);

    const item = page.getByTestId('queue-item').filter({ hasText: 'IMG_4523.mov' });
    const shareBtn = item.getByTestId('share-button');
    await expect(shareBtn).toBeVisible();
    await expect(shareBtn).toHaveAttribute('aria-label', 'IMG_4523.mov を共有');
    // Remove ボタンも並んで表示
    await expect(item.getByLabel(/削除/)).toBeVisible();
  });

  test('done でも outputOpfsPath が無いとき Share ボタンは出ない', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'sh-no-output',
        fileName: 'orphan-done.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        progress: 100,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'done',
      },
    ]);

    const item = page.getByTestId('queue-item').filter({ hasText: 'orphan-done.mov' });
    await expect(item).toBeVisible();
    await expect(item.getByTestId('share-button')).toHaveCount(0);
    // Remove は表示
    await expect(item.getByLabel(/削除/)).toBeVisible();
  });

  test('processing / queued / failed / cancelled では Share ボタンは出ない', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'p',
        fileName: 'p.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/p.mov',
        progress: 50,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'processing',
      },
      {
        id: 'q',
        fileName: 'q.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/q.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 200,
        status: 'queued',
      },
      {
        id: 'f',
        fileName: 'f.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/f.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 300,
        status: 'failed',
        error: 'x',
      },
      {
        id: 'c',
        fileName: 'c.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/c.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 400,
        status: 'cancelled',
      },
    ]);

    await expect(page.getByTestId('queue-item')).toHaveCount(4);
    await expect(page.getByTestId('share-button')).toHaveCount(0);
  });

  test('done 複数件で Share ボタンが各行に並ぶ', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'd1',
        fileName: 'a.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        outputOpfsPath: 'outputs/d1.mp4',
        outputSize: 256,
        finishedAt: 200,
        progress: 100,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'done',
      },
      {
        id: 'd2',
        fileName: 'b.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        outputOpfsPath: 'outputs/d2.mp4',
        outputSize: 256,
        finishedAt: 250,
        progress: 100,
        preset: 'standard-hevc',
        addedAt: 200,
        status: 'done',
      },
    ]);

    await expect(page.getByTestId('share-button')).toHaveCount(2);
  });
});
