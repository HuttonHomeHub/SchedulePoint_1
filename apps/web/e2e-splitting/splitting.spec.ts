import { existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { countWaves, type TimedRequest } from './waves';

/**
 * **Route code splitting, driven against the production build** (`docs/specs/route-code-splitting/`,
 * M1-T4; ADR-0081 §2: a milestone that claims capability lands with a journey that drives it).
 *
 * It serves `dist/` through `vite preview` — chunks do not exist under `pnpm dev`, so the dev server
 * cannot show a waterfall, a pending state or a stale deploy. It is hermetic like the forced-colours
 * suite: no API, no database. Every case starts on `/sign-in` (the front door, ADR-0077) and reaches
 * `/sign-up`, one of the seven screens M1 split. **The authenticated frame (also lazy since M1) is
 * not driven here** — it needs a session — and is covered by the existing signed-in suites
 * (`e2e-account`, `e2e-shell`, the base journey), which run against the dev server and so prove the
 * screens still work, not that their chunks arrive. Named so a green run is not read as more.
 *
 * What each case asserts, and the spec clause it answers:
 *
 * - **P3**: no more than two sequential JavaScript waves, cold, on `/sign-in` and on a cold
 *   `/sign-up` (the lazy screen's own cold path). Counted from resource timing, not requests.
 * - **P4 (partial)**: cold `/sign-in` JavaScript transfer has not grown past the pre-split figure
 *   recorded in `m0-measurement.md` section 10, plus 1%. The spec's bar is a FALL of 100,000, and
 *   M1 cannot meet it: the entry graph is 461,670 gzip before the milestone's split and 461,315
 *   after, because most screens are still static. The 100,000 bar is arithmetic over the whole
 *   epic and is asserted when the plan-workspace leaves the entry graph (M3), not here.
 * - **The pending state**: a slow chunk shows `RoutePending` after the router's one-second default,
 *   passes axe, and a fast one never shows it.
 * - **Stale deploy, driven rather than reasoned about**: the host redeploys under open tabs
 *   (ADR-0047), so the first unvisited-screen navigation after a release asks for a chunk that no
 *   longer exists. Here the chunk is really deleted from `dist/assets/` (and, separately, blocked
 *   at the network): exactly ONE automatic reload, then `RouteErrorScreen`, then **Try again**
 *   recovers once the file is back. This is also where M1-T1b is proven: `lazyRouteComponent`
 *   latches the failed import for the document, and only a reload clears it.
 *
 * **Both pointer modes**, because ADR-0118 found no gate here had ever run with a coarse pointer
 * and a touch screen never hovers, so it never preloads. Cases tagged `@both-pointers` run in the
 * second project too.
 *
 * **What it does not establish.** Whether a plain re-import (no reload) would also recover in every
 * browser — the spec's `[unverified]` module-cache premise — is NOT settled by this file: the
 * button always reloads for a chunk failure, so nothing here tries the alternative. Wall-clock
 * timing is the container harness's job (`measure-route-splitting/`), not an assertion.
 */

/** The cold `/sign-in` JavaScript transfer before any splitting, `m0-measurement.md` section 10. */
const PRE_SPLIT_COLD_JS_BYTES = 463_933;
const PRE_SPLIT_TOLERANCE = 1.01;
/** P3's bar: the entry graph, then at most one wave of route chunks fetched together. */
const MAX_WAVES = 2;
/** The chunk the Create-an-account link leads to; `vite build` names it `sign-up-<hash>.js`. */
const SIGN_UP_CHUNK = /\/assets\/sign-up-[^/]+\.js$/;
const DIST_ASSETS = join(process.cwd(), 'dist', 'assets');

interface JsTiming {
  readonly requests: TimedRequest[];
  readonly transferBytes: number;
}

/** Every script resource the page has fetched so far, from the browser's own timeline. */
async function jsTiming(page: Page): Promise<JsTiming> {
  const rows = await page.evaluate(() =>
    (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((e) => new URL(e.name).pathname.endsWith('.js'))
      .map((e) => ({
        name: new URL(e.name).pathname,
        startTime: e.startTime,
        responseEnd: e.responseEnd,
        transferSize: e.transferSize,
      })),
  );
  return {
    requests: rows,
    transferBytes: rows.reduce((sum, r) => sum + r.transferSize, 0),
  };
}

/** Non-vacuity (ADR-0093): a count over nothing, or over a page that fetched no code, proves nothing. */
function expectPopulated(timing: JsTiming): void {
  expect(
    timing.requests.length,
    'no script was fetched, so there is nothing to count',
  ).toBeGreaterThan(0);
  expect(
    timing.transferBytes,
    'the transfer total is implausibly small for this app',
  ).toBeGreaterThan(100_000);
}

test.describe('waves and bytes @both-pointers', () => {
  test('cold /sign-in: at most two sequential JavaScript waves, and no more bytes than before', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email')).toBeVisible();
    await page.waitForLoadState('load');

    const timing = await jsTiming(page);
    expectPopulated(timing);
    expect(countWaves(timing.requests)).toBeLessThanOrEqual(MAX_WAVES);
    expect(timing.transferBytes).toBeLessThanOrEqual(PRE_SPLIT_COLD_JS_BYTES * PRE_SPLIT_TOLERANCE);
    // The split screens are not in the first paint: none of the seven chunks was requested.
    expect(timing.requests.some((r) => SIGN_UP_CHUNK.test(r.name))).toBe(false);
  });

  test('cold /sign-up: the lazy screen is one more wave, not two', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await page.waitForLoadState('load');

    const timing = await jsTiming(page);
    expectPopulated(timing);
    // The control: the screen's own chunk really was fetched, so this is the path with a lazy hop.
    expect(timing.requests.some((r) => SIGN_UP_CHUNK.test(r.name))).toBe(true);
    expect(countWaves(timing.requests)).toBeLessThanOrEqual(MAX_WAVES);
  });

  test('a link opens the lazy screen', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  });
});

test.describe('intent preload', () => {
  test('hovering the link fetches the chunk first, so activation shows no pending state', async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, 'a touch screen has no hover, so it never preloads (ADR-0118)');
    await page.goto('/sign-in');
    const link = page.getByRole('link', { name: 'Create an account' });
    const chunk = page.waitForRequest((r) => SIGN_UP_CHUNK.test(new URL(r.url()).pathname));
    await link.hover();
    await chunk;
    await link.click();
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await expect(page.getByTestId('route-pending')).toHaveCount(0);
  });
});

test.describe('the pending state', () => {
  test('a slow chunk shows the skeleton after the library default, and it passes axe', async ({
    page,
  }) => {
    await page.route(SIGN_UP_CHUNK, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.continue();
    });
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Create an account' }).click();

    const pending = page.getByTestId('route-pending');
    // Not before the router's `defaultPendingMs` of 1000, which is the point of leaving it unset.
    await expect(pending).toBeVisible({ timeout: 2_000 });
    await expect(pending).toHaveAttribute('aria-busy', 'true');

    const results = await new AxeBuilder({ page })
      .options({
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
        },
      })
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(pending).toHaveCount(0);
  });
});

/**
 * Break the chunk, navigate to it, and return once the page has settled on the error screen.
 * Counts document loads: the first is the initial `/sign-in`, so a single automatic reload makes two.
 */
async function reachErrorScreen(page: Page, loads: { count: number }): Promise<void> {
  await page.goto('/sign-in');
  await expect(page.getByLabel('Email')).toBeVisible();
  expect(loads.count).toBe(1);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible({
    timeout: 15_000,
  });
  // A second automatic reload would be a loop. The router's own guard allows one per message.
  await page.waitForTimeout(1_500);
  expect(loads.count, 'exactly one automatic reload').toBe(2);
}

async function recoverWithTryAgain(page: Page, loads: { count: number }): Promise<void> {
  await expect(page.getByText(/reloads the page/i)).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible({
    timeout: 15_000,
  });
  expect(loads.count, 'Try again reloaded the page once more').toBe(3);
}

test.describe('a stale deploy', () => {
  test('a deleted chunk: one automatic reload, the error screen, then Try again recovers', async ({
    page,
  }) => {
    const file = readdirSync(DIST_ASSETS).find((f) => /^sign-up-.+\.js$/.test(f));
    expect(
      file,
      'the build has a sign-up chunk — the lazy conversion is what this proves',
    ).toBeDefined();
    const live = join(DIST_ASSETS, file ?? '');
    const stashed = `${live}.stashed`;
    const loads = { count: 0 };
    page.on('load', () => {
      loads.count += 1;
    });

    // The deploy has replaced `dist/`: the old chunk name no longer answers.
    renameSync(live, stashed);
    try {
      await reachErrorScreen(page, loads);
    } finally {
      // Restore before anything else can fail, or every later case runs against a broken `dist/`.
      if (existsSync(stashed)) renameSync(stashed, live);
    }
    await recoverWithTryAgain(page, loads);
  });

  test('a blocked chunk: the same path, driven at the network', async ({ page }) => {
    const loads = { count: 0 };
    page.on('load', () => {
      loads.count += 1;
    });
    await page.route(SIGN_UP_CHUNK, (route) => route.abort('failed'));
    await reachErrorScreen(page, loads);
    await page.unroute(SIGN_UP_CHUNK);
    await recoverWithTryAgain(page, loads);
  });
});
