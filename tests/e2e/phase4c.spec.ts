import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 4c E2E:
 * - retry ボタンが failed/cancelled で表示され、click で store.retry が呼ばれる
 * - clearCompleted ボタンが terminal アイテム 1+ で表示され、click で対象が消える
 *
 * Phase 2 E2E と同様、WebKit headless での OPFS transient エラーを避けるため、
 * 実 add() 経由ではなく zustand の setState 経由でアイテムを seed する。
 * setState は App.tsx が dev mode のみ window.__movieCompresserSetState に露出。
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
  // Playwright は各テストに独立したストレージを用意する。
  // アプリが開いた DB を削除すると、削除要求の永続化まで失敗してしまう。
  await page.waitForFunction(
    () => (window as unknown as { __movieCompresserStore?: { initialized: boolean } })
      .__movieCompresserStore?.initialized === true,
    undefined,
    { timeout: 5_000 },
  );
  // このスイートはメタ情報だけを seed する UI テスト。動画実体は存在しない。
  // WebKit headless の UnknownError に依存せず、空の OPFS の NotFound を再現する。
  // 実ファイルの削除は deletion.spec.ts (Chromium) で別途検証する。
  await page.evaluate(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator.storage), 'getDirectory', {
      configurable: true,
      value: async () => ({
        getDirectoryHandle: async () => { throw new DOMException('not found', 'NotFoundError'); },
      }),
    });
  });
}

async function seedItems(page: Page, items: SeededItem[]): Promise<void> {
  await page.evaluate((seeded: SeededItem[]) => {
    const setState = (window as unknown as {
      __movieCompresserSetState: (
        update: (state: { items: SeededItem[] }) => { items: SeededItem[] },
      ) => void;
    }).__movieCompresserSetState;
    setState(() => ({ items: seeded }));
  }, items);
}

test.describe('Phase 4c retry / clearCompleted UI', () => {
  test.beforeEach(async ({ page }) => {
    await preparePage(page);
  });

  test('failed item に Retry + Remove ボタンが表示される', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'e2e-f',
        fileName: 'fail-test.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/e2e-f.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'failed',
        error: 'mocked E2E failure',
      },
    ]);

    const item = page.getByTestId('queue-item').filter({ hasText: 'fail-test.mov' });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('data-status', 'failed');
    await expect(item.getByLabel(/再試行/)).toBeVisible();
    await expect(item.getByLabel(/削除/)).toBeVisible();
    await expect(item.getByLabel(/処理を中止/)).toHaveCount(0);
    // 内部エラー文字列は利用者向け文言へ置き換えて表示する。
    await expect(item).toContainText('この動画は処理できませんでした');
  });

  test('cancelled item にも Retry + Remove ボタンが表示される', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'e2e-c',
        fileName: 'cancelled-test.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/e2e-c.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'cancelled',
      },
    ]);

    const item = page.getByTestId('queue-item').filter({ hasText: 'cancelled-test.mov' });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('data-status', 'cancelled');
    await expect(item.getByLabel(/再試行/)).toBeVisible();
    await expect(item.getByLabel(/削除/)).toBeVisible();
  });

  test('inputOpfsPath="" の failed では Retry ボタンが disabled', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'e2e-f-noinput',
        fileName: 'orphaned.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'failed',
        error: 'input gone',
      },
    ]);

    const item = page.getByTestId('queue-item').filter({ hasText: 'orphaned.mov' });
    const retryBtn = item.getByLabel(/再試行/);
    await expect(retryBtn).toBeVisible();
    await expect(retryBtn).toBeDisabled();
    await expect(retryBtn).toHaveAttribute('aria-disabled', 'true');
  });

  test('done では Retry ボタンが出ない (Remove のみ)', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'e2e-d',
        fileName: 'done-test.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        outputOpfsPath: 'outputs/e2e-d.mp4',
        outputSize: 512,
        finishedAt: 200,
        progress: 100,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'done',
      },
    ]);

    const item = page.getByTestId('queue-item').filter({ hasText: 'done-test.mov' });
    await expect(item).toBeVisible();
    await expect(item.getByLabel(/削除/)).toBeVisible();
    await expect(item.getByLabel(/再試行/)).toHaveCount(0);
  });

  test('terminal アイテム 0 件では Clear Completed ボタンは出ない', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'q1',
        fileName: 'queued.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/q1.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'queued',
      },
    ]);
    await expect(page.getByTestId('clear-completed')).toHaveCount(0);
  });

  test('terminal アイテム 3 件で Clear Completed ボタンに件数表示', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'd',
        fileName: 'done.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        outputOpfsPath: 'outputs/d.mp4',
        outputSize: 256,
        finishedAt: 200,
        progress: 100,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'done',
      },
      {
        id: 'f',
        fileName: 'fail.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/f.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 200,
        status: 'failed',
        error: 'x',
      },
      {
        id: 'c',
        fileName: 'canc.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/c.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 300,
        status: 'cancelled',
      },
    ]);

    const btn = page.getByTestId('clear-completed');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('完了をすべて削除 (3)');
    await expect(btn).toHaveAttribute('aria-label', '完了したアイテム 3 件をすべて削除');
  });

  test('Clear Completed クリックで terminal アイテムが消え、queued は残る', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'd',
        fileName: 'done.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        outputOpfsPath: 'outputs/d.mp4',
        outputSize: 256,
        finishedAt: 200,
        progress: 100,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'done',
      },
      {
        id: 'q',
        fileName: 'queued.mov',
        inputSize: 1024,
        inputOpfsPath: 'inputs/q.mov',
        progress: 0,
        preset: 'standard-hevc',
        addedAt: 200,
        status: 'queued',
      },
    ]);

    await expect(page.getByTestId('queue-item')).toHaveCount(2);
    await page.getByTestId('clear-completed').click();
    await expect(page.getByTestId('queue-item')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.getByText('queued.mov')).toBeVisible();
    // ボタンも消える (terminal が 0 になった)
    await expect(page.getByTestId('clear-completed')).toHaveCount(0);
  });

  test('Remove ボタンで個別アイテム削除も動く (Phase 4b 動作の回帰確認)', async ({ page }) => {
    await seedItems(page, [
      {
        id: 'rm1',
        fileName: 'a.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        progress: 100,
        outputSize: 256,
        finishedAt: 200,
        preset: 'standard-hevc',
        addedAt: 100,
        status: 'done',
      },
      {
        id: 'rm2',
        fileName: 'b.mov',
        inputSize: 1024,
        inputOpfsPath: '',
        progress: 100,
        outputSize: 256,
        finishedAt: 200,
        preset: 'standard-hevc',
        addedAt: 200,
        status: 'done',
      },
    ]);

    await expect(page.getByTestId('queue-item')).toHaveCount(2);
    // a.mov の Remove だけ押す
    const itemA = page.getByTestId('queue-item').filter({ hasText: 'a.mov' });
    await itemA.getByLabel(/削除/).click();
    await expect(page.getByTestId('queue-item')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.getByText('b.mov')).toBeVisible();
    // Clear Completed ボタンは残った 1 件 (done) を表示
    await expect(page.getByTestId('clear-completed')).toContainText('完了をすべて削除 (1)');
  });
});
