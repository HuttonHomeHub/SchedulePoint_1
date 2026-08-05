import { defineConfig, devices } from '@playwright/test';

/**
 * **Flag-ON, and server-switch-ON** configuration for the three verification dead ends
 * (`AUTH_REQUIRE_EMAIL_VERIFICATION=true`, ADR-0074 M2 + M5-T3).
 *
 * **It is a second config with a second API process because the switch is a server-boot value.**
 * One Nest process cannot be both enforcing and not; and the sibling `playwright.account.config.ts`
 * needs it off, because an account that cannot sign in cannot reach `/account` to change a
 * password. Ports 3001/5174 so the two suites can run back to back without fighting.
 *
 * This is the only place the three fixes are reachable at all. Each is a **runtime branch on what
 * the server did** — sign-up returning no session, sign-in answering 403 with a code, the
 * invitation service refusing — so a bundle alone cannot produce any of them, and a mocked fetch
 * cannot be wrong about a response shape it invented. They ship unflagged for the same reason: a
 * `VITE_` constant is baked in long before an operator sets an env var.
 *
 * Chromium only (TECH_DEBT #25a), serial.
 */
const API_PORT = process.env.E2E_VERIFY_API_PORT ?? '3001';
const WEB_PORT = process.env.E2E_VERIFY_WEB_PORT ?? '5174';

export default defineConfig({
  testDir: './e2e-account',
  testMatch: 'verification.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 120_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-account-verify' }]]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`,
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
            url: `http://localhost:${API_PORT}/api/v1/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              LOG_LEVEL: 'silent',
              // `API_PORT`, not `PORT` — the config service reads `API_PORT` (`app-config.service.ts:36`).
              // The first local run of this suite is what caught the guess: the server booted fine,
              // on 3000, and Playwright waited two minutes for a health check on 3001.
              API_PORT: API_PORT,
              // The switch under test. Env validation demands a transport alongside it in
              // production; supplying one here is not merely compliance — without it the
              // verification link would exist only in a log this suite cannot read.
              AUTH_REQUIRE_EMAIL_VERIFICATION: 'true',
              MAIL_SMTP_URL: `smtp://127.0.0.1:${process.env.E2E_SMTP_PORT ?? '3026'}`,
              MAIL_FROM: 'SchedulePoint <no-reply@example.test>',
              // **The WEB origin, not the API's** — and the first run of this suite is what showed
              // why. Emailed links are absolute and composed from `BETTER_AUTH_URL`; the handler
              // then redirects to a **relative** `callbackURL`, which the browser resolves against
              // whichever origin served the link. Naming the API here sent the reader to
              // `:3001/verify-email`, which the API does not serve. In every real deployment this
              // is the public origin that proxies `/api`, so pointing it at the web server is what
              // makes this configuration resemble production rather than diverge from it.
              BETTER_AUTH_URL: `http://localhost:${WEB_PORT}`,
              CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
            },
          },
          {
            command: `pnpm dev --port ${WEB_PORT}`,
            url: `http://localhost:${WEB_PORT}`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              VITE_API_URL: `http://localhost:${API_PORT}`,
              VITE_ACCOUNT_SETTINGS: 'true',
              VITE_PASSWORD_RESET: 'true',
            },
          },
        ],
      }),
});
