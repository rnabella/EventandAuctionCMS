import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

// Detect `--project=lite-e2e` / `--project lite-e2e` on the CLI so `workers`
// (a global, not per-project, setting) can be forced to 1 whenever the
// lite-e2e project is selected — see the `lite-e2e` project below for why.
const runsLiteE2E = process.argv.some((arg) => /(^|[=\s])lite-e2e$/.test(arg) || arg === 'lite-e2e');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: runsLiteE2E ? 1 : process.env.CI ? 4 : undefined,
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
      testMatch: '**/cms.setup.ts',
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
    {
      // EMS API login → playwright/.auth/ems-token.json (see tests/setup/api.setup.ts).
      name: 'api-setup',
      testMatch: '**/api.setup.ts',
    },
    {
      // Pure HTTP tests against the EMS / Lite APIs (tests/api). No browser.
      // Absolute URLs come from env.api.*, so the global CMS baseURL is unused here.
      name: 'api',
      testDir: './tests/api',
      dependencies: ['api-setup'],
    },
    {
      // Donor journeys on the public Lite UI (tests/e2e), verified through the
      // EMS API. Every journey moves the same event totals, so these must never
      // interleave — and a second spec file (Playwright can't serialize across
      // files) would run in parallel with the first under this project's
      // `fullyParallel: false` alone, since that only serialises tests *within*
      // one file. The actual guarantee is workers=1: enforced by the global
      // `workers` above whenever `lite-e2e` is selected on the CLI (via
      // `runsLiteE2E`), and belt-and-braces by the `--workers=1` flag on the
      // `test:e2e`/`test:e2e:headed` npm scripts. `fullyParallel: false` stays
      // set as a second layer for within-file ordering, but is not the guarantee.
      name: 'lite-e2e',
      testDir: './tests/e2e',
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['api-setup'],
    },
  ],
});
