import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for the **tabbed activity editor**
 * (`VITE_ACTIVITY_EDITOR_TABS`, ADR-0060, `docs/specs/activity-editor-restructure/`).
 *
 * The pen is on **and enforced at the API** (`PLAN_EDIT_LOCK_ENFORCED`), because the property this
 * journey exists to prove is a permission one: a Contributor reports progress while a Planner holds
 * the pen, and the definition scopes stay shut with a sentence saying why. With the lock off the
 * whole surface would be writable and the journey would assert nothing.
 *
 * Runs on the **legacy stacked plan-detail page** (canvas workspace pinned off), where the
 * activities table and its row menu are the entry points — the same host the notes and editing
 * suites drive. The canvas selection bar and the toolbar reach the identical editor through the same
 * intent (ADR-0060 §7), which the unit suite pins; duplicating that here would test the selection
 * bar, not the editor.
 *
 * Chromium only (TECH_DEBT #25a), serial (one org's plan is mutated throughout). Like every flag-on
 * config the flags bake at `webServer` start, so this is a separate config on the same ports and
 * runs as its own CI step after the prior suites tear down.
 */
export default defineConfig({
  testDir: './e2e-activity-editor',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-activity-editor' }]]
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
        viewport: { width: 1440, height: 900 },
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
              VITE_ACTIVITY_EDITOR_TABS: 'true',
              // The convergence epic on top: Logic, Resources and Notes are tabs of this editor,
              // and the permission claims they make (a link needs the pen; a note does not) can
              // only be tested against a server that actually enforces the lock.
              VITE_ACTIVITY_EDITOR_CONVERGENCE: 'true',
              VITE_RESOURCES: 'true',
              VITE_NOTES: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
              VITE_CANVAS_WORKSPACE: 'false',
              // Steps + earned value ON: the Progress tab's third panel and the physical-% measure
              // it overrides are the co-location this epic exists for.
              VITE_ACTIVITY_STEPS: 'true',
              VITE_EARNED_VALUE: 'true',
            },
          },
        ],
      }),
});
