import { defineConfig } from 'vitest/config';

// Pure, engine-free seed-spec tests (ADR-0066). No DOM, no database, no HTTP — the whole point of
// this package is that it describes plans without knowing how to create one.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
