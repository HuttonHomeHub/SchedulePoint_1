import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **WBS improvements** epic (`VITE_WBS_IMPROVEMENTS`,
 * ADR-0063, `docs/specs/wbs-improvements/`) — bulk membership, the pinned canvas band, the derived
 * Unassigned bucket, and dissolve.
 *
 * The pen is on and **enforced at the API** (`PLAN_EDIT_LOCK_ENFORCED`). That is the whole reason
 * this suite exists rather than more unit tests: the batch membership write is per-row
 * optimistic-locked and pen-gated, and a mocked `fetch` accepts any `version` from anybody. Only a
 * real server can fail a stale row, and only a real lock can refuse a write.
 *
 * Runs on the **canvas-first workspace**, which is the one host that shows all four surfaces at
 * once — the canvas (and its band), the Gantt behind the view switch, and the activities table in
 * the bottom panel (where the multi-select lives). Advanced activity types are on because a
 * `WBS_SUMMARY` is one of them; the Gantt is on because M3's bucket is a Gantt row.
 *
 * Chromium only (TECH_DEBT #25a), serial (one org's plan is mutated throughout). Like every flag-on
 * config the flags bake at `webServer` start, so this is a separate config on the same ports and
 * runs as its own CI step after the prior suites tear down.
 */
export default defineConfig({
  testDir: './e2e-wbs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-wbs' }]]
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
        // Wide enough that the view switch and the `View▾` trigger stay inline rather than
        // demoting into the responsive overflow menu (mirrors the Gantt suite's reasoning).
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
              VITE_WBS_IMPROVEMENTS: 'true',
              // A WBS summary is an advanced activity type, so the type is only offered — and the
              // table's WBS column only shown — with this on.
              VITE_ADVANCED_ACTIVITY_TYPES: 'true',
              VITE_GANTT_VIEW: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_ACTIVITY_EDITOR_TABS: 'true',
              // Pinned OFF, mirroring the LOE / Gantt / library suites: this journey is about
              // grouping, and the Visual-mode surface would change what the bars mean.
              VITE_SCHEDULING_MODES: 'false',
            },
          },
        ],
      }),
});
