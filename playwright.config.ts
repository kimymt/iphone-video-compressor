import { defineConfig, devices } from '@playwright/test';

// Phase 0 最小設定。WebKit (Safari エンジン) のみ。
// Phase 3 以降で iPhone viewport を追加して動画パイプラインの E2E に拡張。
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // V2: 既存テストは日本語前提なので locale を ja-JP に固定。
    // 言語切替の E2E は localStorage に 'language' を書いてから reload する。
    locale: 'ja-JP',
  },
  projects: [
    {
      name: 'webkit-iphone',
      use: {
        ...devices['iPhone 15'],
        locale: 'ja-JP',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
