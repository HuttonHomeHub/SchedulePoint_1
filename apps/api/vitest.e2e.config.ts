import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// End-to-end (HTTP) test configuration for the NestJS API.
// These specs boot the Nest application and exercise it via Supertest.
export default defineConfig({
  // SWC (via the plugin below) owns the TypeScript/decorator transform, so
  // disable Vitest 4's built-in Oxc transformer to avoid a double transform.
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['test/**/*.e2e-spec.ts'],
    // The ADR-0066 pairwise differential seeds 63 plans over real HTTP and gets its own script
    // and CI step (`test:e2e:pairwise`). Excluded here so it is not run twice, and so its
    // wall-clock is attributed to a step a reader can see rather than buried in this one.
    exclude: ['test/pairwise/**'],
    root: '.',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // e2e specs share one PostgreSQL and mutate global tables, so run the spec
    // files sequentially (tests within a file already run in order) to avoid
    // cross-file races on shared data.
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
