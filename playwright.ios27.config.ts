import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ios27', workers: 1, reporter: [['list'], ['json', { outputFile: 'test-results/ios27-report.json' }]],
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
