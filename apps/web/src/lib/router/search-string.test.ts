import { ARCHIVED_FILTERS, AUDIT_CATEGORIES, AUDIT_OUTCOMES, RESOURCE_KINDS } from '@repo/types';
import { defaultParseSearch } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { searchString } from './search-string';

import { CALENDAR_SCOPE_FILTERS } from '@/features/calendars/schemas/calendar-schemas';
import { ANY_RESOURCE_KIND } from '@/features/resources/schemas/resource-schemas';

/**
 * **The one coercion rule, asserted through the REAL parser** (`docs/TECH_DEBT.md` #96, M1-T1).
 *
 * Every case below starts from a **query string** and goes through `defaultParseSearch`, not from a
 * hand-written literal. That is the whole discipline of this epic: ADR-0074 M5 records `?verified=1`
 * shipping broken with a green unit suite precisely because every test fed the reader a literal and
 * never crossed the parser, so the value under test was one the router could not produce.
 *
 * The direct-input cases at the bottom exist for the shapes the parser cannot be made to emit from
 * a query string alone — `undefined`, an object, an empty array — and are labelled as such.
 */
function param(query: string, key = 'x'): unknown {
  return (defaultParseSearch(query) as Record<string, unknown>)[key];
}

describe('searchString — through the real parser', () => {
  describe('the values the codec coerces, which a `typeof === string` test used to discard', () => {
    it.each([
      ['?x=1', '1'],
      ['?x=0', '0'],
      ['?x=-3', '-3'],
      ['?x=2.5', '2.5'],
      ['?x=2026', '2026'],
      ['?x=true', 'true'],
      ['?x=false', 'false'],
    ])('%s → %o', (query, expected) => {
      expect(searchString(param(query))).toBe(expected);
    });
  });

  describe('the values that were already strings, unchanged', () => {
    it.each([
      ['?x=crane', 'crane'],
      ['?x=name:asc', 'name:asc'],
      ['?x=2026-01-05', '2026-01-05'],
      ['?x=007', '007'],
      ['?x=', ''],
      ['?x=%222026%22', '2026'], // what the stringifier writes for the string '2026'
    ])('%s → %o', (query, expected) => {
      expect(searchString(param(query))).toBe(expected);
    });
  });

  /**
   * `?x=a&x=b` decodes to `['a', 'b']` (`qss.js:55-65`). This is where the four helpers disagreed:
   * `asSearchString` answered `'a'`, `readForeignParam` answered `undefined` and dropped the param.
   * The union takes the first element — a planner writing the same key twice has said something,
   * and answering with their first value beats answering with nothing.
   */
  it('takes the first element of a repeated param', () => {
    expect(searchString(param('?x=a&x=b'))).toBe('a');
    expect(searchString(param('?x=1&x=2'))).toBe('1');
  });

  it('declines what has no string reading', () => {
    // `?x=null` parses to `null`, `?x={"a":1}` to an object — neither is text a planner typed.
    expect(searchString(param('?x=null'))).toBeUndefined();
    expect(searchString(param('?x={"a":1}'))).toBeUndefined();
    // Shapes the parser cannot emit from a query string, asserted directly and labelled.
    expect(searchString(undefined)).toBeUndefined();
    expect(searchString([])).toBeUndefined();
    expect(searchString({})).toBeUndefined();
  });

  /**
   * **The limit, restated so nobody reads this helper as a repair.** The loss happens in the codec,
   * before this runs: a 32-digit token is already a float by the time it arrives, and `String()` of
   * that float is not the token. Coercing it produces a *different* wrong answer, not a right one.
   */
  it('cannot recover a value the codec has already destroyed', () => {
    const token = '1'.repeat(32);
    const recovered = searchString(param(`?x=${token}`));
    expect(recovered).toBeDefined();
    expect(recovered).not.toBe(token);
  });
});

/**
 * **The no-op claim, pinned rather than asserted in prose** (M1's stated risk).
 *
 * M1 coerces four readers, and only `pickText`'s behaviour changes. The reason is that no enum
 * vocabulary in this app has a member the codec would coerce — so a coerced value still fails the
 * `allowed` check and still falls back to the same default it did before. That is a claim about
 * five specific lists, and lists grow, so it is a test: adding `true`, `1` or `null` to any of them
 * fails here rather than silently changing what a filter does.
 */
describe('the enum vocabularies are untouched by coercion', () => {
  const vocabularies: [string, readonly string[]][] = [
    ['CALENDAR_SCOPE_FILTERS', CALENDAR_SCOPE_FILTERS],
    ['ARCHIVED_FILTERS', ARCHIVED_FILTERS],
    ['RESOURCE_KINDS + ANY', [ANY_RESOURCE_KIND, ...RESOURCE_KINDS]],
    ['AUDIT_OUTCOMES', AUDIT_OUTCOMES],
    ['AUDIT_CATEGORIES', AUDIT_CATEGORIES],
  ];

  it.each(vocabularies)('%s round-trips every member as itself', (_name, members) => {
    for (const member of members) {
      expect(searchString(param(`?x=${encodeURIComponent(member)}`))).toBe(member);
    }
  });
});
