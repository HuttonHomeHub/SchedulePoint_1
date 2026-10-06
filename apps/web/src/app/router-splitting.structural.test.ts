import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **S1 — every route's screen is code-split, or named here with a reason**
 * (`docs/specs/route-code-splitting/`, M1-T2; closes the half of `docs/TECH_DEBT.md` #292 that
 * the byte budget cannot).
 *
 * The budget gate sees a statically-added 25th route only once the 5% headroom is spent, which
 * several routes can do without a single failure; and before this epic the routes were all static
 * and the sentence "routes are lazy by default" was wrong for months. This is the structural
 * half: the rule is read from `router.tsx` and a route that breaks it is named.
 *
 * **What it reads, and what it cannot.** It scans the source text with comments removed, because
 * four gates in this repository have matched their own docblocks (`docs/TECH_DEBT.md` #222, #231;
 * ADR-0097's weight ratchet; ADR-0106's reset-fills test) — `router.tsx` documents the banned form
 * in prose. A component is split when it is bound, in that file, by `lazyRouteComponent(` or
 * `lazy(`; a route whose `component` is an inline arrow counts as split when its body names such a
 * binding. It does not execute the router, so it says nothing about whether a chunk really
 * separates: that is `check:web-bundle` (the entry graph) and the production-build journey
 * (`apps/web/e2e-splitting/`).
 *
 * **Verified red three ways** (ADR-0110 D5): by importing a screen statically again (S1a names
 * it), by pointing the scan at an empty string (S1c fails instead of passing over zero routes —
 * the ADR-0093 failure, which ADR-0108's own census hit on its first run), and by putting a
 * static route inside a comment (S1d: the comment is not a route).
 */

/**
 * The routes that are, by design, not split. A **component** name, because that is what the source
 * says; the reason is the point, and an entry with no reason is not accepted.
 */
const EAGER_ROUTES: Readonly<Record<string, string>> = {
  SignInScreen:
    'The screen every unauthenticated arrival lands on (the router redirects there), so a chunk ' +
    'would put one more round trip in front of the first paint of every cold visit. 2,835 gzip ' +
    'bytes (m0-measurement.md section 9).',
};

/**
 * Routes that will be split by a later milestone of this epic and are static today. **Temporary by
 * construction**: S1e fails an entry that is no longer static, so each milestone must delete what
 * it converts, and the list reaching empty is M5's closing condition. A permanent exception goes
 * in `EAGER_ROUTES` with a reason, not here.
 */
const SCHEDULED: Readonly<Record<string, string>> = {};

/** Block and line comments removed. A `//` inside a string is rare enough in this file to be tolerated. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

interface RouteCensus {
  /** `createRoute({...})` declarations whose options name a `component`, by route constant. */
  routes: { name: string; component: string }[];
  /** Identifiers bound by `lazyRouteComponent(` or `lazy(`. */
  lazyBindings: Set<string>;
}

/** The `{...}` that follows `createRoute(`, by brace matching — a regex cannot nest. */
function optionsBlock(source: string, from: number): string {
  const open = source.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

function census(rawSource: string): RouteCensus {
  const source = stripComments(rawSource);
  const lazyBindings = new Set(
    [...source.matchAll(/const\s+(\w+)\s*=\s*(?:lazyRouteComponent|lazy)\(/g)].map(
      (m) => m[1] as string,
    ),
  );
  const routes: RouteCensus['routes'] = [];
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*createRoute\(/g)) {
    const block = optionsBlock(source, m.index + m[0].length);
    const named = /\bcomponent:\s*(\w+)\s*[,}\n]/.exec(block);
    if (named) {
      routes.push({ name: m[1] as string, component: named[1] as string });
      continue;
    }
    if (/\bcomponent:\s*\(\)\s*=>/.test(block)) {
      // An inline arrow: split when its body renders one of the lazy bindings.
      const used = [...lazyBindings].find((b) => new RegExp(`<${b}\\b`).test(block));
      routes.push({ name: m[1] as string, component: used ?? `(inline in ${m[1]})` });
    }
  }
  return { routes, lazyBindings };
}

/** Components that are neither split nor allowed — what S1a reports. */
function unclassified(rawSource: string): string[] {
  const { routes, lazyBindings } = census(rawSource);
  return routes
    .map((r) => r.component)
    .filter((c) => !lazyBindings.has(c) && !(c in EAGER_ROUTES) && !(c in SCHEDULED));
}

const ROUTER = readFileSync(join(process.cwd(), 'src/app/router.tsx'), 'utf8');

describe('S1 — route code splitting is the rule, and eager is the named exception', () => {
  it('S1a — every route component is lazy, allowed, or scheduled', () => {
    expect(unclassified(ROUTER)).toEqual([]);
  });

  it('S1b — the pinned positive case: the census finds the routes that exist', () => {
    // Without this, S1a passes just as happily over a census that matched nothing. 22 routes
    // carry a `component` (23 `createRoute` calls, and the index route has none).
    const { routes } = census(ROUTER);
    expect(routes.length).toBe(22);
    const byComponent = new Map(routes.map((r) => [r.component, r.name]));
    expect(byComponent.get('SignInScreen')).toBe('signInRoute');
    expect(byComponent.get('AccountScreen')).toBe('accountRoute');
    expect(byComponent.get('AuthedLayout')).toBe('authedRoute');
    expect(byComponent.get('ShareGuestScreen')).toBe('shareGuestRoute');
  });

  it('S1c — an empty population is refused, not read as "nothing unclassified"', () => {
    expect(census('').routes).toEqual([]);
    // The assertion S1b makes, applied to the fixture: a scan of nothing must not be able to pass.
    expect(census('').routes.length).not.toBe(22);
  });

  it('S1d — a statically imported route is named, and a route in a comment is not a route', () => {
    const base = `
      const AccountScreen = lazyRouteComponent(() => import('@/routes/account'), 'AccountScreen');
      const accountRoute = createRoute({ getParentRoute: () => root, path: '/account', component: AccountScreen });
    `;
    expect(unclassified(base)).toEqual([]);
    const regressed = base.replace(
      "const AccountScreen = lazyRouteComponent(() => import('@/routes/account'), 'AccountScreen');",
      "import { AccountScreen } from '@/routes/account';",
    );
    expect(unclassified(regressed)).toEqual(['AccountScreen']);
    const inComment = `${base}\n// const x = createRoute({ component: NewScreen });\n/* const y = createRoute({ component: OtherScreen }); */`;
    expect(unclassified(inComment)).toEqual([]);
  });

  it('S1e — an allow-list entry that is no longer a static route is stale', () => {
    // Otherwise the list only ever grows: an entry survives its own conversion and the next reader
    // takes it for a live decision.
    const { routes, lazyBindings } = census(ROUTER);
    const components = new Set(routes.map((r) => r.component));
    for (const name of [...Object.keys(EAGER_ROUTES), ...Object.keys(SCHEDULED)]) {
      expect(components.has(name), `${name} is not a route component here`).toBe(true);
      expect(lazyBindings.has(name), `${name} is split now; delete its entry`).toBe(false);
    }
  });

  it('S1f — every exception carries a reason', () => {
    for (const [name, reason] of Object.entries({ ...EAGER_ROUTES, ...SCHEDULED })) {
      expect(reason.trim().length, `${name} has no reason`).toBeGreaterThan(0);
    }
  });
});

describe('S2 — the onboarding screen is warmed where it is the likely next screen (#435)', () => {
  const source = stripComments(ROUTER);
  const blockOf = (route: string): string => {
    const at = source.indexOf(`const ${route} = createRoute(`);
    expect(at, `${route} not found`).toBeGreaterThanOrEqual(0);
    return optionsBlock(source, at);
  };

  it.each(['signInRoute', 'signUpRoute'])('S2a — %s warms the onboarding chunk', (route) => {
    expect(blockOf(route)).toMatch(/beforeLoad:\s*warmOnboardingScreen/);
  });

  it('S2b — the warm-up preloads OnboardingScreen, off the critical path', () => {
    const fn = /function warmOnboardingScreen\(\)[^{]*\{([\s\S]*?)\n\}/.exec(source);
    expect(fn, 'warmOnboardingScreen not found').not.toBeNull();
    expect(fn![1]).toMatch(/deferUntilIdle\(/);
    expect(fn![1]).toMatch(/OnboardingScreen\.preload/);
  });
});

describe('S3 — the staff loading probe asks for what a plan URL asks for (#433)', () => {
  const source = stripComments(ROUTER);

  it('S3a — the exported function is the one place the two loaders are listed', () => {
    const fn = /export function preloadPlanDeepLinkChunks\(\)[^{]*\{([\s\S]*?)\n\}/.exec(source);
    expect(fn, 'preloadPlanDeepLinkChunks is not exported from router.tsx').not.toBeNull();
    expect(fn![1]).toMatch(/AuthedLayout\.preload/);
    expect(fn![1]).toMatch(/PlanDetailScreen\.preload/);
  });

  it('S3b — the PLAN_DEEP_LINK branch calls it rather than re-listing the loaders', () => {
    // Verified red (ADR-0110 D5) by inlining `void AuthedLayout.preload?.();` and
    // `void PlanDetailScreen.preload?.();` back into the branch: this assertion fails, because the
    // branch no longer names the shared function, and so does the `not.toMatch` beneath it.
    const branch = /if \(PLAN_DEEP_LINK\) \{([\s\S]*?)\n\}/.exec(source);
    expect(branch, 'the PLAN_DEEP_LINK branch is not found').not.toBeNull();
    expect(branch![1]).toMatch(/preloadPlanDeepLinkChunks\(\)/);
    expect(branch![1]).not.toMatch(/\.preload/);
  });
});
