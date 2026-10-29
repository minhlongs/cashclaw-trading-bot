import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'pr35-operations.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['line']],
  outputDir: process.env.PR35_PLAYWRIGHT_OUTPUT_DIR ?? '.wrangler/verification/pr35-playwright-raw/test-results',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1365, height: 900 },
    baseURL: process.env.PR35_BASE_URL ?? 'http://127.0.0.1:8787',
    headless: true,
    trace: 'on',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 10_000,
  },
});
