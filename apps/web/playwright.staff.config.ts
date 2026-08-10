import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **staff console** (ADR-0086, staff-console M3).
 *
 * **This is not a flag-on config, and that is the interesting part.** Every sibling suite pins a
 * `VITE_` constant; this one pins a **server** variable, `STAFF_EMAILS`, because staff-ness is a
 * server fact the bundle cannot see (ADR-0074's generalisation of the ADR-0060 M0 rule). There is no
 * client flag to set — the console gates itself on runtime evidence — so the only way to drive the
 * two sides of that gate is to boot an API that considers one address staff and another not.
 *
 * It lands with M3 rather than at enablement because M3 is the first milestone with a user-facing
 * entry point (ADR-0081 §2). The epic's own history is the argument: M2 passed 1,589 unit tests and
 * could not serve a single request, and the thing that found it drove a real database.
 *
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` stays **off** — the accounts here sign in normally — while the
 * guard's own `emailVerified` demand is independent of it, which is exactly the configuration in
 * which a squatted allowlist entry would otherwise become staff. The spec verifies addresses through
 * the API rather than through mail, so no SMTP sink is needed.
 *
 * Chromium only (TECH_DEBT #25a), serial (accounts are created and mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-staff',
  testMatch: 'staff.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 120_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-staff' }]]
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
            env: {
              LOG_LEVEL: 'silent',
              // The sink the spec starts. Needed because the guard demands `emailVerified`
              // unconditionally, and the only honest way to reach that state is to follow a real
              // emailed link — the same reason `playwright.account.config.ts` needs one. A different
              // port from that suite's, so the two can run without fighting for it.
              MAIL_SMTP_URL: `smtp://127.0.0.1:${process.env.E2E_SMTP_PORT ?? '3026'}`,
              MAIL_FROM: 'SchedulePoint <no-reply@example.test>',
              // Mixed case and padded on purpose: the allowlist's own entries are trimmed at parse
              // time and the session value is lowercased only. Both halves of that asymmetry are
              // driven here rather than only in a mocked unit test.
              // TWO entries, and the second is load-bearing. `unverified@…` is allowlisted and
              // deliberately never verified, which makes the "allowlisted but unverified is still
              // refused" assertion stable across re-runs — the e2e database persists, so the first
              // account is verified from the previous run onwards and cannot prove that branch twice.
              STAFF_EMAILS: ' Ops@SchedulePoint.test , unverified@schedulepoint.test ',
            },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }),
});
