import { defineConfig, devices } from '@playwright/test';

/**
 * Container timing harness for the route code-splitting epic (M0-T5, `docs/specs/route-code-splitting/`).
 *
 * A harness, **not a gate** — not a CI step, and nothing fails a build on its output (TECH_DEBT
 * #266). It writes JSON and markdown to `measure-output/` for a human to read.
 *
 * **It serves the production build**, as `playwright.csp.config.ts` does and for the same reason:
 * the dev server serves unbundled modules, so its waterfall is not the one a planner downloads.
 * `vite build` then `vite preview`, with its own API and web ports so it never shares a process
 * with a suite configured for another origin. No `VITE_` flags are set: the harness measures the
 * bundle a release ships (ADR-0088 D1).
 *
 * **This measures the build container, not a planner's hardware** (ADR-0128's own warning). The
 * container is the class of machine ADR-0127 D8 recorded as unreliable, so the output reports each
 * run and the spread, and the verdict is INDETERMINATE whenever the spread is too wide (spec P2).
 */
const API_PORT = process.env.E2E_ROUTE_SPLIT_API_PORT ?? '3003';
const WEB_PORT = '4174';

export default defineConfig({
  testDir: './measure-route-splitting',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // Five-plus runs of four throttled paths, after a seed; generous so a slow container reports
  // numbers rather than a timeout.
  timeout: 1_200_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`,
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
            url: `http://localhost:${API_PORT}/api/v1/health`,
            // Never reused: CORS_ORIGINS binds Better Auth's trustedOrigins to this web origin
            // (see `playwright.csp.config.ts`).
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
              LOG_LEVEL: 'silent',
              API_PORT,
              CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
              BETTER_AUTH_URL: `http://localhost:${WEB_PORT}`,
              // Kept at 100000 by decision (ADR-0175 M3.2): this is a manual measurement harness, not a CI step,
              // it seeds hundreds to thousands of activities by design, and a throttle refusal would contaminate
              // the timing it exists to report. Its specs use `@playwright/test`'s `test`, not the guarded fixture,
              // so the census cannot count them. The product default stays 100 per 60 s.
              RATE_LIMIT_LIMIT: '100000',
            },
          },
          {
            // `vite build`, not `pnpm build` (whose `tsc` step cannot resolve unbuilt workspace
            // packages in the e2e job) — see `playwright.csp.config.ts`. Never reused: a preview
            // server left running serves some earlier `dist/`, and a baseline taken against
            // yesterday's bundle is the failure this harness exists to remove.
            command: `pnpm exec vite build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
            url: `http://localhost:${WEB_PORT}`,
            reuseExistingServer: false,
            timeout: 300_000,
            env: { VITE_API_URL: `http://localhost:${API_PORT}` },
          },
        ],
      }),
});
