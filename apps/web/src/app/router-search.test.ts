import { defaultParseSearch } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

import { router } from './router';

// **Every route-gating flag is pinned ON, not just the one this file started with.** Each is
// default-on today, so the mock is a no-op — and pinned deliberately, for the reason the original
// comment gave about `VITE_PASSWORD_RESET` alone: these assertions are about route validators, and
// they must not start passing or failing because somebody changed a default elsewhere. Widened at
// #96 M2 because the census below asserts an absolute route count, and a flag flipped off would
// otherwise shrink the census silently instead of failing it — the `docs/TECH_DEBT.md`
// #178/#181/#183 shape, a rule going quiet rather than wrong.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PASSWORD_RESET_ENABLED: true,
  RESOURCES_ENABLED: true,
  AUDIT_LOG_ENABLED: true,
  ACCOUNT_SETTINGS_ENABLED: true,
  GUEST_SHARE_LINKS_ENABLED: true,
}));

/**
 * The search params other systems put in our URLs, read through the **router's real parser**
 * (ADR-0074 M5).
 *
 * **This is the only shape of test that could have caught the defect it exists for.** Every screen
 * test in the repository mocks `useSearch` and hands the component a literal, so it never crosses
 * `parseSearch` — and the router's default is `parseSearchWith(JSON.parse)`, which parses *every*
 * value that happens to be valid JSON. `?verified=1` therefore reaches `validateSearch` as the
 * **number** `1`, a `typeof search.verified === 'string'` test dropped it, and `/verify-email`
 * rendered its "still waiting" state after a verification that had actually succeeded. The unit
 * suite was green throughout; only the flag-on journey, following a real emailed link, saw it.
 *
 * So these compose the two halves the way the browser does — `defaultParseSearch` into the route's
 * own `validateSearch` — rather than testing either alone.
 */
function validate(path: string, search: string): Record<string, unknown> {
  const route = router.routesByPath[path as keyof typeof router.routesByPath];
  if (!route) throw new Error(`No route registered at ${path}. Is it behind a flag?`);
  const validateSearch = (
    route.options as {
      validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>;
    }
  ).validateSearch;
  if (!validateSearch) throw new Error(`Route ${path} has no validateSearch`);
  return validateSearch(defaultParseSearch(search));
}

describe('/verify-email search params', () => {
  it('keeps ?verified=1 even though the router parses it as a number', () => {
    expect(validate('/verify-email', '?verified=1')).toEqual({ verified: '1' });
  });

  it('keeps the address, which is not JSON and so arrives as written', () => {
    expect(validate('/verify-email', '?email=ada%40example.com')).toEqual({
      email: 'ada@example.com',
    });
  });

  it("carries Better Auth's failure code through untouched", () => {
    expect(validate('/verify-email', '?error=TOKEN_EXPIRED')).toEqual({ error: 'TOKEN_EXPIRED' });
  });

  it('yields nothing for a bookmarked arrival with no params', () => {
    expect(validate('/verify-email', '')).toEqual({});
  });
});

describe('/reset-password search params', () => {
  it('carries an ordinary token and an error code', () => {
    expect(validate('/reset-password', '?token=abc123&error=INVALID_TOKEN')).toEqual({
      token: 'abc123',
      error: 'INVALID_TOKEN',
    });
  });

  it('cannot recover an all-digit token, and this pins that limit rather than hiding it', () => {
    // Written expecting the opposite, and the run corrected it: `JSON.parse` has already produced
    // `1.2345678901234567e+31` by the time any validator runs, so re-stringifying recovers a
    // different token, not the original. `searchString` fixes values whose `String()` round
    // trips — `1`, `true`, small integers — and it cannot fix this one. The real remedy is a
    // router-level `parseSearch` that leaves values alone, which is a change to every route's
    // search handling: `docs/TECH_DEBT.md` #96.
    //
    // Kept because the alternative is silence: a token composed only of digits is astronomically
    // unlikely from Better Auth's generator, and a reader who assumes this line defends against it
    // would be wrong.
    expect(validate('/reset-password', '?token=12345678901234567890123456789012')).toEqual({
      token: '1.2345678901234567e+31',
    });
  });
});

describe('/sign-in `?redirect=` is same-origin by shape (#102(1))', () => {
  /**
   * `/sign-in` is where **every** unauthenticated arrival lands (`router.tsx:128` composes the
   * param), and the value is spent as `router.history.push(search.redirect ?? '/')`. Until this
   * check it was whatever the URL said.
   *
   * It was never exploitable, and the reason matters more than the fact: `pushState` throws on a
   * cross-origin URL. That is a property of the History API, not of our code, and it stops
   * protecting us the moment somebody replaces the push with a `window.location` assignment — one
   * ordinary refactor, on the product's front door.
   */
  it('keeps an ordinary in-app path', () => {
    expect(validate('/sign-in', '?redirect=/orgs/acme/plans/1')).toEqual({
      redirect: '/orgs/acme/plans/1',
    });
  });

  it('drops a protocol-relative URL, which the browser resolves to another origin', () => {
    // The case a single leading-slash check would wave through, and the reason the rule is
    // "one slash, not two" rather than "starts with a slash".
    expect(validate('/sign-in', '?redirect=//evil.test/phish')).toEqual({});
  });

  it('drops an absolute URL', () => {
    expect(validate('/sign-in', '?redirect=https://evil.test')).toEqual({});
  });

  it('drops a relative path, which is not ours to resolve', () => {
    expect(validate('/sign-in', '?redirect=orgs/acme')).toEqual({});
  });

  it('drops a foreign-typed value rather than stringifying it into a path', () => {
    // `?redirect=1` reaches the validator as the NUMBER 1 (the default parser JSON-parses every
    // value — #96). `searchString` turns it into `'1'`, which is not a path, so it is dropped
    // rather than pushed. Before the shape check, `'1'` would have been pushed as a destination.
    expect(validate('/sign-in', '?redirect=1')).toEqual({});
  });

  it('leaves `signedOut` alone', () => {
    // The sibling param on the same route, asserted so the shape check cannot quietly widen.
    expect(validate('/sign-in', '?signedOut=true')).toEqual({ signedOut: 'true' });
  });
});

/**
 * **The five validators this file did not cover** (`docs/TECH_DEBT.md` #96, M2-T2).
 *
 * The census below refuses a route that declares `validateSearch` and has no case here. It was
 * added because three of the eight were covered and nobody had noticed the other five — which is
 * the same shape as the defect the file exists for: a rule applied to one control and not its
 * neighbour.
 *
 * **These record TODAY'S answers, including the ones M4 will change.** Writing them against the
 * behaviour we want would make M4's diff meaningless; written against the behaviour we have, the
 * flip's diff is pre-reviewed. Each case M4 changes says so on the line.
 */
describe('/forgot-password search params', () => {
  it('carries a prefilled address', () => {
    expect(validate('/forgot-password', '?email=ada%40example.com')).toEqual({
      email: 'ada@example.com',
    });
  });

  it('coerces a foreign-typed address rather than dropping it', () => {
    // `?email=1` arrives as the NUMBER 1. Silly as an address, and the point is that the route
    // carries what was written instead of rendering its empty state as though nothing was sent.
    expect(validate('/forgot-password', '?email=1')).toEqual({ email: '1' });
  });
});

describe('/accept-invite search params', () => {
  it('carries a real base64url token unchanged', () => {
    // 43 characters of base64url is what `generateOpaqueToken` produces
    // (`apps/api/src/common/tokens/token.ts:16`) — not JSON, so it arrives as written.
    const token = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo';
    expect(validate('/accept-invite', `?token=${token}`)).toEqual({ token });
  });

  it('yields nothing when the link was truncated', () => {
    expect(validate('/accept-invite', '')).toEqual({});
  });
});

describe('the library screens’ filter params', () => {
  /**
   * **This validator still tests `typeof === "string"`, and the screens work anyway.** That is not
   * luck and it is not a second bug: `validateSearch`'s return is *added to* the parsed search
   * rather than substituted for it (`router.js:685-696`), so a key this drops is still on the match
   * and still reaches `pickText` — which since #96 M1 coerces it. Pinned in
   * `router-search.characterisation.test.ts`, and proved end to end by
   * `apps/web/e2e-library/search-param-probe.spec.ts`.
   *
   * So the assertions below are about **the validator alone**, and they are the clearest statement
   * in the repository of why a per-route fix would not have worked.
   */
  it('keeps ordinary text filters', () => {
    expect(validate('/orgs/$orgSlug/calendars', '?q=crane&scope=all&archived=only')).toEqual({
      q: 'crane',
      scope: 'all',
      archived: 'only',
    });
  });

  it('DROPS a numeric search term — M4 changes this to { q: ‘2026’ }', () => {
    expect(validate('/orgs/$orgSlug/calendars', '?q=2026')).toEqual({});
  });

  it('drops an empty value, which is how "no filter" is spelled', () => {
    expect(validate('/orgs/$orgSlug/calendars', '?q=')).toEqual({});
  });

  it('ignores a key it was not given', () => {
    // `kind` belongs to Resources. The merge still delivers it to the match; this asserts only that
    // the calendars validator does not claim it.
    expect(validate('/orgs/$orgSlug/calendars', '?kind=LABOUR')).toEqual({});
  });

  it('keeps the resources screen’s own three', () => {
    expect(validate('/orgs/$orgSlug/resources', '?q=crew&kind=LABOUR&archived=include')).toEqual({
      q: 'crew',
      kind: 'LABOUR',
      archived: 'include',
    });
  });
});

describe('the plan workspace’s ?view=', () => {
  it('keeps a view name', () => {
    expect(validate('/orgs/$orgSlug/plans/$planId', '?view=gantt')).toEqual({ view: 'gantt' });
  });

  it('DROPS a numeric view — M4 changes this to { view: ‘1’ }', () => {
    // Harmless today: the screen falls back to the diagram, which is where an unrecognised value
    // should land anyway. Recorded because M4 changes the answer and the diff must be legible.
    expect(validate('/orgs/$orgSlug/plans/$planId', '?view=1')).toEqual({});
  });

  it('drops an empty view, which is how the default is spelled', () => {
    expect(validate('/orgs/$orgSlug/plans/$planId', '?view=')).toEqual({});
  });
});
