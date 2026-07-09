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
    root: '.',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [swc.vite()],
});
