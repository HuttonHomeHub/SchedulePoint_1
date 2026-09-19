import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for **page composition** (ADR-0146,
 * `docs/specs/page-composition/`) — one measure, one frame, one column model across the
 * non-canvas screens.
 *
 * **It lands with M1, the first milestone a planner can see, rather than at the gate pass**
 * (ADR-0081 §2). The rule that milestone exists to honour is this repository's most-repeated
 * finding: a capability with no entry point passes every unit test it has, because its tests call
 * it directly. Five instances are on the register. The three facts this journey asserts —
 * a table's rows are inside a named region, a section states its count, and a heading and the first
 * cell beneath it share a left edge — are **all layout facts**, and jsdom has no layout, so the
 * unit tier cannot ask any of them even in principle.
 *
 * **No feature flag.** ADR-0088 D1 established that a `VITE_` constant is inlined at build time and
 * has never been an operator rollback; the rollback for this epic is a commit boundary. The `env`
 * block below therefore pins only what this journey's fixture needs, and pins nothing this epic
 * introduces.
 *
 * Chromium only (`docs/TECH_DEBT.md` #25a), serial (one organisation's clients, calendars and
 * resources are created and mutated throughout). Its own CI step and `ci-roster.json` entry land in
 * the same commit — `check:ci-roster` refuses a script without one (ADR-0136).
 */
export default defineConfig({
  testDir: './e2e-page-composition',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-page-composition' }]]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /**
         * **1646, the product owner's Surface Pro.** ADR-0091's retrospective records two whole
         * epics of command-surface work measured at 1920, 1440, 1024 and 768 and never once at the
         * width the result was judged on. This epic's own M0 then found that at 1646 the page
         * measure does not even bind — the region does — so a screen's width here is a different
         * number from the one at 1920. A journey run at any other width would be asserting about a
         * layout the person reporting the defect never sees.
         */
        viewport: { width: 1646, height: 1000 },
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: [
          {
            command: 'pnpm --filter @repo/api exec nest start',
            url: 'http://localhost:3000/api/v1/health',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { LOG_LEVEL: 'silent' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { VITE_RESOURCES: 'true' },
          },
        ],
      }),
});
