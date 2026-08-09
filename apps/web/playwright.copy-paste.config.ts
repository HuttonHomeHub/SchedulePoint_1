import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for **activity copy / paste / duplicate**
 * (`VITE_ACTIVITY_COPY_PASTE`, `docs/specs/activity-copy-paste/` M5-T2).
 *
 * What a unit suite structurally cannot prove, and this exists for:
 *
 * - **the optimistic-`version` trap.** A mocked fetch accepts any version (the ADR-0060 M6 rule),
 *   so "the steps PUT carries a version the server will still accept" is only testable against a
 *   real API. This epic has a specific instance: an assignment create bumps the activity's version
 *   whenever `unitsPerHour` is set (`persistActivityDuration`), so a carriage that wrote
 *   assignments before steps would 409 — and would pass every unit test, because no fixture has a
 *   resource rate. The ordering is asserted in a unit test; that it is the *right* ordering is only
 *   provable here.
 * - **that a copy actually carries what the census says**, read back from the **API** rather than
 *   from the DOM under test (the ADR-0070 M6 rule). A screen that renders a duration correctly
 *   proves the screen, not the write.
 * - **that the internal-edge rule holds against a real graph** — every link between copied
 *   activities present, and **zero** links from a clone to an original. That is a fact about rows
 *   in `dependencies`, invisible to any mocked test.
 * - **that one `Ctrl+Z` removes the whole paste**, links included. The undo is an id-stable batch
 *   restore precisely because re-creating N activities would silently lose the logic between them
 *   (the ADR-0080 CQ-4 argument), and a mock returns whatever it was told to.
 * - **that `Ctrl+C` with a live text selection does not capture activities.** `window.getSelection`
 *   is stubbed in the unit suite; only a real browser has a real selection.
 * - **that `Ctrl+Z` does not trigger browser Back** (the TSLD_EDITING / UNDO_REDO precedent,
 *   TECH_DEBT #25) — a navigation, which jsdom has no concept of.
 * - **that the pen gate is real.** Every write here is pen-gated, so a suite driving the buttons
 *   without the lock would prove the buttons and not the guard.
 *
 * Chromium only (TECH_DEBT #25a), serial (one org's plan is walked throughout). Like every
 * flag-scoped config the flags bake at `webServer` start, so this is its own config on the same
 * ports and runs as its own CI step.
 */
export default defineConfig({
  testDir: './e2e-copy-paste',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-copy-paste' }]]
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
        // Wide enough that the toolbar's Duplicate item stays inline rather than demoting into the
        // responsive overflow menu — the same reasoning as the WBS, Gantt and multi-select suites.
        // An item inside `⋯` is a different control with a different focus story.
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
            // The pen is ENFORCED. Every write this epic makes is pen-gated, and the "without the
            // pen the action is shaded and says why" assertion is meaningless without it.
            env: { LOG_LEVEL: 'silent', PLAN_EDIT_LOCK_ENFORCED: 'true' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              // The epic's surface under test.
              VITE_ACTIVITY_COPY_PASTE: 'true',
              // `Ctrl+C` sources the canvas's PLURAL selection, which is itself derived from
              // direct manipulation — so both are set. A build with the plural selection on and
              // direct manipulation off cannot exist (ADR-0080), and setting only the derived flag
              // would test a state the product never reaches.
              VITE_CANVAS_MULTI_SELECT: 'true',
              VITE_CANVAS_DIRECT_MANIPULATION: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              // The undo half: one Ctrl+Z removing a whole paste is one of the seven things this
              // suite must prove, and the accelerator lives behind its own flag.
              VITE_UNDO_REDO: 'true',
              // Pinned OFF, mirroring the LOE / Gantt / WBS suites: Visual mode changes what a
              // bar's placement means, and the clone-placement assertions here are about lanes and
              // carried fields rather than about hand-placed positions.
              VITE_SCHEDULING_MODES: 'false',
            },
          },
        ],
      }),
});
