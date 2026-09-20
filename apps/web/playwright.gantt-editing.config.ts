import { defineConfig, devices } from '@playwright/test';

/**
 * The **Gantt editing** journey (ADR-0059 M5, `docs/specs/gantt-editing/`).
 *
 * Lands with M1 rather than at enablement, which is ADR-0081's rule and the only one of that ADR's
 * three decisions that is enforcement rather than intention: M1's own hole in the ADR-0081 case
 * survived a plan, a spec, a measurement, unit tests and a human read, and died the first time
 * something drove the real product.
 *
 * The pen is enforced at the API (`PLAN_EDIT_LOCK_ENFORCED`) because these journeys write, and the
 * optimistic-`version` trap is only testable against a server that actually rejects a stale one.
 * `RATE_LIMIT_LIMIT` is raised for the same reason `playwright.gantt.config.ts` raises it — seeding
 * through the API trips a throttler that exists to deny abusive traffic and cannot tell a harness
 * from it.
 *
 * **It pins no `VITE_` flag off, deliberately.** The config this was copied from pins
 * `VITE_SCHEDULING_MODES: 'false'`, and inheriting that made `Clear visual placement` vanish — the
 * item is only registered when scheduling modes are on, so the journey was asserting against a
 * surface no shipped bundle produces. ADR-0088 D1 established that a published image carries every
 * flag at its default, and ADR-0088's own retrospective records the base suite proving role-only
 * editing "in a world no shipped bundle can produce" as worse than covering a rollback path. The
 * default surface IS the shipped surface, so that is what this drives.
 */
export default defineConfig({
  testDir: './e2e-gantt-editing',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-gantt-editing' }]]
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
        // A wide desktop viewport so both halves of the tier-1 view switch stay inline as real
        // labelled buttons rather than demoting into the responsive `⋯` overflow menu.
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
              PLAN_EDIT_LOCK_ENFORCED: 'true',
              // The scale journey seeds hundreds of activities through the API to reach a plan size
              // worth measuring, which trips the global throttler (100/60s) that exists to deny
              // abusive traffic. Raised for this harness only — the guard itself is untouched, and
              // no other suite or environment sees this value.
              RATE_LIMIT_LIMIT: '100000',
            },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            // The Gantt ON, plus every layer the canvas-first plan workspace builds on.
            //
            // **This comment said "Scheduling modes is pinned OFF (mirroring the LOE /
            // resource-view / interchange / share / library suites)" and that was FALSE** — the
            // `env` block three lines below has never contained the flag. It was copied with the
            // config it was derived from, while the docblock above deliberately removed the pin
            // and explains why: inheriting it made `Clear visual placement` vanish, leaving the
            // journey asserting against a surface no shipped bundle produces. So the file said
            // both things at once, and the false half was the one a reader met first.
            //
            // That decision is this milestone's whole argument, reached here first and left
            // contradicted by a copied line.
            env: {
              VITE_GANTT_VIEW: 'true',
              VITE_CANVAS_AUTHORING: 'true',
              VITE_TSLD_EDITING: 'true',
              VITE_PLAN_EDIT_LOCK: 'true',
            },
          },
        ],
      }),
});
