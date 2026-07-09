// Global test setup for Vitest (jsdom environment).
// Extends `expect` with Testing Library's DOM matchers and clears the DOM
// between tests to keep them isolated.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
