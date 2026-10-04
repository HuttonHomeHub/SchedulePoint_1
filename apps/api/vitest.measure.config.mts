import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// The measurement harnesses under test/measure (ADR-0174 M1-T7). Not part of `pnpm test` or the
// e2e run: they are slow, they boot the API against a database the caller names, and their output is
// a set of numbers for a human to read, not an assertion.
export default defineConfig({
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    include: ['test/measure/**/*.measure.ts'],
    root: '.',
    testTimeout: 1_800_000,
    hookTimeout: 600_000,
  },
  plugins: [swc.vite()],
});
