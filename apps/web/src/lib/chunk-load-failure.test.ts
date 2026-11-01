import { describe, expect, it } from 'vitest';

import { isChunkLoadFailure } from './chunk-load-failure';

describe('isChunkLoadFailure', () => {
  it('recognises all three engine messages and nothing else', () => {
    expect(isChunkLoadFailure(new Error('Failed to fetch dynamically imported module: x'))).toBe(
      true,
    );
    expect(isChunkLoadFailure(new Error('error loading dynamically imported module: x'))).toBe(
      true,
    );
    expect(isChunkLoadFailure(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadFailure(new Error('boom'))).toBe(false);
    expect(isChunkLoadFailure(new Error('Request failed with status 500'))).toBe(false);
    expect(isChunkLoadFailure(undefined)).toBe(false);
    expect(isChunkLoadFailure('Failed to fetch dynamically imported module')).toBe(false);
  });
});
