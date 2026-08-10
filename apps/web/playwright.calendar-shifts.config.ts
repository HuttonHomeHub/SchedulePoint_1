import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **calendar shift editor** (ADR-0067/ADR-0068,
 * `docs/specs/calendar-shift-editor/`) — the per-day window list, the week presets, copy-day, the
 * assisted night shift, the standard working day, and dated exceptions with real hours.
 *
 * **No longer flag-on: it is the only calendar form there is.** `VITE_CALENDAR_SHIFT_EDITOR`
 * selected this editor or the seven weekday checkboxes, and ADR-0088 D3 retired the flag and
 * deleted the checkboxes — so this config's `env` pin went with it, and the suite now drives the
 * surface every planner gets, unconditionally.
 *
 * Everything this suite proves needs a **real API and a real database**: that the windows a planner
 * types survive a round trip byte for byte, that a rename does not flatten them, that a calendar
 * with no working week is savable, and that the optimistic `version` on a per-exception PATCH is
 * honoured — none of which a mocked fetch can tell you, because a mock accepts any version and
 * returns whatever it was told to.
 *
 * Like the sibling flag-on configs the flags bake at `webServer` start, so this is its own config on
 * the same ports, run as its own CI step. Chromium only (TECH_DEBT #25a), serial (one org's calendar
 * library is mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-calendar-shifts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-calendar-shifts' }]]
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
            env: { LOG_LEVEL: 'silent' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // The shift editor ON. The calendar library is reachable without any canvas layer, so
            // this suite deliberately turns none of them on — the fewer flags a journey needs, the
            // fewer reasons it has to fail for something it is not about.
          },
        ],
      }),
});
