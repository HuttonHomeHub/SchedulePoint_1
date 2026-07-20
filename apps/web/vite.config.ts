import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite configuration for the Blank App web client.
// Tailwind CSS v4 is wired in via its first-party Vite plugin (no PostCSS config needed).
export default defineConfig({
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
