import { defineConfig, devices } from '@playwright/test';

/**
 * The **public-screens layout measurement** suite (ADR-0077 M6-T1).
 *
 * **What makes it different from its 26 siblings: it measures rather than drives.** Every other
 * journey proves a behaviour — a permission is enforced, a value round-trips, a control does what
 * its label says. This one proves a **geometry**: that six routes across 33 landable states hold
 * their layout invariants at six viewport sizes in three themes. The precedent is
 * `docs/TECH_DEBT.md` **#98**: a specialist read the guest view's CSS, concluded it would pass
 * WCAG 1.4.10, **suggested a test to confirm it**, and the test failed on its first run —
 * `documentElement.scrollWidth` was 436 against a 320 px viewport. Reading CSS is not measuring it.
 *
 * **The viewport is set per test, not here.** The project's viewport is only the fallback for a
 * test that forgets; `support.ts` names the six sizes and every sweep sets its own.
 *
 * **It needs the API**, unlike a pure layout suite, for one reason: the invitation states put a
 * server-supplied organisation name into an `<h1>`, and the 100-character case is the only place on
 * any public screen where an unbounded external string sets the width of the tallest element. A
 * fabricated preview response would prove the CSS wraps a long string, not that the product does.
 *
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` stays **off**: the invited account has to be able to sign in
 * for the wrong-account and ready-to-accept states to be reachable at all. The enforcement dead ends
 * have their own suite (`playwright.account-verify.config.ts`) and their own API process, because
 * the switch is a server-boot value.
 *
 * Chromium only (TECH_DEBT #25a) — this suite does **not** cover Firefox or WebKit, and
 * `e2e-public/public-screens.spec.ts`'s closing docblock says so alongside everything else it
 * leaves to another gate.
 */
export default defineConfig({
  testDir: './e2e-public',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // The matrix sweep walks ten states inside one test, so a test is ten navigations rather than
  // one. Timing out at the 30 s default with nothing actually wrong is the least useful red there
  // is (the `e2e-account` reasoning, same cause, different arithmetic).
  timeout: 120_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-public' }]]
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
            env: { LOG_LEVEL: 'silent' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // Both recovery flags on. They are default-on in `config/env.ts` already; naming them
            // means this suite keeps sweeping `/forgot-password` and `/reset-password` even if a
            // future rollback flips the default, which is exactly when a layout gate matters.
            env: {
              VITE_ACCOUNT_SETTINGS: 'true',
              VITE_PASSWORD_RESET: 'true',
            },
          },
        ],
      }),
});
