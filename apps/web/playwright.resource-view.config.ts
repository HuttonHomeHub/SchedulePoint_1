import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **canvas-axis-aligned resource strip + on-bar
 * over-allocation highlight** (`VITE_CANVAS_RESOURCE_VIEW`, Stage E, `docs/specs/canvas-resource-view/`)
 * — the `resource-view` / `over-allocation` lens pair layered on the canvas-maximal toolbar (ADR-0031)
 * and canvas-first authoring (ADR-0032). Serves the web bundle with `VITE_CANVAS_RESOURCE_VIEW=true`
 * plus the authoring/toolbar/workspace/editing/pen flags it builds on (the strip mounts inside the same
 * canvas region those surfaces render), and `VITE_RESOURCES`/`VITE_RESOURCE_CURVES` explicitly on so the
 * resource library + histogram data source the strip reads are definitely live (they default on already;
 * pinning them here keeps this suite's intent self-documenting and immune to a future default flip). The
 * API enforces the pen. Like the other flag-on configs the flags bake at `webServer` start, so this is a
 * separate config on the same ports; it runs as its own CI step after the prior suites tear down.
 * Chromium only (TECH_DEBT #25a).
 */
export default defineConfig({
  testDir: './e2e-resource-view',
  fullyParallel: false, // the journey mutates a shared plan; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-resource-view' }]]
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
        // A wide desktop viewport so the whole Row 1 · Look toolbar — including the tier-2 lens buttons
        // this journey drives directly (Resource view + Flag over-allocated) — stays inline as real
        // toggle buttons rather than demoting into the responsive `⋯` overflow menu (where they'd be
        // menuitems without the `aria-pressed`/`aria-disabled`/`title` semantics this suite asserts).
        // The below-`md` overflow behaviour is unit-covered (`Toolbar.test.tsx`).
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
            // Canvas resource view ON, plus every layer it builds on (canvas authoring → toolbar →
            // workspace → editing surface + pen) and the resource data source it reads from (both on by
            // default already, pinned explicitly for clarity). Scheduling modes is pinned OFF (mirroring
            // the LOE suite) to keep this journey asserting the plain authoring + resource-view surface
            // it was written for; its own surface is unit-covered.
            env: {
              VITE_CANVAS_RESOURCE_VIEW: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
              VITE_RESOURCES: 'true',
              VITE_RESOURCE_CURVES: 'true',
              VITE_SCHEDULING_MODES: 'false',
            },
          },
        ],
      }),
});
