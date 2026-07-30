import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **canvas authoring flow** epic (ADR-0064,
 * `docs/specs/canvas-authoring-and-routing/`) — arming a tool, picking endpoints, and creating
 * logic on the canvas.
 *
 * The pen is on and **enforced at the API** (`PLAN_EDIT_LOCK_ENFORCED`), and the coalesced
 * auto-recalculation is live. That combination is the reason this suite exists rather than more
 * unit tests: the epic's founding defect is a link whose endpoints came back the wrong way round,
 * and the gesture reducer — the only layer a unit test can reach — maps the first click to the
 * predecessor with no inversion. Only a real browser, a real recalculation cadence and a real
 * server can say which of those clicks actually became a pick.
 *
 * Chromium only (TECH_DEBT #25a), serial (one org's plan is mutated throughout). Like every
 * flag-scoped config the flags bake at `webServer` start, so this is a separate config on the same
 * ports and runs as its own CI step after the prior suites tear down.
 */
export default defineConfig({
  testDir: './e2e-authoring-flow',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-authoring-flow' }]]
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
              VITE_CANVAS_AUTHORING: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
              // Pinned OFF, mirroring the LOE / Gantt / WBS suites: this journey is about the
              // authoring gesture, and the Visual-mode surface would change what a bar's position
              // means mid-pick — which is precisely the variable the diagnostic is measuring.
              VITE_SCHEDULING_MODES: 'false',
            },
          },
        ],
      }),
});
