import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { router } from './router';

// The same pin `router-search.test.ts` carries, and for the same reason — see that file's comment.
// The absolute count below is what makes it load-bearing here: a flag flipped off would shrink the
// census rather than fail it.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PASSWORD_RESET_ENABLED: true,
  RESOURCES_ENABLED: true,
  AUDIT_LOG_ENABLED: true,
  ACCOUNT_SETTINGS_ENABLED: true,
  GUEST_SHARE_LINKS_ENABLED: true,
}));

/**
 * **Gate A — every route that declares `validateSearch` is exercised through the REAL parser**
 * (`docs/TECH_DEBT.md` #96, M2-T1).
 *
 * Three of the eight validators were covered by `router-search.test.ts` and five were not, and
 * nobody had noticed: the covered ones were the three ADR-0074 added, and each later route brought
 * a validator with it. Nothing was wrong in any of those files. The wrongness lived only in the
 * relationship between the route tree and the suite, which is the shape this repository keeps
 * recording (ADR-0093), and the only thing that catches it is a rule derived from both.
 *
 * **What it cannot do, stated so nobody reads it as more than it is.**
 *
 * 1. It checks that a route is *mentioned*, never that the case exercises the params that matter.
 *    A `validate('/x', '')` returning `{}` satisfies it. That is a real hole and it is deliberate:
 *    the alternative is a gate that tries to guess which params are interesting, which is a second
 *    opinion about the route's own declaration and would drift from it.
 * 2. It says **nothing** about the params no route declares — `gsort`, `ghide`, `gcollapsed`,
 *    `categories`, `outcome`, `from`, `to` reach their readers through the merge, not through a
 *    validator, so a census keyed on `validateSearch` structurally cannot see them. Gate B, below,
 *    is what covers those.
 *
 * **Verified red three ways** before it was trusted (ADR-0110 D5): by deleting `/forgot-password`'s
 * case from the suite (A1 fails naming it), by asserting a route count of 23 (A2 fails), and by
 * emptying the extraction regex so the covered set comes back empty (A3 fails rather than A1
 * passing vacuously — which is the ADR-0093 lesson, and the failure ADR-0108's own census hit on
 * its first run).
 */
// `process.cwd()` is `apps/web` under this workspace's vitest config, which is how every other
// structural test in this repository reaches source (`empty-state.structural.test.ts:55`).
const SUITE = join(process.cwd(), 'src/app/router-search.test.ts');

/**
 * Every path `router-search.test.ts` passes to its `validate` helper. Read from the source rather
 * than from an export, because what is being censused is *coverage*, and a list a test file
 * exported would be a second thing to keep in step with the cases it claims to describe.
 */
function coveredPaths(): Set<string> {
  const source = readFileSync(SUITE, 'utf8');
  return new Set([...source.matchAll(/validate\(\s*'([^']+)'/g)].map((m) => m[1] as string));
}

function routesDeclaringValidateSearch(): string[] {
  return Object.keys(router.routesByPath)
    .filter(
      (path) =>
        (
          router.routesByPath[path as keyof typeof router.routesByPath].options as {
            validateSearch?: unknown;
          }
        ).validateSearch !== undefined,
    )
    .sort();
}

/**
 * The eight, named. This is the **pinned positive case**: without it, "every route with a validator
 * has a case" passes just as happily against a census that found no routes at all.
 */
const KNOWN_VALIDATORS = [
  '/accept-invite',
  '/forgot-password',
  '/orgs/$orgSlug/calendars',
  '/orgs/$orgSlug/plans/$planId',
  '/orgs/$orgSlug/resources',
  '/reset-password',
  '/sign-in',
  '/verify-email',
] as const;

/**
 * The count of routes in the tree with every gating flag on. Absolute rather than "at least", so a
 * route *leaving* the tree fails here instead of quietly narrowing what the census covers.
 */
const EXPECTED_ROUTE_COUNT = 22;

describe('Gate A — the route search census', () => {
  it('A1 — every route declaring validateSearch is exercised in router-search.test.ts', () => {
    const covered = coveredPaths();
    const missing = routesDeclaringValidateSearch().filter((path) => !covered.has(path));
    expect(
      missing,
      'these routes parse search params with no case composing the real parser with their real ' +
        'validator — add one to router-search.test.ts',
    ).toEqual([]);
  });

  it('A2 — the route tree is the size this census was written against', () => {
    expect(
      Object.keys(router.routesByPath).length,
      'a route joined or left the tree; re-derive the census rather than adjusting this number ' +
        'without looking',
    ).toBe(EXPECTED_ROUTE_COUNT);
    // Named individually, so a flag-gated route silently leaving is a failure that says which.
    for (const path of [
      '/reset-password',
      '/orgs/$orgSlug/resources',
      '/orgs/$orgSlug/audit-log',
    ]) {
      expect(Object.keys(router.routesByPath), `${path} is missing from the tree`).toContain(path);
    }
  });

  it('A3 — the census is not empty, and holds the eight validators it was written for', () => {
    const declaring = routesDeclaringValidateSearch();
    expect(declaring).toEqual([...KNOWN_VALIDATORS]);
    const covered = coveredPaths();
    expect(covered.size).toBeGreaterThan(0);
    for (const path of KNOWN_VALIDATORS) expect(covered).toContain(path);
  });
});
