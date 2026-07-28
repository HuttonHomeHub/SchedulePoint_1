import { expect, test, type Page } from '@playwright/test';

import { createClient, createPlan, createProject, ganttGrid, onboard } from './support';

/**
 * **The claim the substrate decision rests on** (ADR-0059 §1), measured in a real browser.
 *
 * ADR-0026 chose Canvas 2D for the TSLD because thousands of items are visible at once at arbitrary
 * 2-D positions. The Gantt declined to inherit that on one premise: *virtualization removes the
 * premise* — the live node count is bounded by the viewport, not by the plan. If that stops being
 * true the ADR is wrong and the view needs re-deciding, so it is asserted rather than believed.
 *
 * It has to live here rather than in a component test: **jsdom has no layout**, so the real
 * virtualizer measures a zero-height scroller and yields nothing, which is why `GanttPanel.test.tsx`
 * stubs it out entirely. A stubbed virtualizer cannot prove that virtualization windows.
 *
 * What this measures is **structure, not milliseconds**. A timing number from a CI container is
 * noise (the ADR-0054 counting-stub precedent, and the reason `TECH_DEBT #59` exists); a node count
 * is exact and means the same thing on every machine. Frame timing on the ADR-0026 hardware
 * envelope — a mid-tier laptop, iPad-class Safari — stays an operator gate (`TECH_DEBT #60`).
 */

/** Large enough that windowing is unambiguous, small enough that seeding stays reliable in CI. */
const LARGE_PLAN = 400;
const SMALL_PLAN = 40;

/**
 * The open plan's id, read from the route. Deliberately NOT "the first plan the list endpoint
 * returns": with two plans in the org that depends on the API's ordering, and would silently seed
 * the wrong one — the kind of green-for-the-wrong-reason this suite exists to avoid.
 */
function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/**
 * Seed activities straight through the API. Authoring 400 bars on the canvas would measure the
 * canvas; the session cookie rides along because the request is issued from the page's own origin.
 */
async function seedActivities(page: Page, orgSlug: string, count: number): Promise<void> {
  const planId = openPlanId(page);

  await page.evaluate(
    async ({ org, id, n }: { org: string; id: string; n: number }) => {
      for (let i = 0; i < n; i += 1) {
        await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: `Activity ${i}`,
            code: `A${String(i).padStart(4, '0')}`,
            durationDays: 5,
          }),
        });
      }
    },
    { org: orgSlug, id: planId, n: count },
  );

  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      await fetch(`/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`, {
        method: 'POST',
        credentials: 'include',
      });
    },
    { org: orgSlug, id: planId },
  );
}

async function liveRowCount(page: Page): Promise<number> {
  await expect(ganttGrid(page)).toBeVisible();
  return ganttGrid(page).getByRole('row').count();
}

test.describe('the Gantt at plan scale', () => {
  test.describe.configure({ timeout: 180_000 });

  test('keeps the live row count bounded by the viewport, not the plan', async ({ page }) => {
    const orgSlug = await onboard(page, Date.now());
    await createClient(page, 'Northgate');
    await createProject(page, 'Riverside');

    await createPlan(page, 'Small');
    await seedActivities(page, orgSlug, SMALL_PLAN);
    await page.reload();
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    const small = await liveRowCount(page);

    // A second, ten-times-larger plan under the same project.
    await page.getByRole('link', { name: 'Riverside' }).click();
    await createPlan(page, 'Large');
    await seedActivities(page, orgSlug, LARGE_PLAN);
    await page.reload();
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    const large = await liveRowCount(page);

    // Both plans hold enough rows to fill the viewport, so both should render the SAME window.
    // Ten times the plan must not mean ten times the DOM — that is the whole argument.
    expect(large).toBe(small);
    expect(large).toBeLessThan(LARGE_PLAN / 2);

    // Accessibility must still describe the WHOLE plan: a screen-reader user hearing "row 12 of 40"
    // for a 400-activity programme is being misinformed about how much work there is.
    await expect(ganttGrid(page)).toHaveAttribute('aria-rowcount', String(LARGE_PLAN + 1));
  });
});
