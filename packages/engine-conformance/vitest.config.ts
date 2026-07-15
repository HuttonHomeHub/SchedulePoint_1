import { defineConfig } from 'vitest/config';

// Engine-free structural + loader tests for the conformance fixture (ADR-0034).
// No DOM, no database — pure Node. Specs import test globals explicitly.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
