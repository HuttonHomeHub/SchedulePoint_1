import { defineConfig, devices } from '@playwright/test';

/**
 * The **Content-Security-Policy gate** (ADR-0074 §4, TECH_DEBT #8).
 *
 * **Why this suite is different from its 25 siblings: it serves the production build.**
 *
 * Every other journey runs `pnpm dev`, because what it tests is behaviour and the dev server is
 * faster. This one tests a **header applied to a deployed artefact**, and the dev server is the
 * wrong artefact in two directions at once. It serves unbundled modules, so a dependency's compiled
 * behaviour is not what the browser actually runs; and Vite injects an **inline** react-refresh
 * preamble, which `script-src 'self'` would report as a violation that can never occur in
 * production — a permanently red gate for a defect that does not exist, which is how gates get
 * deleted rather than fixed (ADR-0058).
 *
 * So: `vite build` then `vite preview`, with `preview.proxy` standing in for nginx's
 * `location /api/` (see `vite.config.ts`). The spec supplies the header itself, report-only, read
 * from `docker-compose.yml` rather than restated — a gate testing a policy nobody serves proves
 * nothing.
 *
 * The build is why the timeout is 300 s: a webServer timing out mid-compile reports as "the server
 * never came up", which is the least useful diagnostic available.
 *
 * No `VITE_` flags are set. That is deliberate — the gate must see the bundle a release ships, and
 * the flags this epic added are default-on in `config/env.ts`. Chromium only (TECH_DEBT #25a).
 */
/** Its own ports, so this suite never shares a process with one configured for a 5173 web origin. */
const API_PORT = process.env.E2E_CSP_API_PORT ?? '3002';
/** `vite preview`'s port (`vite.config.ts` → `preview.port`), deliberately not the dev server's. */
const WEB_PORT = '4173';

export default defineConfig({
  testDir: './e2e-csp',
  testMatch: 'csp.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-csp' }]]
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
            // Its own port and never reused. The web origin here is 4173, not the 5173 every other
            // suite uses, and `CORS_ORIGINS` is what Better Auth's `trustedOrigins` is bound to —
            // so an API left running by a neighbouring suite rejects every sign-up with "Invalid
            // origin". That is not a hypothetical: it is what the first run of this suite did.
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
              LOG_LEVEL: 'silent',
              // `API_PORT`, not `PORT` (`app-config.service.ts:36`).
              API_PORT,
              CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
              BETTER_AUTH_URL: `http://localhost:${WEB_PORT}`,
            },
          },
          {
            // `vite build`, NOT `pnpm build` — the latter is `tsc --noEmit && vite build`, and the
            // typecheck is both redundant and actively wrong here. Redundant: the `quality` job
            // already runs `pnpm typecheck` through Turbo. Wrong: Turbo builds every workspace
            // package first, and the e2e job builds only three, so `apps/web`'s tsc — which covers
            // `scripts/scale-scene.ts` and its `@repo/seed` import — cannot resolve that package's
            // `dist/` and exits non-zero before a bundle is ever produced. A local checkout hides
            // it, because every package's `dist/` is already lying there (the same trap the CI
            // workflow's "Build shared packages" comment records). This suite needs the bundle, so
            // it asks for the bundle.
            command: 'pnpm exec vite build && pnpm preview',
            url: `http://localhost:${WEB_PORT}`,
            // Never reuse either: a preview server already running is serving a `dist/` built from
            // some earlier state of the tree, and a CSP gate that passes against yesterday's bundle
            // is exactly the failure this suite exists to remove.
            reuseExistingServer: false,
            timeout: 300_000,
            env: { VITE_API_URL: `http://localhost:${API_PORT}` },
          },
        ],
      }),
});
