import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from './tests/support/env';

loadEnv();

export default defineConfig({
  testDir: './tests',
  timeout: 360_000,
  expect: { timeout: 25_000 },
  // The checks share live accounts and records, so they run one at a time, in file-name order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'reports/artifacts',
  reporter: [['list'], ['html', { outputFolder: 'reports/html', open: 'never' }]],
  use: {
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 25_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'p1',
      testMatch: /p1[/\\]\d{2}-.+\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
