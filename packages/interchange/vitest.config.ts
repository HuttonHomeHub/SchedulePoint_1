import { defineConfig } from 'vitest/config';

// Pure, engine-free interchange tests (ADR-0050). No DOM, no database — pure Node.
// Specs import test globals explicitly.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
