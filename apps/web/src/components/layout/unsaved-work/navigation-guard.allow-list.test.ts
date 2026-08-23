import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The allow-list's paths must exist in the route tree.**
 *
 * `shouldBlockFn` never blocks a navigation to `/sign-in`, because signing out and an expired
 * session both land there and a confirmation would trap a reader whose work is already unreachable.
 * That exemption is keyed on a **string**, and a string keyed to a route that moves stops matching
 * silently — the guard would then block sign-out, which is worse than not guarding at all.
 *
 * This is the ADR-0099 "axe scan matching nothing" shape: a rule that quietly stops applying looks
 * exactly like a rule that is being satisfied. Asserting the path still exists in `router.tsx` is
 * the cheapest thing that fails when it moves.
 */
const router = readFileSync(join(__dirname, '../../../app/router.tsx'), 'utf8');
const guard = readFileSync(join(__dirname, 'navigation-guard.tsx'), 'utf8');

describe('the navigation guard’s allow-list stays anchored to real routes', () => {
  it('every allow-listed path is declared in the route tree', () => {
    const allowed = [...guard.matchAll(/startsWith\('([^']+)'\)/g)].map((m) => m[1]);
    // Guards the guard: an empty list would make every assertion below vacuously true.
    expect(allowed.length).toBeGreaterThan(0);
    for (const path of allowed) {
      expect(router, `${path} is allow-listed but not declared in router.tsx`).toContain(
        `path: '${path}'`,
      );
    }
  });

  it('sign-in specifically is exempt, because that is the way out', () => {
    expect(guard).toContain("next?.fullPath?.startsWith('/sign-in')");
    expect(router).toContain("path: '/sign-in'");
  });
});
