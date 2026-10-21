import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from './tests/helpers/env';

loadEnv();

export default defineConfig({
  testDir: './tests/p1',
  timeout: 360_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'reports/artifacts',
  reporter: [['list']],
  use: {
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 25_000,
    navigationTimeout: 45_000,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'p1',
      testMatch: /[/\\]\d{2}-.+\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
