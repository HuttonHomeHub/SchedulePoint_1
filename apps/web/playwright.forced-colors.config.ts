import { defineConfig, devices } from '@playwright/test';

/**
 * The **forced-colours focus-ring gate** (`docs/TECH_DEBT.md` #324).
 *
 * **Why this suite serves the production build, like `playwright.csp.config.ts` and unlike the other
 * 25.** What it tests is a **cascade-layer** property of the emitted stylesheet: Tailwind v4 puts
 * its utilities in `@layer utilities`, the remedy is an unlayered rule, and an unlayered declaration
 * beats a layered one whatever its specificity. That relationship is a fact about the CSS the
 * browser parses, and the dev server does not produce that CSS — it injects styles through a module
 * runtime. A gate asserting a layer relationship against an artefact nobody ships proves nothing.
 *
 * **No API server, deliberately.** Every control this exercises is on `/sign-in`, which is public
 * (ADR-0077: it is the front door, and the router redirects every unauthenticated arrival to it), so
 * the suite is hermetic — no database, no sign-up, no session. The convention under test lives in
 * `Button`'s CVA base and in 60 other places, not on any one screen, so the screen that needs least
 * setup is the right one to use.
 *
 * Chromium only, and its `forcedColors` option is an **emulation** of Windows High Contrast rather
 * than the real mode on real Windows. `docs/TECH_DEBT.md` #154's AT-observation debt is untouched by
 * anything here, and this config says so rather than letting a green run read as "verified with a
 * screen reader".
 *
 * The 300 s webServer timeout is the build: a server timing out mid-compile reports as "the server
 * never came up", which is the least useful diagnostic available.
 */
/** `vite preview`'s own port, deliberately neither the dev server's 5173 nor the CSP suite's 4173. */
const WEB_PORT = '4183';

export default defineConfig({
  testDir: './e2e-forced-colors',
  testMatch: 'focus-ring.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-forced-colors' }]]
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
        viewport: { width: 1280, height: 900 },
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          // `vite build`, not `pnpm build` — see `playwright.csp.config.ts` for why the typecheck
          // in front of it cannot resolve `@repo/seed`'s dist in the e2e job.
          command: `pnpm exec vite build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
          url: `http://localhost:${WEB_PORT}`,
          // Never reused: a preview server already up is serving a `dist/` built from some earlier
          // state of the tree, and a gate that passes against yesterday's bundle is the failure this
          // suite exists to remove.
          reuseExistingServer: false,
          timeout: 300_000,
        },
      }),
});
