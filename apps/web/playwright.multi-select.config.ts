import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **canvas plural selection**
 * (`VITE_CANVAS_MULTI_SELECT`, `docs/specs/canvas-multi-select/` M5-T2) — Space/Shift+Arrow/Ctrl+A
 * building a selection, the bulk bar's gates, the chain preview's direction, and a bulk delete
 * whose undo is one step.
 *
 * What a unit suite structurally cannot prove, and this exists for:
 *
 * - **the optimistic-`version` trap**. A mocked fetch accepts any version (the ADR-0060 M6 rule),
 *   so "the batch carries the right versions" is only testable against a real API. A bulk delete
 *   and its undo are the sharpest case: the restore bumps every row's version, and a redo built on
 *   the stale ones is a 409 nobody sees until they press the key.
 * - **that a bulk delete's undo brings the LINKS back**, which is the whole reason CQ-4 was asked
 *   and answered with the id-stable batch restore. Re-creating N activities would restore the bars
 *   and silently lose the logic between them — invisible in any mocked test, because the mock
 *   returns whatever it was told to.
 * - **that the bar's gates track the real pen**, not a boolean a test handed the component.
 *
 * The pen is **enforced at the API**, because every bulk write is pen-gated: a suite that drove the
 * buttons without the lock would prove the buttons and not the guard.
 *
 * Chromium only (TECH_DEBT #25a), serial (one org's plan is walked throughout). Like every
 * flag-scoped config the flags bake at `webServer` start, so this is its own config on the same
 * ports and runs as its own CI step.
 */
export default defineConfig({
  testDir: './e2e-multi-select',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-multi-select' }]]
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
        // Wide enough that the Row 1 find cluster stays inline rather than demoting into the
        // responsive overflow menu — the same reasoning as the WBS, Gantt and authoring-flow
        // suites. A search field inside `⋯` is a different control with a different focus story.
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
              // The epic's surface under test.
              // `VITE_CANVAS_MULTI_SELECT` is DERIVED from `VITE_CANVAS_DIRECT_MANIPULATION`, so
              // both are set: a build with the plural selection on and direct manipulation off
              // cannot exist, and setting only the derived flag would test a state the product
              // never reaches.
              VITE_CANVAS_MULTI_SELECT: 'true',
              VITE_CANVAS_DIRECT_MANIPULATION: 'true',
              VITE_CANVAS_LENSES: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              // The Link tool, and the pen it is gated on — the Escape-precedence assertion is
              // about an ARMED tool surviving a keystroke in the field, so both are required.
              VITE_CANVAS_AUTHORING_FLOW: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
              // The Gantt, for M4's half of the match set. Default-on since ADR-0059 M6; pinned
              // here so this suite does not silently lose an assertion to a future flag change.
              VITE_GANTT_VIEW: 'true',
              // Pinned OFF, mirroring the LOE / Gantt / WBS / authoring-flow suites: Visual mode
              // changes what a bar's position means, and every assertion here is about where the
              // viewport went rather than where a bar was placed.
              VITE_SCHEDULING_MODES: 'false',
            },
          },
        ],
      }),
});
