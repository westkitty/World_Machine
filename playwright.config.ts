import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright browser test configuration for The World Machine.
 * Validates real-browser execution paths across desktop and mobile-touch emulation.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-touch',
      use: {
        ...devices['Pixel 7'],
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'bun run dev --port 5173',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
