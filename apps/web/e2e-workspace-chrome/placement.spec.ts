import { expect, test } from '@playwright/test';

import {
  canvas,
  createHierarchy,
  DATA_DATE,
  ensurePen,
  findBar,
  isoDay,
  newPlan,
  onboard,
  placeOnDay,
  placements,
  recalculate,
  requirePlacement,
  seedActivities,
  useVisualMode,
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
 * **This suite is also the first journey in the repository to run in Visual mode at all.** The other
 * fourteen canvas configs pin `VITE_SCHEDULING_MODES` off, each for a good local reason; the
 * unrecorded consequence was that the one placement rule a planner exercises by dragging a bar had
 * no end-to-end coverage. See `playwright.workspace-chrome.config.ts`.
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
    await useVisualMode(page);

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
    await useVisualMode(page);

    // ADR-0081: a milestone that removes a capability names where it is no longer reachable. The
    // control was a Row 1 toggle, and it was gated on Visual mode + the pen — so this asserts its
    // absence in the one state it used to be live in, which is the only state where "it is gone"
    // is a claim rather than a tautology. A check that only looked at Row 1 would pass if the
    // control had merely demoted into the `⋯`, which is the failure mode this epic's own fit work
    // makes likely, so the overflow is opened first.
    await expect(canvas(page)).toBeVisible();
    for (const trigger of await page.getByRole('button', { name: 'More toolbar actions' }).all()) {
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    }
    await expect(page.getByRole('button', { name: 'Snap to grid' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Snap to grid' })).toHaveCount(0);
    await expect(page.getByRole('menuitemcheckbox', { name: 'Snap to grid' })).toHaveCount(0);
  });
});
