import { defineConfig, devices } from '@playwright/test';

/**
 * **A measurement harness, not a gate** (ADR-0065's `measure-link-routing` precedent; ADR-0081's
 * rule that a harness states where it bypasses the product).
 *
 * It answers `docs/specs/workspace-layout/design.md` §2's M0: that design was written without a
 * shell, so every pixel figure in it is arithmetic over class names and an assumed 6.6 px/character
 * metric. This drives the **real** plan workspace, in a real Chromium, through the real sign-up →
 * client → project → plan journey, and reads the toolbar's own DOM at five viewport widths.
 *
 * **It bypasses nothing.** There is no injected component, no mocked context and no direct call
 * into `Toolbar` — which is the whole point, because the numbers under test are produced by
 * `ResizeObserver` + `measureText` against the real computed font, none of which a unit test has.
 *
 * **No `VITE_` pins.** Every other config in this directory pins flags to hold a surface still;
 * this one deliberately does not, because the question is what the product owner's build does, and
 * ADR-0088 D1 established that a shipped image carries every flag at its default anyway.
 */
export default defineConfig({
  testDir: './measure-toolbar',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 180_000,
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
            reuseExistingServer: true,
            timeout: 180_000,
            env: { LOG_LEVEL: 'silent', PLAN_EDIT_LOCK_ENFORCED: 'true' },
          },
          {
            command: 'pnpm dev',
            url: 'http://localhost:5173',
            reuseExistingServer: true,
            timeout: 180_000,
          },
        ],
      }),
});
