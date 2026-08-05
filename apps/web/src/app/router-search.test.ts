import { defaultParseSearch } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

import { router } from './router';

// `/reset-password` joins the tree only when `VITE_PASSWORD_RESET` is on (ADR-0074 M4), and the
// route is where its `token` is read. The flag is default-ON since 2026-08-05, so this mock is a
// no-op today and pinned deliberately: these assertions are about the route's validator, and they
// must not start passing or failing because somebody changed a default elsewhere.
// `/verify-email` is registered either way.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PASSWORD_RESET_ENABLED: true,
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
    // different token, not the original. `readForeignParam` fixes values whose `String()` round
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
