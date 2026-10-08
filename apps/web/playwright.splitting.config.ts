import { defineConfig, devices } from '@playwright/test';

/**
 * The **route code-splitting journey** (`docs/specs/route-code-splitting/`, M1-T4).
 *
 * **Serves the production build**, as `playwright.csp.config.ts` and `playwright.forced-colors.config.ts`
 * do and for the same reason: chunks, their request waterfall and a stale deploy exist only in the
 * artefact that ships. `vite build` then `vite preview`, never `pnpm dev`.
 *
 * **No API server.** Every case starts on `/sign-in`, which is public, and reaches a public lazy
 * screen, so the suite is hermetic like the forced-colours one — see `e2e-splitting/splitting.spec.ts`
 * for what that leaves undriven.
 *
 * **`reuseExistingServer: false`, and the port is its own.** A preview server left running serves a
 * `dist/` built from some earlier state of the tree, and the stale-deploy cases rename files inside
 * that directory: running them against a server somebody else owns would break their `dist/`.
 * 4184 is the next free port after the forced-colours suite's 4183 (CSP 4173, the timing harness 4174).
 *
 * **Two projects, one per pointer** (ADR-0118): a fine pointer hovers and so intent-preloads, a
 * coarse one never does. The second runs only the cases tagged `@both-pointers`; the stale-deploy
 * cases rename a shared directory and so run once.
 *
 * The 300 s webServer timeout is the build.
 */
const WEB_PORT = '4184';

const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
  : {};

export default defineConfig({
  testDir: './e2e-splitting',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-splitting' }]]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, ...chromium },
    },
    {
      name: 'chromium-coarse',
      grep: /@both-pointers/,
      // A sideways 11-inch touch tablet (coarse pointer, at the floor and above): ADR-0179 retired
      // the phone this project used to model.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1180, height: 820 },
        hasTouch: true,
        ...chromium,
      },
    },
  ],
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: `pnpm exec vite build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
          url: `http://localhost:${WEB_PORT}`,
          reuseExistingServer: false,
          timeout: 300_000,
        },
      }),
});
