import { defineConfig } from 'vitest/config';

// Pure lane-layout tests. No DOM, no canvas, no database — the packer takes numbers and returns
// numbers, which is exactly what lets the canvas and the importer share one of them.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
