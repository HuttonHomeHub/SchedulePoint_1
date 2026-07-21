import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The web app's own version, read from its manifest and baked into the bundle at build
// time as `__APP_VERSION__` (see `src/vite-env.d.ts` / `config/env.ts`). A compile-time
// constant needs no runtime env var and can never drift from the published package.
const { version: appVersion } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

// Vite configuration for the Blank App web client.
// Tailwind CSS v4 is wired in via its first-party Vite plugin (no PostCSS config needed).
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [react(), tailwindcss()],
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
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
