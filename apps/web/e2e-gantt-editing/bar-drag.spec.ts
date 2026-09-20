import { expect, test, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttRow,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';
import { recalculate } from '../e2e-support/toolbar';

/**
 * **M3 — a bar moved from the Gantt, checked at the API.**
 *
 * A move writes a **`visualStart`** placement and **no constraint at all**. Which of the two it
 * writes is invisible on screen — the bar lands where it was dropped either way — so a drag that
 * quietly wrote a constraint would be discovered only when somebody asked why a plan had grown
 * forty constraints nobody set. That is what this suite is for, and it is the reason the negative
 * half of the assertion is the load-bearing half.
 *
 * **This docblock described two modes until one-planning-surface M-F-T4b.** ADR-0033 split a plan
 * into EARLY (a move writes a constraint and the network re-flows around it) and VISUAL (a move
 * writes a placement); the epic collapsed the two, so the paragraph naming the contrast, and the
 * `useVisualMode` helper that set up half of it, went with the behaviour they described.
 *
 * The keyboard path is driven too, not just the pointer. A pointer-only capability is a WCAG 2.1.1
 * failure, and ADR-0064's gate pass found four controls silent while their keyboard siblings
 * announced — the two paths are not interchangeable evidence for each other.
 */

interface ActivityRow {
  id: string;
  name: string;
  earlyStart: string | null;
  visualStart: string | null;
  constraintType: string | null;
  constraintDate: string | null;
}

async function readActivities(page: Page, orgSlug: string): Promise<ActivityRow[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        {
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error(`read: ${response.status} ${await response.text()}`);
      const body = (await response.json()) as { data: ActivityRow[] };
      return body.data;
    },
    { org: orgSlug, id: planId },
  );
}

const byName = (rows: ActivityRow[], name: string): ActivityRow => {
  const row = rows.find((r) => r.name === name);
  if (row === undefined) throw new Error(`no activity named ${name}`);
  return row;
};

async function ganttPlan(page: Page, count = 3): Promise<string> {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, count);
  await recalculate(page);
  return orgSlug;
}

/** The bar for a row, located by its activity id rather than by its copy (ADR-0091's rule). */
function barFor(page: Page, activityId: string) {
  return page.locator(`[data-activity-id="${activityId}"] .cursor-ew-resize`);
}

test.describe.configure({ mode: 'serial' });

test('Alt+ArrowRight moves a bar and the move is stored', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await ganttPlan(page);
  await showGantt(page);

  const before = byName(await readActivities(page, orgSlug), 'Seeded 0');
  expect(before.earlyStart).not.toBeNull();

  await ganttRow(page, 'Seeded 0').click();
  await page.keyboard.press('Alt+ArrowRight');

  // Asserted at the API. The bar visibly moving proves the ghost, not the write — and the ghost is
  // the half that cannot be wrong in a way anybody would notice later.
  await expect
    .poll(async () => byName(await readActivities(page, orgSlug), 'Seeded 0').earlyStart, {
      timeout: 20_000,
    })
    .not.toBe(before.earlyStart);
});

/**
 * **One test, where there were two** (one-planning-surface M-F-T4b).
 *
 * This pair asserted the contrast the epic removes: in EARLY a keyboard move wrote a constraint and
 * left `visualStart` null; in VISUAL it wrote a placement and left `constraintType` null. There is
 * one planning surface now, so the EARLY half describes behaviour the product no longer has — and
 * it would not have FAILED, it would have gone on passing against nothing, which is worse.
 *
 * The surviving half is the one that mattered: **and NO constraint**. That is the only end-to-end
 * proof that the collapse did not quietly leave the SNET write in place behind the placement — a
 * plan that grew constraints nobody set looks identical on screen and is found months later.
 * `useVisualMode` is deleted rather than pointed elsewhere; a helper with no caller is how the next
 * reader concludes the mode still exists.
 */
test('a move writes a placement, and NO constraint', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await ganttPlan(page);
  await showGantt(page);

  await ganttRow(page, 'Seeded 0').click();
  await page.keyboard.press('Alt+ArrowRight');

  await expect
    .poll(async () => byName(await readActivities(page, orgSlug), 'Seeded 0').visualStart, {
      timeout: 20_000,
    })
    .not.toBeNull();

  expect(byName(await readActivities(page, orgSlug), 'Seeded 0').constraintType).toBeNull();
});

test('a summary refuses to move', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await ganttPlan(page);
  await showGantt(page);

  const rows = await readActivities(page, orgSlug);
  const before = byName(rows, 'Seeded 0');

  // Make Seeded 0 a summary through the API, then reload so the grid sees the type.
  const planId = openPlanId(page);
  await page.evaluate(
    async ({ org, id, version }: { org: string; id: string; version: number }) => {
      await fetch(`/api/v1/organizations/${org}/activities/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'WBS_SUMMARY', version }),
      });
    },
    { org: orgSlug, id: before.id, version: (before as unknown as { version: number }).version },
  );
  void planId;
  await page.reload();
  await showGantt(page);

  // **The type change really happened.** Without this the test passes for the wrong reason: if the
  // PATCH were rejected the row would still be a TASK, and "the dates did not change" would be
  // reporting a broken nudge rather than a respected rule. The ADR-0093 lesson — an assertion that
  // would pass equally if the capability vanished cannot distinguish the two.
  const asSummary = byName(await readActivities(page, orgSlug), 'Seeded 0');
  expect((asSummary as unknown as { type: string }).type).toBe('WBS_SUMMARY');
  const summaryStart = asSummary.earlyStart;
  await ganttRow(page, 'Seeded 0').click();
  await page.keyboard.press('Alt+ArrowRight');

  // Nothing written — a summary's dates are an engine rollup of its children (ADR-0038). The spoken
  // refusal is asserted by the unit suite; this proves the WRITE did not happen, which is the half
  // only a real server can show.
  await page.waitForTimeout(1_500);
  expect(byName(await readActivities(page, orgSlug), 'Seeded 0').earlyStart).toBe(summaryStart);
});

test('a bar carries a pointer resize handle a planner can actually reach', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await ganttPlan(page);
  await showGantt(page);

  const first = byName(await readActivities(page, orgSlug), 'Seeded 0');
  const handle = barFor(page, first.id);

  // Present and non-zero, which is the property `e2e-toolbar-fit` had to learn to assert: a control
  // shrunk to zero visible width is in the DOM, has no overhang, and is pointer-unreachable.
  await expect(handle).toHaveCount(1);
  const box = await handle.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
});
