import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Config for the measurement harnesses that boot the real `AppModule`.
 *
 * They are NOT tests and are excluded from every test config: they seed thousands of rows and
 * report a number rather than asserting one. They live here rather than being run with `tsx`
 * because **`tsx` cannot boot this application** — the SWC plugin below owns the decorator
 * metadata transform Nest's DI reads, and without it the container fails to resolve a provider
 * whose only defect is that its parameter types were erased. That is a property of the toolchain,
 * not of the harness, and it is recorded here so the next person does not spend the same hour on
 * an `import type` hunt for a dependency that is correctly imported.
 */
export default defineConfig({
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/measure-*.mts'],
    root: '.',
    testTimeout: 900_000,
    hookTimeout: 900_000,
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
