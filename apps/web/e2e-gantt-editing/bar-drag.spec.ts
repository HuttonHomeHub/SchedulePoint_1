import { type Page } from '@playwright/test';

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
  syncClient,
} from '../e2e-gantt/support';
import { expect, test } from '../e2e-support/test';
import { recalculate } from '../e2e-support/toolbar';

import {
  bindMonFriCalendar,
  expectWeekday,
  plusDays,
  rollForward,
  weekdayOf,
  workingDaysInclusive,
} from './calendar-support';

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
  version: number;
  durationDays: number;
  earlyStart: string | null;
  earlyFinish: string | null;
  visualEffectiveFinish: string | null;
  visualStart: string | null;
  visualEffectiveStart: string | null;
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

async function ganttPlan(page: Page, count = 3, monFri = false): Promise<string> {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  // A weekend proves nothing on a plan that does not skip it, so the working-day cases bind a
  // Mon–Fri calendar — asserted, not assumed — before anything is seeded (ADR-0170).
  if (monFri) await bindMonFriCalendar(page, orgSlug);
  await seedActivities(page, orgSlug, count);
  await recalculate(page);
  return orgSlug;
}

/**
 * An edge handle for a row, located by its activity id and its edge rather than by its copy
 * (ADR-0091's rule) or by its cursor class. **The class is not an identity**: this was
 * `.cursor-ew-resize` with a count of one until the start handle made it two (ADR-0170).
 */
function edgeFor(page: Page, activityId: string, edge: 'start' | 'finish') {
  return page.locator(`[data-activity-id="${activityId}"] [data-bar-edge="${edge}"]`);
}

/**
 * Drag a row's edge handle by whole columns, from the handle's measured centre.
 *
 * The scale is read off the bar the plan drew (`columnsCovered` day columns wide) rather than
 * assumed, because it is whatever the zoom preset framed for this viewport; dragging by whole
 * multiples of it from the handle's own centre is what keeps the drop on a column and not a pixel
 * either side of a boundary. Asserted at the API by every caller — a drag that moved the picture
 * proves the preview, not the write.
 */
async function dragEdge(
  page: Page,
  activityId: string,
  edge: 'start' | 'finish',
  columns: number,
  columnsCovered: number,
): Promise<void> {
  const row = page.locator(`[data-activity-id="${activityId}"]`);
  const bar = await row.locator('span[style*="cursor: grab"]').boundingBox();
  const handle = await edgeFor(page, activityId, edge).boundingBox();
  if (bar === null || handle === null) throw new Error('the bar or its handle has no box');
  const pxPerDay = bar.width / columnsCovered;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + columns * pxPerDay, y, { steps: 8 });
  await page.mouse.up();
}

/** Patch an activity through the API with its current version, and fail loudly if it is refused. */
async function patchActivity(
  page: Page,
  orgSlug: string,
  name: string,
  path: '' | '/progress',
  body: Record<string, unknown>,
): Promise<void> {
  const row = byName(await readActivities(page, orgSlug), name);
  const failure = await page.evaluate(
    async ({
      org,
      id,
      version,
      suffix,
      patch,
    }: {
      org: string;
      id: string;
      version: number;
      suffix: string;
      patch: Record<string, unknown>;
    }) => {
      const response = await fetch(`/api/v1/organizations/${org}/activities/${id}${suffix}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...patch, version }),
      });
      return response.ok ? null : `${response.status} ${await response.text()}`;
    },
    { org: orgSlug, id: row.id, version: row.version, suffix: path, patch: body },
  );
  expect(failure, `patching ${name}`).toBeNull();
}

/** Recalculate through the API, then let the open client see what the API-side writes did. */
async function recalculateAndSync(page: Page): Promise<void> {
  const planId = openPlanId(page);
  const org = /\/orgs\/([^/]+)/.exec(page.url())?.[1];
  if (org === undefined) throw new Error(`no org in ${page.url()}`);
  const failure = await page.evaluate(
    async ({ slug, id }: { slug: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${slug}/plans/${id}/schedule/recalculate`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      return response.ok ? null : `${response.status} ${await response.text()}`;
    },
    { slug: org, id: planId },
  );
  expect(failure, 'recalculating').toBeNull();
  await syncClient(page);
}

test.describe.configure({ mode: 'serial' });

test('Alt+ArrowRight moves a bar and the move is stored', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await ganttPlan(page);
  await showGantt(page);

  const before = byName(await readActivities(page, orgSlug), 'Seeded 0');
  expect(before.visualEffectiveStart).not.toBeNull();

  await ganttRow(page, 'Seeded 0').click();
  await page.keyboard.press('Alt+ArrowRight');

  // Asserted at the API. The bar visibly moving proves the ghost, not the write — and the ghost is
  // the half that cannot be wrong in a way anybody would notice later.
  //
  // **It reads `visualEffectiveStart`, and it read `earlyStart` until the collapse**
  // (one-planning-surface M-F-T4b). The old assertion was not a fixture detail: before the collapse
  // a move in Early mode wrote an `SNET`, and a constraint moves the EARLY dates. A move now writes
  // a placement, and a placement deliberately does NOT move `earlyStart` — Pass 1 is the network's
  // own answer and goes on computing it. So this ran green against the product for the right reason
  // and red against it for the right reason too, on the same day; what changed is which column
  // records a planner's move.
  //
  // `visualEffectiveStart` rather than `visualStart` because this case is about the bar MOVING —
  // the engine's output, which is what the diagram and the grid draw. The next case asserts the
  // input, and that the write left no constraint behind.
  await expect
    .poll(
      async () => byName(await readActivities(page, orgSlug), 'Seeded 0').visualEffectiveStart,
      { timeout: 20_000 },
    )
    .not.toBe(before.visualEffectiveStart);

  // And Pass 1 is untouched, which is the claim the epic makes everywhere and asserts almost
  // nowhere end to end: the network's own earliest start is not a planner's placement.
  expect(byName(await readActivities(page, orgSlug), 'Seeded 0').earlyStart).toBe(
    before.earlyStart,
  );
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
  const after = byName(await readActivities(page, orgSlug), 'Seeded 0');
  expect(after.earlyStart).toBe(summaryStart);
  // **And no placement**, which this case did not need until the collapse: a move now writes
  // `visualStart`, and a placement does not move `earlyStart`, so the assertion above would pass
  // against a product that had happily placed a WBS summary. The hole opened the day the write
  // changed column, in a case that goes on looking correct.
  expect(after.visualStart).toBeNull();
});

test('a bar carries pointer resize handles a planner can actually reach', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await ganttPlan(page);
  await showGantt(page);

  const first = byName(await readActivities(page, orgSlug), 'Seeded 0');

  // Present and non-zero, which is the property `e2e-toolbar-fit` had to learn to assert: a control
  // shrunk to zero visible width is in the DOM, has no overhang, and is pointer-unreachable.
  for (const edge of ['start', 'finish'] as const) {
    const handle = edgeFor(page, first.id, edge);
    await expect(handle).toHaveCount(1);
    const box = await handle.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }
});

/**
 * **A finish-edge drag across a weekend lands where it was dropped** (ADR-0170 D2).
 *
 * Counted in calendar days the drag wrote a duration two days too long for a span that crossed a
 * weekend, and the engine — which counts WORKING days into that field — laid the bar out two days
 * past the drop. The assertion is the stored finish equalling the day the pointer released on.
 */
test('a finish-edge drag across a weekend lands the finish where it was dropped', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const orgSlug = await ganttPlan(page, 3, true);
  await showGantt(page);

  const before = byName(await readActivities(page, orgSlug), 'Seeded 0');
  expectWeekday(before.earlyStart, 'the fixture start');
  expect(weekdayOf(before.earlyFinish!), 'the fixture finish is a Friday').toBe(5);
  // Four columns right of a Friday is the Tuesday after: the drag crosses a weekend.
  const target = plusDays(before.earlyFinish!, 4);
  expectWeekday(target, 'the drop day');

  await dragEdge(page, before.id, 'finish', 4, 5);

  await expect
    .poll(async () => byName(await readActivities(page, orgSlug), 'Seeded 0').durationDays, {
      timeout: 20_000,
    })
    .toBe(workingDaysInclusive(before.earlyStart!, target));
  await expect
    .poll(async () => byName(await readActivities(page, orgSlug), 'Seeded 0').earlyFinish, {
      timeout: 20_000,
    })
    .toBe(target);
  // A finish-edge drag writes a duration and no constraint, as it always has.
  expect(byName(await readActivities(page, orgSlug), 'Seeded 0').constraintType).toBeNull();
});

/**
 * **The left handle: the start moves, the finish stays, and one undo puts it back** (ADR-0170 D1).
 *
 * The bar is first placed on a Tuesday so its start can be dragged back across a weekend. The
 * load-bearing assertion is the last one: **`visualEffectiveFinish` is unchanged**, read after the
 * recalculation has moved the start. It is what the gesture promises, and it is exactly what a
 * calendar-day count would have broken.
 */
test('dragging the left handle across a weekend moves the start and holds the finish', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const orgSlug = await ganttPlan(page, 3, true);

  const seeded = byName(await readActivities(page, orgSlug), 'Seeded 0');
  const placedStart = plusDays(seeded.earlyStart!, 8);
  expect(weekdayOf(placedStart), 'the placed start is a Tuesday').toBe(2);
  await patchActivity(page, orgSlug, 'Seeded 0', '', { visualStart: placedStart });
  await recalculateAndSync(page);
  await showGantt(page);

  const before = byName(await readActivities(page, orgSlug), 'Seeded 0');
  expect(before.visualEffectiveStart).toBe(placedStart);
  expectWeekday(before.visualEffectiveFinish, 'the placed finish');
  expect(workingDaysInclusive(placedStart, before.visualEffectiveFinish!)).toBe(5);
  const columnsCovered =
    (Date.parse(before.visualEffectiveFinish!) - Date.parse(placedStart)) / 86_400_000 + 1;
  expect(columnsCovered, 'the bar must cross a weekend').toBeGreaterThan(5);

  // Two columns left of a Tuesday is a Sunday, which rolls FORWARD to the Monday before the bar's
  // own week — a start the engine would have chosen too.
  const dropped = plusDays(placedStart, -2);
  const target = rollForward(dropped);
  expect(dropped, 'the drop must land on a non-working day').not.toBe(target);

  await dragEdge(page, before.id, 'start', -2, columnsCovered);

  await expect
    .poll(async () => byName(await readActivities(page, orgSlug), 'Seeded 0').visualStart, {
      timeout: 20_000,
    })
    .toBe(target);
  await expect
    .poll(
      async () => byName(await readActivities(page, orgSlug), 'Seeded 0').visualEffectiveStart,
      { timeout: 20_000 },
    )
    .toBe(target);
  const after = byName(await readActivities(page, orgSlug), 'Seeded 0');
  expect(
    after.constraintType,
    'a start-edge drag writes a placement, never a constraint',
  ).toBeNull();
  expect(after.durationDays).toBe(workingDaysInclusive(target, before.visualEffectiveFinish!));
  expect(after.visualEffectiveFinish, 'the finish is held').toBe(before.visualEffectiveFinish);

  // One undo puts both the start and the duration back.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => byName(await readActivities(page, orgSlug), 'Seeded 0').visualStart, {
      timeout: 20_000,
    })
    .toBe(placedStart);
  expect(byName(await readActivities(page, orgSlug), 'Seeded 0').durationDays).toBe(
    before.durationDays,
  );
});

/**
 * **No left handle where the start cannot move** — paired with a positive count on an eligible bar
 * in the SAME plan, so a zero cannot pass over a feature that is absent everywhere.
 */
test('a milestone and a started activity carry no left handle; an eligible bar does', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const orgSlug = await ganttPlan(page, 3, true);

  await patchActivity(page, orgSlug, 'Seeded 1', '', { type: 'START_MILESTONE' });
  const seeded = byName(await readActivities(page, orgSlug), 'Seeded 2');
  await patchActivity(page, orgSlug, 'Seeded 2', '/progress', { actualStart: seeded.earlyStart });
  await recalculateAndSync(page);
  await showGantt(page);

  const rows = await readActivities(page, orgSlug);
  const eligible = byName(rows, 'Seeded 0');
  const milestone = byName(rows, 'Seeded 1');
  const started = byName(rows, 'Seeded 2');

  // The fixture really is what the case says it is.
  expect((milestone as unknown as { type: string }).type).toBe('START_MILESTONE');

  await expect(edgeFor(page, eligible.id, 'start')).toHaveCount(1);
  await expect(edgeFor(page, milestone.id, 'start')).toHaveCount(0);
  await expect(edgeFor(page, milestone.id, 'finish')).toHaveCount(0);
  await expect(edgeFor(page, started.id, 'start')).toHaveCount(0);
  // The finish is a duration the engine still uses, so a started activity keeps its right handle.
  await expect(edgeFor(page, started.id, 'finish')).toHaveCount(1);
});
