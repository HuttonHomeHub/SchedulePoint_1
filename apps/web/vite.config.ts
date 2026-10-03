import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { bundleReportPlugin } from './scripts/bundle-report-plugin';

// The web app's own version, read from its manifest and baked into the bundle at build
// time as `__APP_VERSION__` (see `src/vite-env.d.ts` / `config/env.ts`). A compile-time
// constant needs no runtime env var and can never drift from the published package.
const { version: appVersion } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

// Same-origin API proxy, shared by the dev server and `vite preview`. In the deployed image nginx
// does this (`location /api/`), so both local servers have to stand in for it or cookies and CSP's
// `connect-src 'self'` would behave differently locally than in production.
const API_PROXY = {
  '/api': {
    target: process.env.VITE_API_URL ?? 'http://localhost:3000',
    changeOrigin: true,
  },
};

// Vite configuration for the SchedulePoint web client.
// Tailwind CSS v4 is wired in via its first-party Vite plugin (no PostCSS config needed).
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    tailwindcss(),
    // Writes a size report OUTSIDE `dist/` on every build — never served, and the deployed
    // artefact is byte-identical with it on or off (asserted, not assumed). `check:bundle-size`
    // reads it; see the plugin's docblock for why the quantity is the entry GRAPH rather than the
    // entry chunk.
    bundleReportPlugin('bundle-report.json'),
  ],
  // Pre-bundle the shared types package (consumed as compiled JS via the alias
  // below) so the dev server serves an esbuild-bundled chunk instead of routing
  // its file through Vite's Oxc transform — which otherwise walks up to that
  // package's tsconfig, whose `extends` a workspace preset Oxc can't resolve.
  optimizeDeps: { include: ['@repo/types', '@repo/interchange'] },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Consume the shared types package as its compiled output (ADR-0019 build
      // contract). Its TypeScript source can't be processed by the dev/test Oxc
      // transformer (its tsconfig `extends` a workspace preset Oxc can't resolve),
      // so runtime value imports (e.g. the `WorkingWeekdays` helper) load from
      // `dist` — run `pnpm --filter @repo/types build` first.
      '@repo/types': fileURLToPath(new URL('../../packages/types/dist/index.js', import.meta.url)),
      // Same build-contract consumption for the schedule-interchange package (ADR-0050):
      // the web review dialog imports the shared `InterchangeReport` type + its Zod schema
      // (spec §2) as compiled output — its source likewise can't be Oxc-transformed — so
      // load from `dist` (run `pnpm --filter @repo/interchange build` first).
      '@repo/interchange': fileURLToPath(
        new URL('../../packages/interchange/dist/index.js', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to the NestJS backend during local development.
    proxy: API_PROXY,
  },
  // `vite preview` serves the BUILT bundle, and the CSP gate (`e2e-csp`) must run against that
  // rather than the dev server: the policy applies to the deployed artefact, and dev injects an
  // inline react-refresh preamble that `script-src 'self'` would report as a violation which can
  // never occur in production. Preview has its own proxy config — it does not inherit `server`'s —
  // so the same object is shared here, standing in for nginx's `location /api/`.
  preview: {
    port: 4173,
    proxy: API_PROXY,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // **Chunk grouping for the plan's graph** (`docs/specs/route-code-splitting/m0-measurement.md`,
    // 2026-10-02 "plan opening" pass). Left alone, Rolldown cuts one chunk per distinct set of
    // importing routes: the plan screen's static graph was 37 chunks, most under 1 kB, and under
    // HTTP/1.1's six-connections-per-origin limit those requests queued ahead of the session request
    // that gates the whole screen. The group below folds the small leaf layers (primitives, helpers,
    // hooks, icons, and the hierarchy features the plan screen imports) into one chunk, so the plan
    // opens on five chunks (frame, screen, shared, canvas, painter).
    //
    // Two rules, both verified by building rather than assumed. (1) `boot` goes first and claims
    // everything the entry already reaches: without it the group would absorb entry modules and drag
    // the whole group into the entry graph. (2) Keep the group to leaf layers. Adding
    // `components/layout` or a plan-private feature makes `includeDependenciesRecursively` pull the
    // plan's own code in (one chunk of 260+ kB gzip), and `entriesAware` grouping or `maxSize`
    // splitting produced chunk cycles whose initialisation order broke the page intermittently
    // (`Cannot read properties of undefined (reading 'FS')`). `check-bundle-size` fails on the
    // first (B3's per-chunk ceiling) and on the second (B9 reads the emitted chunks and fails on any
    // import cycle between them), so a bad edit here fails `pnpm check:web-bundle`.
    //
    // The group's test is anchored to this app's own `src` (`apps/web/src`), so a dependency's
    // `src/lib` or a workspace package cannot match it, and it names no staff code: the staff
    // endpoints' strings belong to the staff console's chunk, not to every customer's first screen.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'boot', tags: ['$initial'], priority: 3 },
            {
              name: 'ui-shared',
              test: /node_modules[\\/]lucide-react[\\/]|[\\/]apps[\\/]web[\\/]src[\\/](components[\\/](ui|layout[\\/](breadcrumbs|chrome))|lib|hooks|features[\\/](clients|projects|plans|calendars|resources|interchange)[\\/])/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
});
