import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the **workspace chrome** epic
 * (`docs/specs/workspace-chrome/`) — the plan workspace's vertical budget, its command surface, and
 * the placement rule the canvas previews.
 *
 * **`VITE_SCHEDULING_MODES` is left at its default (on), and that is why this config exists.**
 * (So is every other flag — see the `webServer` block.) Every
 * other flag-scoped config in this repository pins it OFF — fourteen of them, each for a good local
 * reason (a Visual placement changes what a bar's position means, which is a variable those suites
 * are controlling for). The consequence nobody had recorded is that **Visual mode has never been
 * driven by any journey**, so the one placement rule a planner exercises by dragging a bar was
 * covered only by unit tests over a mocked fetch. M2's whole subject is that rule.
 *
 * The pen is on and **enforced at the API** (`PLAN_EDIT_LOCK_ENFORCED`), and the coalesced
 * auto-recalculation is live — the same combination `playwright.authoring-flow.config.ts` uses, and
 * for the same reason: the claim under test is what the SERVER stores and returns, and a mocked
 * fetch accepts whatever the client sends.
 *
 * Chromium only (TECH_DEBT #25a), serial (one org's plans are mutated throughout). Like every
 * flag-scoped config the flags bake at `webServer` start, so this runs as its own CI step after the
 * prior suites tear down.
 */
export default defineConfig({
  testDir: './e2e-workspace-chrome',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-workspace-chrome' }]]
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
        // 1646 CSS px — the product owner's Surface Pro (2880×1920 at 175%), and the width this
        // epic's measurements were all taken at. Two epics before it took decisions at 1920 and
        // 1440, which is how a command surface shipped half empty on the one screen it is judged on
        // (ADR-0091). It is a permanent width in `measure-toolbar` and `e2e-toolbar-fit` for the
        // same reason.
        viewport: { width: 1646, height: 1097 },
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
            // **No `VITE_` pins at all**, which is the same choice `playwright.toolbar-fit.config.ts`
            // makes and for the same reason. A published image carries every flag at its default
            // (ADR-0088 D1: Vite inlines the constants at build time, the Dockerfile declares one
            // build arg and the publish workflow passes none), so the shipped surface IS the default
            // surface — and every flag this suite needs is default-on, `flagDefaultOff` having zero
            // call sites in `env.ts`. Pinning them 'true' therefore restated the defaults and tested
            // nothing extra, while quietly asserting that a retired flag still existed:
            // `check:flags` caught exactly that on the first CI run, for `VITE_CANVAS_TOOLBAR`.
          },
        ],
      }),
});
