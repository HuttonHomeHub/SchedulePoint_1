import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { parseSearchStrings, stringifySearchStrings } from './search-params';

/**
 * **The replacement codec** (`docs/TECH_DEBT.md` #96, M3-T1).
 *
 * Three kinds of assertion, and the kinds matter more than the count:
 *
 * 1. **A property**, not a table. `parse(stringify({ k: v })).k === v` for every string in a
 *    corpus. A table of examples is exactly what let the library's own asymmetry survive for a
 *    year — every example somebody thought to write down round-tripped. The property is what makes
 *    the epic's D1 checkable rather than argued.
 * 2. **A differential** against the library pair, param by param, recording where the two agree and
 *    where they differ. That list is M4's expected diff, written before M4 exists, so the flip is
 *    reviewed against a prediction rather than explained afterwards.
 * 3. **A byte-identity check** for every value the app itself writes, so the only intended
 *    differences are the quoted ones and nothing changed encoding by accident.
 */

/** The nine shapes from the spec's corruption table, plus what the app actually writes. */
const CORPUS = [
  'crane',
  'name:asc',
  '2026-01-05',
  'Site shutdown',
  '2026',
  '0',
  '-3',
  '2.5',
  'true',
  'false',
  'null',
  '007',
  '[1,2]',
  '{"a":1}',
  '"quoted"',
  '1'.repeat(32),
  'a b',
  'a+b',
  'a&b=c',
  '100% concrete',
  'Ada — Ædifice',
  '',
] as const;

describe('parseSearchStrings', () => {
  it('leaves every value a string, including the ones the library coerces', () => {
    expect(parseSearchStrings('?a=1&b=true&c=false&d=null&e=2.5')).toEqual({
      a: '1',
      b: 'true',
      c: 'false',
      d: 'null',
      e: '2.5',
    });
  });

  it('carries the all-digit token the library destroys', () => {
    const token = '1'.repeat(32);
    expect(parseSearchStrings(`?token=${token}`).token).toBe(token);
    // The control: the library's parser, on the same input, does not.
    expect((defaultParseSearch(`?token=${token}`) as { token: unknown }).token).not.toBe(token);
  });

  it('takes the first value of a repeated key (D3)', () => {
    expect(parseSearchStrings('?q=a&q=b')).toEqual({ q: 'a' });
  });

  it('accepts a search with or without its leading ?, and an empty one', () => {
    expect(parseSearchStrings('?q=a')).toEqual({ q: 'a' });
    expect(parseSearchStrings('q=a')).toEqual({ q: 'a' });
    expect(parseSearchStrings('')).toEqual({});
    expect(parseSearchStrings('?')).toEqual({});
  });

  it('reads a bare key as the empty string, unchanged from today', () => {
    expect(parseSearchStrings('?flag')).toEqual({ flag: '' });
  });

  /**
   * D8. Three screens test `'x' in search` rather than truthiness, and `Object.prototype` would
   * answer `true` for `'toString'` — so a reader asking "did the sender include an error code?"
   * would get yes on a URL that had none.
   */
  it('returns a null-prototype object, so `in` cannot inherit an answer', () => {
    const parsed = parseSearchStrings('?a=1');
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect('toString' in parsed).toBe(false);
    expect('a' in parsed).toBe(true);
  });
});

describe('stringifySearchStrings', () => {
  it('writes a plain value without quoting it', () => {
    expect(stringifySearchStrings({ q: '2026' })).toBe('?q=2026');
    expect(stringifySearchStrings({ signedOut: 'true' })).toBe('?signedOut=true');
  });

  it('omits an undefined value rather than writing the word', () => {
    expect(stringifySearchStrings({ q: 'a', scope: undefined })).toBe('?q=a');
  });

  it('emits the empty string, not a bare ?, for an empty record', () => {
    // `parseLocation` re-stringifies this into every link built from a location
    // (`router.js:183-194`), so a stray `?` would appear on every URL in the app.
    expect(stringifySearchStrings({})).toBe('');
    expect(stringifySearchStrings({ q: undefined })).toBe('');
  });

  it('throws in development on a non-string, rather than mid-navigation (D9)', () => {
    // `import.meta.env.DEV` is true under vitest, which is the branch this asserts.
    expect(() => stringifySearchStrings({ q: 1 as unknown as string })).toThrow(/are\s+strings/);
  });
});

describe('the round trip', () => {
  it.each(CORPUS)('preserves %o exactly', (value) => {
    expect(parseSearchStrings(stringifySearchStrings({ q: value })).q).toBe(value);
  });

  it('preserves a whole record, keys and values', () => {
    const record = { q: '2026', scope: 'all', archived: 'only', view: 'gantt' };
    expect(parseSearchStrings(stringifySearchStrings(record))).toEqual(record);
  });

  /**
   * **A prediction that failed, kept because the correction is the useful part.**
   *
   * This was written as "the library pair loses some of the corpus and ours does not", and it went
   * red on `expected 0 to be greater than 0`: the library pair round-trips **every** value in the
   * corpus, the 32-digit token included. That is not a flaw in the corpus. The library's stringifier
   * re-quotes exactly the values its parser would otherwise coerce, so the pair is *self-consistent*
   * — it never loses a value it wrote itself.
   *
   * Which relocates the defect precisely, and it is worth having stated: the damage is **only** to
   * URLs the app did not write. A link Better Auth composed, a URL a planner typed or edited, a
   * bookmark from another tool. Those go through the parser with no matching stringifier behind
   * them, and that is where `?verified=1` became the number 1 and where a hand-typed `?q=2026`
   * vanished.
   *
   * So the honest assertion is about a **foreign** query string, which is what the two suites and
   * both journeys have been measuring all along.
   */
  it.each(['2026', 'true', 'false', 'null', '[1,2]', '1'.repeat(32)])(
    'reads a FOREIGN ?q=%s as the text it says, where the library parser does not',
    (raw) => {
      expect(parseSearchStrings(`?q=${raw}`).q).toBe(raw);
      expect((defaultParseSearch(`?q=${raw}`) as { q: unknown }).q).not.toBe(raw);
    },
  );

  it('round-trips its own output for everything the library pair does, and nothing less', () => {
    // The library never loses a value it wrote itself (see above). Neither do we — asserted as a
    // parity claim rather than as a superiority claim, because superiority here would be false.
    for (const value of CORPUS) {
      expect((defaultParseSearch(defaultStringifySearch({ q: value })) as { q: unknown }).q).toBe(
        value,
      );
      expect(parseSearchStrings(stringifySearchStrings({ q: value })).q).toBe(value);
    }
  });
});

/**
 * **M4's expected diff, written before M4 exists.**
 *
 * Every param the app reads, at a realistic value, run through both codecs. A value in `AGREE`
 * produces the identical query string and the identical parsed value under either pair — so the
 * flip cannot change it. A value in `DIFFER` is a change M4 makes deliberately; if this list grows
 * or shrinks when the pair is wired, something else changed too.
 */
describe('the differential — where the flip changes an answer, and where it cannot', () => {
  const REALISTIC: [string, string][] = [
    ['redirect', '/orgs/acme/plans/1'],
    ['signedOut', 'true'],
    ['email', 'ada@example.com'],
    ['verified', '1'],
    ['error', 'TOKEN_EXPIRED'],
    ['token', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo'],
    ['q', 'crane'],
    ['scope', 'all'],
    ['archived', 'only'],
    ['kind', 'LABOUR'],
    ['view', 'gantt'],
    ['gsort', 'name:asc'],
    ['ghide', 'predecessors'],
    ['gcollapsed', 'abc,def'],
    ['categories', 'access,deletions'],
    ['outcome', 'SUCCESS'],
    ['from', '2026-01-05'],
    ['to', '2026-12-31'],
  ];

  /** Written from a reading, then run. Anything that moves here is a real change in behaviour. */
  const DIFFER = new Set(['signedOut', 'verified']);

  it.each(REALISTIC)('%s=%o', (key, value) => {
    const ours = stringifySearchStrings({ [key]: value });
    const theirs = defaultStringifySearch({ [key]: value });
    const oursBack = parseSearchStrings(ours)[key];
    const theirsBack = (defaultParseSearch(theirs) as Record<string, unknown>)[key];

    // Ours always round-trips; that is the whole point and it holds for all eighteen.
    expect(oursBack).toBe(value);

    if (DIFFER.has(key)) {
      expect(ours, `${key} was predicted to differ and does not`).not.toBe(theirs);
    } else {
      expect(ours, `${key} was predicted to be untouched by the flip`).toBe(theirs);
      expect(theirsBack).toBe(value);
    }
  });
});
