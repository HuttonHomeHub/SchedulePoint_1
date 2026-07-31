import { defineConfig } from 'vitest/config';

// Unit tests for the seeder's client and runner, against a mocked `fetch` — no server, no database.
// The seeder's behaviour against a REAL instance is proven by running it, which is the point of it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
