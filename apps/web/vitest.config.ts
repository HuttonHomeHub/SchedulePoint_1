import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

// Unit/component test configuration. E2E tests use Playwright (see playwright.config.ts).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // The shared types package is aliased to its compiled `dist` (see
      // vite.config.ts, ADR-0019). Externalise it so Node loads that plain JS
      // directly instead of Vitest's Oxc transformer trying to process it.
      server: { deps: { external: [/packages[\\/]types/, /packages[\\/]interchange/] } },
      globals: true,
      // No app tests exist yet (foundation stage); don't fail the suite.
      passWithNoTests: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      },
    },
  }),
);
