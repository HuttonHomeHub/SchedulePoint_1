import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from './support';

/**
 * **Opening another plan is not an edit** (`docs/TECH_DEBT.md` #451).
 *
 * The product owner's report, 2026-10-05: "If I open a plan it often says 'x edit not calculated'
 * … if I click Recalculate the message disappears, but if I open a different plan and go back to
 * the other plan the message reappears again! This happens on all plans."
 *
 * The cause was that the plan route kept ONE workspace model alive across plans — TanStack Router
 * re-renders a route on a param change rather than remounting it — so the auto-recalculation
 * watcher compared plan B's activities against the snapshot it had taken of plan A, read the
 * difference as an edit, and counted it. Without the pen nothing could recalculate it away, so the
 * sentence stuck; with the pen it fired a recalculation of a plan nobody had touched.
 *
 * Both halves are asserted because they are two symptoms of one defect: the sentence a planner
 * reads, and the write it causes. The switch goes through the Project Explorer, because a
 * `page.goto` reloads the page and remounts everything — which is exactly why no journey had seen
 * this.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 900;

function rail(page: Page) {
  return page.getByRole('navigation', { name: 'Project Explorer' });
}

/**
 * A plan with two activities, calculated, so its status bar starts out `current`. The pen is taken
 * to seed it and, unless `keepPen`, handed back, so the first journey reads a plan nobody can
 * recalculate — the case in which the spurious count used to stick.
 */
async function calculatedPlan(
  page: Page,
  orgSlug: string,
  name: string,
  keepPen = false,
): Promise<void> {
  await newPlan(page, name);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: `${name} one`, laneIndex: 0 },
    { name: `${name} two`, laneIndex: 1 },
  ]);
  await recalculate(page, orgSlug);
  await expect(page.locator('[data-schedule-state]')).toHaveAttribute(
    'data-schedule-state',
    'current',
  );
  if (keepPen) return;
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) await stop.click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
}

/** Open a plan from the Project Explorer — a client-side navigation, not a reload. */
async function switchTo(page: Page, name: string): Promise<void> {
  await rail(page)
    .getByRole('treeitem', { name: new RegExp(name) })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.locator('[data-schedule-state]')).not.toHaveAttribute(
    'data-schedule-state',
    'pending',
  );
}

/**
 * Hold the state for longer than the auto-recalculation debounce (500 ms) plus a round trip, so a
 * spurious count that would be recalculated away with the pen still has time to show itself — and
 * one that is never recalculated (no pen) is read after it has certainly been counted.
 */
async function staysCurrent(page: Page): Promise<void> {
  const bar = page.locator('[data-schedule-state]');
  for (let i = 0; i < 6; i += 1) {
    await expect(bar).toHaveAttribute('data-schedule-state', 'current');
    await expect(page.getByText(/edits? not calculated/)).toHaveCount(0);
    await page.waitForTimeout(250);
  }
}

test.describe('Switching plans', () => {
  test('opening another plan and coming back reports nothing owed, without the pen', async ({
    page,
  }) => {
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await calculatedPlan(page, orgSlug, 'Alpha');
    await calculatedPlan(page, orgSlug, 'Bravo');

    await switchTo(page, 'Alpha');
    await staysCurrent(page);
    await switchTo(page, 'Bravo');
    await staysCurrent(page);
  });

  test('opening another plan with the pen held recalculates nothing', async ({ page }) => {
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await calculatedPlan(page, orgSlug, 'Charlie', true);
    await calculatedPlan(page, orgSlug, 'Delta', true);

    const recalcs: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/schedule/recalculate')) {
        recalcs.push(request.url());
      }
    });

    await switchTo(page, 'Charlie');
    await ensurePen(page);
    await staysCurrent(page);
    await switchTo(page, 'Delta');
    await staysCurrent(page);
    expect(recalcs).toEqual([]);
  });
});

/**
 * **The plan route draws the workspace's frame while the plan read is held**
 * (`docs/specs/loading-skeletons/` M4, TECH_DEBT #234).
 *
 * The read is held by a route the test releases — no timer. What only a browser can say: the page
 * is the full-bleed workspace skeleton and not a small centred box, it speaks exactly one sentence,
 * it shows no spinner, and the workspace replaces it once the plan arrives.
 */
test('opening a plan shows the workspace frame, not a spinner, while its read is held', async ({
  page,
}) => {
  const orgSlug = await onboard(page, STAMP + 2);
  await createHierarchy(page);
  await calculatedPlan(page, orgSlug, 'Echo');
  const url = page.url();
  const planId = /\/plans\/([^/?#]+)/.exec(url)?.[1];
  expect(planId, 'the plan route carries its id').toBeDefined();

  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(new RegExp(`/organizations/[^/]+/plans/${String(planId)}$`), async (route) => {
    await released;
    await route.continue();
  });

  await page.goto(url);
  const loading = page.getByRole('status').filter({ hasText: 'Loading plan…' });
  await expect(loading).toHaveCount(1);
  expect(await page.locator('svg.animate-spin').count(), 'no spinner while the plan loads').toBe(0);
  const skeleton = page.locator('[data-loading-shape]').first();
  const box = await skeleton.boundingBox();
  expect(box?.height ?? 0, 'the skeleton fills the workspace column').toBeGreaterThan(300);

  release();
  await expect(page.getByRole('heading', { name: 'Echo', exact: true })).toBeVisible();
  await expect(loading).toHaveCount(0);
});
