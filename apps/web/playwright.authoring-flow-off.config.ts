import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **flag-off** run of the canvas authoring flow
 * (`VITE_CANVAS_AUTHORING_FLOW=false`; `docs/specs/flag-off-link-pick/`, `docs/TECH_DEBT.md` #76).
 *
 * Why a flag-off run exists at all: the Link tool's two-click pick predates ADR-0064, and the epic
 * added its echo plumbing — `onLinkPickStep`, `linkPickPredecessorId` and `dropLinkPickSignal` —
 * **unconditionally**. Only the recalculation hold, the mode band and the keyboard Enter link sit
 * behind the flag. So with the flag off the pointer pick still runs through the new plumbing, and
 * every other Playwright config pins the flag on (or takes the default, which is on). A pointer
 * pick needs a hit test against a canvas with real layout, which jsdom does not have, so no unit
 * test can say that path still works. This is the rollback the flag's own docblock promises.
 *
 * The pen is on and **enforced at the API**, exactly as in the flag-on suite, so both runs check
 * the same write path. The `VITE_` flag bakes at `webServer` start, which is why this is a separate
 * config rather than a second project in `playwright.authoring-flow.config.ts`.
 *
 * Chromium only (TECH_DEBT #25a), serial (one org's plan is mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-authoring-flow-off',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report-authoring-flow-off' }],
      ]
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
        // Wide enough that the Row 2 authoring cluster stays inline rather than demoting into the
        // responsive overflow menu (mirrors the WBS and Gantt suites' reasoning).
        viewport: { width: 1920, height: 1080 },
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
            env: { LOG_LEVEL: 'silent', PLAN_EDIT_LOCK_ENFORCED: 'true' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              // The one difference from the flag-on config: the state a rollback build would ship.
              VITE_CANVAS_AUTHORING_FLOW: 'false',
              VITE_CANVAS_AUTHORING: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
            },
          },
        ],
      }),
});
