import { defineConfig, devices } from '@playwright/test';

/**
 * **A measurement harness, not a gate** — `docs/specs/canvas-axis-markers/` Milestone 0
 * (`docs/TECH_DEBT.md` #148). The `measure-toolbar` / `measure-gantt` precedent.
 *
 * **Where it bypasses the product, stated here rather than discovered later** (ADR-0081 §3, written
 * after `measure-band-copy` made a milestone with no entry point look finished):
 *
 * - **M0-T1 measures label strings in probe spans**, not the marks the painter draws. It has to:
 *   the marks do not exist yet, and the question is how wide they would be. The spans are mounted
 *   **inside the real ruler element**, so they inherit the real cascade — but a width read from a
 *   `<span>` is not proof that a marker of that width fits, which is M2's browser gate, not this.
 * - **M0-T2 combines an observation with arithmetic.** It drives real plans at five data-date/today
 *   separations and reports which overlap; the per-preset threshold in days is then computed from
 *   the measured widths and `pxPerDayForPreset`, because seeding a plan per (preset × separation)
 *   would be 25 sign-ups for a number the observation already validates the model of.
 * - Everything else — sign-up, organisation, client, project, plan, pen, activities, recalculation —
 *   is the real product over the real API.
 *
 * **No `VITE_` pins.** The question is what the product owner's build does, and ADR-0088 D1
 * established that a published image carries every flag at its default anyway. `measure-toolbar`
 * made the same call for the same reason.
 *
 * The API server is given `PLAN_EDIT_LOCK_ENFORCED=true` because the harness takes the pen, and a
 * harness measuring a surface the pen does not actually gate is measuring a shape no planner meets.
 */
export default defineConfig({
  testDir: './measure-axis-markers',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 240_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
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
            timeout: 240_000,
            env: { LOG_LEVEL: 'silent', PLAN_EDIT_LOCK_ENFORCED: 'true' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 240_000,
          },
        ],
      }),
});
