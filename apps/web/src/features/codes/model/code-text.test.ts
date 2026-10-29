import { CODE_DESCRIPTION_MAX, CODE_NAME_MAX, CODE_SHORT_CODE_MAX } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { hasValueProblem, typeNameProblem, valueProblems } from './code-text';

describe('typeNameProblem', () => {
  it('accepts a name and trims before counting', () => {
    expect(typeNameProblem('  Area  ', [])).toBeNull();
    expect(typeNameProblem('x'.repeat(CODE_NAME_MAX), [])).toBeNull();
  });

  it('refuses a blank name, one over the shared limit, and control characters', () => {
    expect(typeNameProblem('   ', [])).toBe('Enter a name.');
    expect(typeNameProblem('x'.repeat(CODE_NAME_MAX + 1), [])).toBe(
      `Use ${String(CODE_NAME_MAX)} characters or fewer.`,
    );
    expect(typeNameProblem('Ar\tea', [])).toBe('Remove the control characters.');
  });

  it('compares the plan’s other names ignoring case, as the server does', () => {
    expect(typeNameProblem('trade', ['Area', 'Trade'])).toBe(
      'A code type called “trade” already exists.',
    );
    expect(typeNameProblem('System', ['Area', 'Trade'])).toBeNull();
  });
});

describe('valueProblems', () => {
  const ok = { shortCode: 'L1', description: 'Level 1' };

  it('finds nothing wrong with a good value, and a blank description is not a problem', () => {
    expect(hasValueProblem(valueProblems(ok, [], 'Area'))).toBe(false);
    expect(hasValueProblem(valueProblems({ shortCode: 'L1', description: '  ' }, [], 'Area'))).toBe(
      false,
    );
  });

  it('refuses a blank, over-long or control-character short code', () => {
    expect(valueProblems({ ...ok, shortCode: ' ' }, [], 'Area').shortCode).toBe(
      'Enter a short code.',
    );
    expect(
      valueProblems({ ...ok, shortCode: 'x'.repeat(CODE_SHORT_CODE_MAX + 1) }, [], 'Area')
        .shortCode,
    ).toBe(`Use ${String(CODE_SHORT_CODE_MAX)} characters or fewer.`);
    expect(valueProblems({ ...ok, shortCode: 'L\n1' }, [], 'Area').shortCode).toBe(
      'Remove the control characters.',
    );
  });

  it('refuses a description over the shared limit', () => {
    expect(
      valueProblems({ ...ok, description: 'x'.repeat(CODE_DESCRIPTION_MAX + 1) }, [], 'Area')
        .description,
    ).toBe(`Use ${String(CODE_DESCRIPTION_MAX)} characters or fewer.`);
  });

  it('names the type when the short code repeats another of its values, ignoring case', () => {
    expect(valueProblems(ok, ['l1', 'GF'], 'Area').shortCode).toBe(
      'Area already has a value “L1”.',
    );
  });
});
