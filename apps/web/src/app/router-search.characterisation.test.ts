import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  createRoute,
  defaultParseSearch,
  defaultStringifySearch,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { router } from './router';

/**
 * **What the router's search codec actually does today** (`docs/TECH_DEBT.md` #96, M0-T1).
 *
 * Its sibling `router-search.test.ts` asserts **intent** — the behaviours the app wants. This one
 * records **fact**: the observed output of the real `defaultParseSearch` / `defaultStringifySearch`,
 * so that when #96 replaces them the diff is legible and every changed answer is a decision
 * somebody made rather than a side effect nobody noticed.
 *
 * **How these values were actually arrived at, because the first version of this docblock claimed
 * otherwise and that would have been the exact failure the file exists to guard against.** They
 * were written from the #96 spec's F1 reading of the library's decode and parse steps, and then
 * run. All 23 of the codec assertions passed on the first execution. So the honest statement is not
 * "recorded from output" — it is *predicted from a reading of the dependency's source, and then
 * confirmed by running*, which is a stronger result and a different claim. It is also independent
 * evidence that F1's analysis is sound, which matters, because #96's whole remedy rests on it.
 *
 * **The two merge assertions at the bottom are the exception, and the exception is the useful
 * part.** They needed a real `createRouter`, and one of them came back saying something the reading
 * had not predicted — see that section's own docblock. Which is the argument for running a
 * prediction rather than filing it.
 *
 * That distinction is the file's point: three docblocks in this repository describe this mechanism,
 * and the spec found the description to be half the mechanism — the half that defeats the remedy
 * those docblocks propose.
 *
 * **The two coercions are separate, and that is finding F1 made executable.** The docblocks say
 * "the default `parseSearch` is `parseSearchWith(JSON.parse)`, which JSON-parses every value".
 * `?verified=1` does arrive as the number `1`, but `JSON.parse` is not what does it: the decode
 * step coerces `"true"`, `"false"` and canonical numeric strings BEFORE the parser is consulted,
 * and the parser only ever sees values that are still strings. So a "parser that leaves values
 * alone" would not fix it — which is why #96's remedy has to bypass that helper entirely.
 *
 * **M4 happened, and NOT ONE ASSERTION BELOW MOVED. That is correct, and it is the point.** This
 * file characterises the **library's** codec by calling `defaultParseSearch` /
 * `defaultStringifySearch` by name, and M4 did not change those functions — it stopped the router
 * using them (`app/router.tsx`, `parseSearch` / `stringifySearch`). So the record of *why* the
 * codec was replaced survives the replacement, which is what a characterisation suite is for and
 * what makes the revert a one-line decision rather than an archaeology exercise.
 *
 * The prediction written here before M4 said these assertions would become string-preserving. That
 * was wrong about **this file** and right about the product: the values that changed are in
 * `router-search.test.ts`, which composes the route validators with whatever parser the router
 * actually holds. Three of its expectations moved, all three predicted on the line. Corrected here
 * rather than quietly deleted, because a prediction that missed is worth more on the page than off
 * it.
 *
 * The section at the foot asserts what the router does **now**, so this file remains an oracle of
 * the seam rather than of a dependency the product no longer routes through.
 */
describe('the router search codec — characterisation (records fact, not intent)', () => {
  describe('coerced BEFORE the parser is consulted', () => {
    // These never reach `JSON.parse` at all: the decode step has already turned them into
    // non-strings, and the parser is only tried on values that are still strings.
    it.each([
      ['?x=true', true],
      ['?x=false', false],
      ['?x=1', 1],
      ['?x=0', 0],
      ['?x=-3', -3],
      ['?x=2.5', 2.5],
    ])('%s → %o', (query, expected) => {
      expect(defaultParseSearch(query)).toEqual({ x: expected });
    });
  });

  describe('coerced BY the parser — the cases the decode step declines', () => {
    it.each([
      ['?x=null', null],
      ['?x=[1,2]', [1, 2]],
      ['?x={"a":1}', { a: 1 }],
      ['?x="quoted"', 'quoted'],
    ])('%s → %o', (query, expected) => {
      expect(defaultParseSearch(query)).toEqual({ x: expected });
    });
  });

  describe('left alone — a string is a string when nothing can claim it', () => {
    it.each([
      ['?x=name', 'name'],
      ['?x=name:asc', 'name:asc'],
      ['?x=2026-01-05', '2026-01-05'],
      ['?x=', ''],
      ['?x=007', '007'], // canonical form differs, so the number coercion declines it
    ])('%s → %o', (query, expected) => {
      expect(defaultParseSearch(query)).toEqual({ x: expected });
    });
  });

  describe('the stringifier', () => {
    it('re-quotes a string that would otherwise parse back as something else', () => {
      // This is where the `%22` a planner sees in the address bar comes from, measured live in
      // `apps/web/e2e-library/search-param-probe.spec.ts` (#96 M0-T2).
      expect(defaultStringifySearch({ q: '2026' })).toBe('?q=%222026%22');
      expect(defaultStringifySearch({ q: 'true' })).toBe('?q=%22true%22');
    });

    it('leaves a string alone when nothing would claim it back', () => {
      expect(defaultStringifySearch({ sort: 'name:asc' })).toBe('?sort=name%3Aasc');
      expect(defaultStringifySearch({ q: 'crane' })).toBe('?q=crane');
    });
  });

  describe('the round trip', () => {
    it.each(['crane', 'name:asc', '2026-01-05', 'Site shutdown'])(
      'preserves %o, which is what the app itself writes',
      (value) => {
        expect(defaultParseSearch(defaultStringifySearch({ q: value }))).toEqual({ q: value });
      },
    );

    it('preserves the values the stringifier re-quotes, because it quotes them for that reason', () => {
      for (const value of ['2026', 'true', 'false', 'null']) {
        expect(defaultParseSearch(defaultStringifySearch({ q: value }))).toEqual({ q: value });
      }
    });

    /**
     * **The limit, restated here so the oracle is complete.** A 32-digit token exceeds what a
     * double can hold exactly, so the number it coerces to does not stringify back to the token.
     * `router-search.test.ts` already pins this from the intent side; recording it as fact means
     * M4's diff shows whether the remedy fixed it or merely moved it.
     */
    it('does NOT preserve an all-digit token longer than a double can hold', () => {
      const token = '1'.repeat(32);
      const parsed = defaultParseSearch(`?token=${token}`) as { token: unknown };
      expect(typeof parsed.token).toBe('number');
      expect(String(parsed.token)).not.toBe(token);
    });
  });

  /**
   * **The merge — finding F5, and the one thing here that needed a real router to establish.**
   *
   * `validateSearch`'s return is assigned OVER the parsed search
   * (`router.js:685-696`), and `useSearch` hands back `match.search` whatever `strict` is set to
   * (`useSearch.js:21-23`). Two consequences that nothing in this repository pins, and that every
   * route validator in `router.tsx` is written as though were false:
   *
   * 1. A validator cannot **remove** a key. A route that declares nothing still shows a consumer
   *    every param the URL carried, already coerced.
   * 2. A validator's own output is **added to** the raw values, not substituted for them — so a
   *    validator that renames a param leaves the original in place beside the new name.
   *
   * These are measured, not read: the assertions below were written from `router.js:685-696` and
   * then run against a real `createRouter` over a real memory history, and the second one was
   * **not** what the reading predicted. It says the plan's phrasing ("does not remove that key")
   * understates it.
   *
   * This is why #96's remedy is a router-level `parseSearch` rather than per-route validators:
   * a validator sanitising its own keys leaves every other key on the match exactly as the default
   * codec produced it, so a fix applied route by route would be no fix at all.
   */
  describe('the merge — a validator adds to the parsed search, it does not replace it', () => {
    async function searchOnMatch(
      validateSearch: (search: Record<string, unknown>) => object,
      url: string,
    ): Promise<unknown> {
      const rootRoute = createRootRoute({});
      const child = createRoute({
        getParentRoute: () => rootRoute,
        path: '/thing',
        validateSearch,
      });
      const router = createRouter({
        routeTree: rootRoute.addChildren([child]),
        history: createMemoryHistory({ initialEntries: [url] }),
      });
      await router.load();
      return router.state.matches.at(-1)?.search;
    }

    it('keeps every key a validator declines to declare', async () => {
      expect(await searchOnMatch(() => ({}), '/thing?q=a&n=1')).toEqual({ q: 'a', n: 1 });
    });

    it('leaves the source key in place beside a renamed one', async () => {
      expect(await searchOnMatch((s) => ({ kept: s.q }), '/thing?q=a&n=1')).toEqual({
        q: 'a',
        n: 1,
        kept: 'a',
      });
    });
  });
});

/**
 * **And what the router actually holds, since #96 M4.**
 *
 * Everything above describes the library's codec. These describe ours, reached through
 * `router.options` rather than by importing the module — because what matters is the codec the
 * product is *configured with*, and naming the module directly would pass just as happily if
 * somebody removed the two options from `createRouter`.
 */
describe('the router’s own codec, as configured', () => {
  it.each([
    ['?x=1', '1'],
    ['?x=true', 'true'],
    ['?x=false', 'false'],
    ['?x=null', 'null'],
    ['?x=2.5', '2.5'],
    ['?x=[1,2]', '[1,2]'],
    ['?x=' + '1'.repeat(32), '1'.repeat(32)],
  ])('%s stays the string it was written as → %o', (query, expected) => {
    expect((router.options.parseSearch(query) as { x: unknown }).x).toBe(expected);
  });

  it('writes a value without quoting it, which is the half a parser alone would not fix', () => {
    expect(router.options.stringifySearch({ q: '2026' })).toBe('?q=2026');
    expect(router.options.stringifySearch({ signedOut: 'true' })).toBe('?signedOut=true');
  });

  it('round-trips through the configured pair, which is what a navigation does', () => {
    for (const value of ['2026', 'true', 'name:asc', 'Site shutdown', '1'.repeat(32)]) {
      const back = router.options.parseSearch(router.options.stringifySearch({ q: value })) as {
        q: unknown;
      };
      expect(back.q).toBe(value);
    }
  });
});
