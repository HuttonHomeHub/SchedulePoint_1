import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON** end-to-end configuration for **account recovery** (`VITE_ACCOUNT_SETTINGS` +
 * `VITE_PASSWORD_RESET`, ADR-0074 M5-T3).
 *
 * Two things make this suite different from its 24 siblings.
 *
 * **It needs a real mail transport, not a mock.** `MAIL_SMTP_URL` points the API at an SMTP sink
 * the spec stands up (`e2e-account/smtp-sink.ts`). That is not gold-plating: the reset token goes
 * to the mailbox and **nowhere else** — the invitation flow returns its URL in the create response,
 * this one does not, and since M0 the verification row stores the identifier **hashed**, so the raw
 * token is not recoverable from the database either (B1 working as designed). Receiving the mail is
 * the only way to test a reset at all. It also makes this the only place `SmtpMailService` runs
 * against a socket rather than being skipped in favour of the logging fallback.
 *
 * **It asserts a session died.** B2 — a completed reset revokes the others — is observable only
 * across two real browser contexts against a real server. A mocked fetch has no sessions to revoke.
 *
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` stays **off** here, deliberately: an account has to be able to
 * sign in for the change-password half to be reachable at all. The three enforcement dead ends get
 * their own config and their own API process (`playwright.account-verify.config.ts`) — the switch
 * is a server-boot value, so one process cannot be both.
 *
 * Chromium only (TECH_DEBT #25a), serial (accounts and sessions are mutated throughout).
 */
export default defineConfig({
  testDir: './e2e-account',
  testMatch: 'account.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Well above the 30 s default: each test drives three or four browser contexts through sign-up,
  // a mail round trip and a re-authentication. Timing out at 30 s with nothing wrong is the least
  // useful kind of red.
  timeout: 120_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-account' }]]
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
              // The sink the spec starts. `MAIL_FROM` is demanded alongside it by env validation.
              MAIL_SMTP_URL: `smtp://127.0.0.1:${process.env.E2E_SMTP_PORT ?? '3025'}`,
              MAIL_FROM: 'SchedulePoint <no-reply@example.test>',
            },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // Only the two flags this journey is about. The fewer flags a journey needs, the
            // fewer reasons it has to fail for something it is not testing.
            env: {
              VITE_ACCOUNT_SETTINGS: 'true',
              VITE_PASSWORD_RESET: 'true',
            },
          },
        ],
      }),
});
