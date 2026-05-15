import { defineConfig, devices } from '@playwright/test';

// Phase 6: vite preview (本番ビルドの SW 配信) でのみ意味を持つテスト群。
// `npm run test:e2e:offline` で起動。npm run dev ではなく vite preview を webServer に使う。
// build が必要なため遅め (10-20 秒)。
//
// CI とローカルで実行を分離: 既定の test:e2e は dev mode の高速 spec のみ、
// オフラインキャッシュ検証はこちらに分離。
export default defineConfig({
  testDir: './tests/e2e-preview',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    locale: 'ja-JP',
  },
  projects: [
    {
      name: 'webkit-iphone-preview',
      use: {
        ...devices['iPhone 15'],
        locale: 'ja-JP',
      },
    },
  ],
  webServer: {
    // vite preview は dist/ を 4173 で serve する。事前に build が必要。
    command: 'npm run build && npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
