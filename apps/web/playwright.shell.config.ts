import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **app shell** — what the shell offers on the routes that have
 * no organisation (`docs/TECH_DEBT.md` #165a).
 *
 * **There is no flag**, and that is ADR-0088 D1 rather than an omission: a `VITE_` constant is
 * inlined at build time and no published image passes one, so a flag here would be a rollback
 * contract that has never existed. The rollback is the commit boundary. What this config is for is
 * ADR-0081 §2's enforcement half — a milestone claiming user-facing capability lands with the
 * journey that drives the real product, flag or no flag.
 *
 * **Why a browser is the only instrument that can see this.** The claim is about three routes
 * rendering inside one mounted-once shell (ADR-0029), and the defect was that the shell inferred
 * "which organisation" from a route param it could not see in a unit test: `app-shell.test.tsx`
 * mocks `useParams` and therefore renders the org-less state on EVERY case, which is why its first
 * assertion pinned the defect as correct behaviour for as long as it existed. A journey signs up,
 * lands on the real `/onboarding`, creates a real organisation and walks between real routes, so
 * the param comes from the router rather than from a mock that agrees with whatever it is handed.
 *
 * It also carries no seeded fixture on purpose: the sharpest case in #165a is a reader who has
 * **no organisation at all**, which is a state that exists for exactly one moment in an account's
 * life and cannot be reached by pointing a test at an existing tenant.
 *
 * Chromium only (TECH_DEBT #25a), serial (one account is built up across the file).
 */
export default defineConfig({
  testDir: './e2e-shell',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-shell' }]]
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
        // 1646 is the product owner's Surface Pro (ADR-0091's retrospective), and it matters here
        // rather than being a habit: the context drawer is `hidden lg:flex`, so a viewport below
        // 1024 would make every absence assertion pass for the wrong reason.
        viewport: { width: 1646, height: 1000 },
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
            // **No `VITE_` pins at all**, deliberately. ADR-0088 recorded 135 no-op pins against 10
            // real harnesses; the shipped bundle's defaults ARE the subject here, so pinning
            // anything would test a configuration no operator can produce.
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }),
});
