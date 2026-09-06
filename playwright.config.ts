import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  // The shared Integration event's list pages (Tickets, Auction Items, ...)
  // accumulate rows every run by design (see README's test data policy) and
  // render noticeably slower as a result — the default 30s test timeout isn't
  // enough headroom under real load. `npm run cleanup` (the "maintenance"
  // project below) periodically clears the accumulated rows; this timeout is
  // a safety margin on top of that, not a substitute for running it.
  timeout: 90_000,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: env.cms.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: '**/*.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Login itself must start unauthenticated, so this project is excluded
      // from the `setup` dependency and the shared storageState below.
      name: 'cms-auth',
      testDir: './tests/cms/auth',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'cms-chromium',
      testDir: './tests/cms',
      testIgnore: '**/auth/**',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    {
      // Deletes accumulated test data (see tests/maintenance/cleanup-test-data.spec.ts).
      // Deliberately NOT included in `npm test` (see package.json) — run explicitly
      // via `npm run cleanup` only, since it performs real deletions.
      name: 'maintenance',
      testDir: './tests/maintenance',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    // Firefox/WebKit and Lite UI-specific projects are added in Phase 2 once the
    // architecture for cross-browser and multi-app config is agreed.
  ],
});
