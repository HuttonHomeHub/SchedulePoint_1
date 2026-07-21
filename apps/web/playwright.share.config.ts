import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for **External-Guest per-plan share links**
 * (`VITE_GUEST_SHARE_LINKS`, ADR-0051 F-M4, `docs/specs/external-guest-share-link/`) — the member
 * **Share…** toolbar item (`ShareLinksDialog`: create / list / revoke) plus the public, session-less
 * `/share#<token>` guest read-only plan view. Serves the web bundle with `VITE_GUEST_SHARE_LINKS=true`
 * plus the canvas-first plan-workspace layers the Share item's own toolbar row builds on (canvas
 * authoring → toolbar → workspace → editing surface + pen; mirrors the interchange/loe/resource-view
 * suites' layering). Like the other flag-on configs the flags bake at `webServer` start, so this is a
 * separate config on the same ports; it runs as its own CI step after the prior suites tear down.
 * Chromium only (TECH_DEBT #25a), serial (the journey mutates one shared plan and drives a second,
 * session-less browser context against it).
 */
export default defineConfig({
  testDir: './e2e-share',
  fullyParallel: false, // the journey mutates a shared plan; keep it serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-share' }]]
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
        // A wide desktop viewport so the Row 2 · Do toolbar's tier-2 Share… item (order 9, near the end
        // of the deliverables cluster) stays inline as a real button rather than demoting into the
        // responsive `⋯` overflow menu — mirroring the canvas-resource-view suite's rationale.
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
            // External-Guest share links ON, plus every layer the canvas-first plan workspace (and its
            // Row 2 · Do Share… item) builds on (canvas authoring → toolbar → workspace → editing surface
            // + pen). Scheduling modes is pinned OFF (mirroring the LOE / resource-view / interchange
            // suites) to keep this journey asserting the plain authoring + share surface it was written for.
            env: {
              VITE_GUEST_SHARE_LINKS: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              VITE_CANVAS_TOOLBAR: 'true',
              VITE_CANVAS_WORKSPACE: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
              VITE_SCHEDULING_MODES: 'false',
            },
          },
        ],
      }),
});
