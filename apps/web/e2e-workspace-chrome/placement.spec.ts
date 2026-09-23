import { expect, test } from '@playwright/test';

import {
  canvas,
  createHierarchy,
  DATA_DATE,
  ensurePen,
  findBar,
  isoDay,
  linkActivities,
  newPlan,
  openPlanId,
  onboard,
  placeOnDay,
  placements,
  recalculate,
  requirePlacement,
  seedActivities,
  zoomOut,
} from './support';

/**
 * **Visual placement — who performs the roll, and in which direction** (workspace-chrome M2).
 *
 * The product owner reported that the `Snap to grid` toggle made no observable difference: "no
 * matter what i redo it pushes to a working day". Reading the engine confirmed it — `compute.ts`
 * wraps every `visualStart` in `rollForwardToWorking` unconditionally — so the toggle was never
 * what did the pushing, and what it *did* change was the tie-break direction, in the wrong
 * direction: it rounded to the NEAREST working day with earlier winning ties, wrote that value, and
 * so moved a Saturday drop to Friday, EARLIER than the planner placed it.
 *
 * Both the toggle and the client-side rounding are gone. What replaces them is a claim about the
 * write path, which is exactly the kind of claim a unit test cannot make: a mocked `fetch` accepts
 * whatever body the client hands it, so "the raw dropped day is what gets persisted" is only
 * checkable against a real server. These cases read the API back.
 *
 * **This suite was the first journey in the repository to run in Visual mode at all**, back when
 * that was a mode: fourteen canvas configs pinned `VITE_SCHEDULING_MODES` off, each for a good
 * local reason, and the unrecorded consequence was that the one placement rule a planner exercises
 * by dragging a bar had no end-to-end coverage. The one-planning-surface epic removed the mode, so
 * every journey now drives a planning surface — and this one keeps the placement assertions,
 * because breadth of coverage is not the same thing as depth of it.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();

test.describe('Visual placement rolls forward, on the server', () => {
  test('a bar dropped on a weekend lands on the FOLLOWING Monday, and the raw day is what is stored', async ({
    page,
  }) => {
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Placement');
    await ensurePen(page);

    const [pour] = await seedActivities(page, orgSlug, [{ name: 'Pour slab', laneIndex: 0 }]);
    if (!pour) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // Unconstrained, so it starts at the data date — Monday 5 January 2026.
    const before = requirePlacement(await placements(page, orgSlug), 'Pour slab');
    expect(isoDay(before.earlyStart)).toBe(DATA_DATE);

    // ── Place it on the Saturday. ─────────────────────────────────────────────────────────────
    // Locate the bar's LANE first, at the default framing, where it sits under the left-hand probe
    // columns. Then two zoom-out steps, so a fortnight of scene fits the canvas: at the default
    // framing for a three-day plan the scale is ~200 px/day, which puts the Saturday this case aims
    // at a thousand pixels off the bar. Zooming re-frames horizontally and leaves the lane alone,
    // so only `x` has to be found again.
    const row = (await findBar(page, pour.id)).y;
    await zoomOut(page, 2);

    // Day 5 from Monday 5 January is Saturday the 10th — the day whose two candidate answers
    // differ: nearest working day is Friday the 9th (the rule this milestone deleted), next is
    // Monday the 12th. A weekday target would pass under either rule.
    await placeOnDay(page, orgSlug, { id: pour.id, name: 'Pour slab' }, row, 5);

    const after = requirePlacement(await placements(page, orgSlug), 'Pour slab');

    // The raw dropped day is what is STORED — the client did not round before writing. This is the
    // half a unit test cannot make: it is a statement about the request body the server received.
    expect(isoDay(after.visualStart)).toBe('2026-01-10');

    // And the SERVER rolled it forward. Monday the 12th, not Friday the 9th: the direction is the
    // whole reason the deleted rule was wrong, and asserting only "it is a working day" would have
    // passed against it.
    await expect
      .poll(
        async () =>
          isoDay(
            requirePlacement(await placements(page, orgSlug), 'Pour slab').visualEffectiveStart,
          ),
        { message: 'the recalculation never landed', timeout: 15_000 },
      )
      .toBe('2026-01-12');
  });

  test('a finish milestone reads the day its predecessor ends, and a nudge stores exactly one day later (#381)', async ({
    page,
  }) => {
    // #381 (ADR-0155): a finish milestone is dated by the day it closes. Before, after a task ending
    // Friday it read the following Monday, so a planner who put it on the task's last day was told
    // it was early. This drives the three halves no unit suite can join: the engine's reading, the
    // status bar's Finish, and the canvas nudge's write — which turns an AXIS day back into a date,
    // one day earlier for a finish milestone. Without that inversion the nudge stores two days on.
    const orgSlug = await onboard(page, STAMP + 2);
    await createHierarchy(page);
    await newPlan(page, 'Milestone');
    await ensurePen(page);

    const [frame] = await seedActivities(page, orgSlug, [
      { name: 'Frame', laneIndex: 0, durationDays: 5 },
    ]);
    if (!frame) throw new Error('seeding returned no activity');
    // Frame runs Mon 5 – Fri 9 Jan; the milestone is placed on Friday, its last day.
    const planId = openPlanId(page);
    const milestoneId = await page.evaluate(
      async ({ org, id }: { org: string; id: string }) => {
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Frame complete',
            type: 'FINISH_MILESTONE',
            durationDays: 0,
            laneIndex: 1,
            visualStart: '2026-01-09',
          }),
        });
        if (!response.ok) throw new Error(`milestone ${String(response.status)}`);
        return ((await response.json()) as { data: { id: string } }).data.id;
      },
      { org: orgSlug, id: planId },
    );
    await linkActivities(page, orgSlug, frame.id, milestoneId);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    const placed = requirePlacement(await placements(page, orgSlug), 'Frame complete');
    expect(isoDay(placed.visualEffectiveStart)).toBe('2026-01-09');
    expect(placed.visualConflict).toBe(false);
    // The old rule made this Monday the 12th: the milestone was the plan's last event.
    await expect(page.getByLabel('Finish: 09 Jan 2026')).toBeVisible();

    // Nudge the diamond one day right from the keyboard.
    // Focus the diagram's listbox (e2e-edit's pattern) and arrow to the milestone.
    const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
    await diagram.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
    const selected = diagram.getByRole('option', { selected: true });
    for (let i = 0; i < 3 && !/Frame complete/.test((await selected.textContent()) ?? ''); i += 1) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(selected).toContainText('Frame complete');
    await page.keyboard.press('Alt+ArrowRight');
    await expect
      .poll(
        async () =>
          isoDay(requirePlacement(await placements(page, orgSlug), 'Frame complete').visualStart),
        { message: 'the nudge never reached the server', timeout: 15_000 },
      )
      .toBe('2026-01-10');
  });

  test('the Snap to grid control is gone from every toolbar, including the overflow', async ({
    page,
  }) => {
    // Its own account and plan: a Playwright `page` fixture is per-test, so this case cannot
    // inherit the one above, and sharing a page through `browser.newPage()` would silently drop the
    // project's 1646 px viewport — the width this whole epic is measured at.
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Absence');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Strip out', laneIndex: 0 }]);
    await recalculate(page, orgSlug);
    await ensurePen(page); // the helper reloads, and a reload drops the pen (ADR-0028)

    // ADR-0081: a milestone that removes a capability names where it is no longer reachable. The
    // control was a Row 1 toggle gated on the mode and the pen — so this asserts its absence in the
    // one state it used to be live in, which is the only state where "it is gone" is a claim rather
    // than a tautology. (That mode is itself gone now; the pen half of the state still holds.)
    //
    // **The overflow-opening loop that used to precede this is deleted with the `⋯` itself**
    // (ADR-0109 D1). It existed because a control could pass an inline check by having merely
    // demoted into the menu; a surface that wraps has nowhere to demote to, so the three role
    // assertions below are now exhaustive rather than a net with a hole the loop had to cover.
    // The two menu roles are KEPT deliberately: they cost nothing, and they are what would catch a
    // future reader reintroducing a menu without reintroducing this loop.
    await expect(canvas(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Snap to grid' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Snap to grid' })).toHaveCount(0);
    await expect(page.getByRole('menuitemcheckbox', { name: 'Snap to grid' })).toHaveCount(0);
  });
});
