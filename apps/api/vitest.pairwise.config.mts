import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * The ADR-0066 pairwise differential, in its own configuration.
 *
 * It is an e2e spec like the others — it boots the app against a real PostgreSQL — but it seeds 63
 * generated plans over real HTTP and takes minutes rather than seconds. A separate config (rather
 * than a filter on the shared one) is what lets it be **excluded** from `test:e2e` and still be
 * runnable: a filter cannot re-include what the shared config's `exclude` removed.
 *
 * Its own step also means its wall-clock is attributed to a line a reader can see, which is
 * M3.4's stated risk — a slow suite hidden inside a longer one is a suite that eventually gets
 * deleted by someone who cannot tell what is costing them.
 */
export default defineConfig({
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['test/pairwise/**/*.e2e-spec.ts'],
    root: '.',
    // Seeding 63 plans over HTTP; the per-test timeout in the spec itself is the real bound.
    testTimeout: 30 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
