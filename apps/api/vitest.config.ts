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
    // No app tests exist yet (foundation stage); don't fail the suite.
    passWithNoTests: true,
    include: ['src/**/*.spec.ts'],
    root: '.',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts', 'src/main.ts'],
    },
  },
  plugins: [swc.vite()],
});
