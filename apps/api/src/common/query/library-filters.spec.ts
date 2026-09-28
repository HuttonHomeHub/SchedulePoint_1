import { describe, expect, it } from 'vitest';

import { escapeLikePattern } from './library-filters';

/**
 * `escapeLikePattern` (`docs/TECH_DEBT.md` #337, closed 2026-09-28). Every expected value below
 * was checked against a real Postgres 16 `ILIKE` — with **no explicit `ESCAPE` clause**, the
 * shape Prisma's `contains` emits — confirming the default escape character is already `\` and
 * that an escaped `\%`/`\_` matches the literal character rather than the wildcard.
 */
describe('escapeLikePattern', () => {
  it('escapes a literal % so it is not read as "any run of characters"', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
  });

  it('escapes a literal _ so it is not read as "exactly one character"', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
  });

  it('escapes a literal backslash so it is not read as an escape introducer', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('escapes backslash BEFORE % and _, so escaping the wildcards cannot double-escape a backslash already in the term', () => {
    // Escaping % and _ first, then backslash, would re-escape the backslash the first pass just
    // inserted — the ordering here is the fix's one load-bearing detail, not an arbitrary choice.
    expect(escapeLikePattern('a\\%')).toBe('a\\\\\\%');
  });

  it('leaves a term with no special characters unchanged', () => {
    expect(escapeLikePattern('Acme Corp')).toBe('Acme Corp');
  });

  it('leaves an empty term unchanged', () => {
    expect(escapeLikePattern('')).toBe('');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeLikePattern('%%__')).toBe('\\%\\%\\_\\_');
  });
});
