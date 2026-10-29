import { describe, expect, it } from 'vitest';

import { codeValueName, codeValueOptionLabel } from './code-names';

describe('codeValueName', () => {
  it('is the description, else the short code', () => {
    expect(codeValueName({ shortCode: 'L1', description: 'Level 1' })).toBe('Level 1');
    expect(codeValueName({ shortCode: 'L1', description: null })).toBe('L1');
  });
});

describe('codeValueOptionLabel', () => {
  it('leads with the short code and adds the description when there is one', () => {
    expect(codeValueOptionLabel({ shortCode: 'L1', description: 'Level 1' })).toBe('L1 — Level 1');
    expect(codeValueOptionLabel({ shortCode: 'L1', description: null })).toBe('L1');
  });
});
