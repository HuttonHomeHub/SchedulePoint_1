import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit test configuration for the NestJS API.
// SWC compiles TypeScript (including decorator metadata) for the test run.
export default defineConfig({
  // SWC (via the plugin below) owns the TypeScript/decorator transform, so
  // disable Vitest 4's built-in Oxc transformer to avoid a double transform.
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    // `passWithNoTests` is deliberately OFF. It was on during the foundation
    // stage, when there genuinely were no tests; leaving it on once there are
    // means a broken `include` glob makes the suite pass green having run
    // nothing — the gate silently stops gating. An empty run is now an error.
    passWithNoTests: false,
    include: ['src/**/*.spec.ts'],
    root: '.',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts', 'src/main.ts'],
      // A RATCHET, not an aspiration. These are the figures measured on
      // 2026-07-27 (74.17 lines / 73.37 statements / 70.92 branches / 51.57
      // functions), rounded down so an unrelated refactor cannot redden CI.
      //
      // `docs/TESTING.md` targets >= 80% on CHANGED code. That is the review
      // expectation and it is deliberately NOT what is asserted here: a global
      // 80% would fail this suite today, and a gate that fails on day one gets
      // deleted rather than fixed. Ratchet these UP as coverage rises; never
      // down without saying why in the pull request.
      //
      // NB these figures are unit-only. The Supertest suite (`test/`) exercises
      // controllers and guards but runs separately, so real exercised-code
      // coverage is higher than the number here.
      thresholds: {
        lines: 74,
        statements: 73,
        branches: 70,
        functions: 51,
      },
    },
  },
  plugins: [swc.vite()],
});
