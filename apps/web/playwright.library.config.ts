import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for **library scoping & manageability**
 * (`VITE_LIBRARY_SCOPING`, ADR-0053, `docs/specs/library-scoping-and-manageability/`) — the calendar
 * ORG/PROJECT tier (badge column, scope filter, the project's own Calendars section, the
 * tier-grouped plan picker) and the M4 management layer (server-side search, archive/restore, the
 * shared `Combobox` pickers). Serves the web bundle with `VITE_LIBRARY_SCOPING=true` plus the
 * canvas-first plan-workspace layers this journey's plan steps build on (canvas authoring →
 * toolbar → workspace → editing surface + pen; mirrors the interchange/share suites' layering).
 * Like the other flag-on configs the flags bake at `webServer` start, so this is a separate config
 * on the same ports; it runs as its own CI step after the prior suites tear down. Chromium only
 * (TECH_DEBT #25a), serial (the journey mutates one org's libraries, projects and plans).
 */
export default defineConfig({
  testDir: './e2e-library',
  fullyParallel: false, // one org's libraries are mutated throughout; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-library' }]]
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
        // A wide desktop viewport so the Row 2 · Do toolbar's tier-2 Calendar… item stays inline as
        // a real button rather than demoting into the responsive `⋯` overflow menu (the share and
        // canvas-resource-view suites' rationale).
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
            // Library scoping ON, plus every layer the canvas-first plan workspace (and its Row 2 ·
            // Do Calendar… item) builds on. Scheduling modes is pinned OFF (mirroring the LOE /
            // resource-view / interchange / share suites) to keep this journey asserting the plain
            // authoring surface it was written for.
            env: {
              VITE_LIBRARY_SCOPING: 'true',
              VITE_RESOURCES: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_SCHEDULING_MODES: 'false',
            },
          },
        ],
      }),
});
