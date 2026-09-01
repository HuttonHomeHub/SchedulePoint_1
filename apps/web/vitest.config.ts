import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

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
      // `passWithNoTests` is deliberately OFF — see apps/api/vitest.config.mts
      // for why. A run that matches no spec files is a broken config, not a
      // pass.
      passWithNoTests: false,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
        // A ratchet at the figures measured on 2026-07-27 (87.36 lines / 85.59
        // statements / 79.33 branches / 81.38 functions), rounded down so an
        // unrelated refactor cannot redden CI. See apps/api/vitest.config.mts
        // for why these are floors rather than the >= 80% target in
        // docs/TESTING.md. Ratchet UP as coverage rises; never down without
        // saying why in the pull request.
        thresholds: {
          lines: 87,
          statements: 85,
          branches: 79,
          functions: 81,
        },
      },
    },
  }),
);
