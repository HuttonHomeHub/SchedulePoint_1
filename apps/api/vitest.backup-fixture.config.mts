import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * The database the backup round trip proves (ADR-0192), in its own configuration for the reason the
 * pairwise differential has one: it must be **excluded** from `test:e2e` (it deliberately leaves its
 * rows behind, which would break every later file's cleanup) and still be runnable on its own, and a
 * filter cannot re-include what the shared config's `exclude` removes.
 */
export default defineConfig({
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['test/backup-fixture/**/*.e2e-spec.ts'],
    root: '.',
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
