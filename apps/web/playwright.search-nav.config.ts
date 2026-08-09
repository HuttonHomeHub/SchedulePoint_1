import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for **search that navigates**
 * (`VITE_CANVAS_SEARCH_NAV`, `docs/specs/canvas-search-navigation/` M5-T2) — Enter and Shift+Enter
 * walking the match set, the n-of-m read-out, the announcement, Zoom to selection, and the Gantt's
 * half of the same match set.
 *
 * What a unit suite structurally cannot prove, and this exists for: that the search field's
 * accessible name is the one the assertions assume; that Enter reaches the handler through the
 * **portalled** toolbar (ADR-0055 — the band is a portal, and React events follow the React tree
 * while the canvas's own key listener is a native `window` one); that **Escape in the field does
 * not disarm an armed Link tool**, which is the ADR-0064 contract this epic amended and the single
 * highest-value assertion in the suite; and that focus never leaves the field across a full cycle,
 * which is the difference between a find control and one that works exactly once.
 *
 * The pen is **enforced at the API** because the Link tool is pen-gated: a suite that drives arming
 * without the lock would prove the arming and not the guard.
 *
 * Chromium only (TECH_DEBT #25a), serial (one org's plan is walked throughout). Like every
 * flag-scoped config the flags bake at `webServer` start, so this is its own config on the same
 * ports and runs as its own CI step.
 */
export default defineConfig({
  testDir: './e2e-search-nav',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-search-nav' }]]
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
              // The epic's surface under test. `VITE_CANVAS_SEARCH_NAV` is DERIVED from
              // `VITE_CANVAS_LENSES`, so both are set: a build with navigation on and lenses off
              // cannot exist, and pinning only the derived flag would boot a state the product
              // never reaches.
              VITE_CANVAS_SEARCH_NAV: 'true',
              VITE_CANVAS_LENSES: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              // The Link tool, and the pen it is gated on — the Escape-precedence assertion is
              // about an ARMED tool surviving a keystroke in the field, so both are required.
              VITE_CANVAS_AUTHORING_FLOW: 'true',
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
