import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  findBar,
  findBarWide,
  linkActivities,
  placements,
  newPlan,
  onboard,
  placeOnDay,
  recalculate,
  seedActivities,
  useVisualMode,
  zoomOut,
} from './support';

/**
 * **A conflict you can count, and a conflict you can fix** (ADR-0094).
 *
 * The epic's three claims, driven against a real API with the pen enforced and a real engine
 * producing the flag:
 *
 * 1. **One meaning of "conflict".** The Filter menu's "Has conflict" lens and the Next-conflict
 *    cycle read the same `CONFLICT_FLAGS` set. A structural test pins that they are sourced once;
 *    it cannot prove they read an equally fresh activity list, because they are wired through
 *    different hooks. Only a live recalculation shows that, which is this file's half of the proof
 *    and is stated as such in `lenses.conflict-source.structural.test.ts`'s own docblock.
 * 2. **The count is readable without acting.** `next-conflict` sits on the row rather than in the
 *    `⋯`, shaded when there is nothing to review, and the magnitude is legible at rest — to a
 *    sighted planner through the read-out chip, and to an AT user through the button's own
 *    description, because the chip is deliberately `aria-hidden`.
 * 3. **The remedy is on the object.** Landing on a flagged activity offers the fix on the selection
 *    bar — and for a hand-placed conflict that fix is the bar's own `Clear visual placement`, not a
 *    second conflict-flavoured copy of it (ADR-0093's rule applied inside one surface).
 *
 * **Why this suite.** `workspace-chrome` is the only Playwright config in the repository that runs
 * in **Visual mode** (`VITE_SCHEDULING_MODES` on — ADR-0092 records the other fourteen canvas
 * configs pinning it off), and a `visualConflict` cannot exist without it. It is also the config
 * that already owns the dock and the placement rules this journey stands on.
 *
 * Controls are located by `[data-toolbar-item]` rather than by their copy, per ADR-0091's
 * retrospective rule — except where the copy IS the assertion, which is said at each such line.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 3000;

/** The command surface's Row 1, which carries the find group. */
function lookRow(page: Page) {
  return page.getByRole('toolbar', { name: 'Plan commands' });
}

/** The canvas dock's selection bar, whatever activity it currently names. */
function dock(page: Page) {
  return page.getByRole('toolbar', { name: /^Actions for / });
}

test.describe('Conflict review', () => {
  test('counts, finds and fixes a hand-placed conflict — with one meaning of the word', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Conflict review');
    await ensurePen(page);

    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Excavate', laneIndex: 0 },
      { name: 'Pour slab', laneIndex: 1 },
      { name: 'Erect frame', laneIndex: 2 },
    ]);
    const [excavate, pour] = seeded;
    if (!excavate || !pour) throw new Error('seeding returned too few activities');

    // Excavate → Pour slab, so Pour's earliest legal start is three working days in. Without a tie
    // every activity starts at the data date and no drag can land before its own earliest, which
    // would make the conflict unreachable rather than absent.
    await linkActivities(page, orgSlug, excavate.id, pour.id);
    await recalculate(page, orgSlug);
    await ensurePen(page);
    await useVisualMode(page);

    // ── 1 · With nothing wrong, the control is on the row and says so ─────────────────────────
    const nextConflict = lookRow(page).locator('[data-toolbar-item="next-conflict"]');
    await expect(
      nextConflict,
      'the command is on the row rather than in the `⋯` — a shading nobody opens the menu to see ' +
        'is not a shading (ADR-0094 M2)',
    ).toBeVisible();
    await expect(nextConflict).toHaveAttribute('aria-disabled', 'true');
    await expect(
      nextConflict,
      'shaded WITH its reason, never bare — the reason is the whole point of shading it',
    ).toHaveAccessibleDescription('No conflicts to review');

    const status = lookRow(page).locator('[data-toolbar-item="next-conflict-status"]');
    await expect(
      status,
      'nothing to count, so there is no read-out — an empty chip beside a shaded button is noise',
    ).toHaveCount(0);

    // ── 2 · Create one, by placing Pour slab before its logic allows ──────────────────────────
    // Day 0 is the data date; Pour's logic earliest is day 3. `compute.ts:345` flags a placement
    // strictly earlier than the network's earliest, which is exactly this.
    //
    // Two zoom-out steps FIRST. At the default framing for a three-day plan the scale is ~200 px
    // per day, and Pour slab starts at day 3 — a thousand pixels right of the probe columns, so the
    // bar is not merely hard to find but outside the search entirely. Zooming re-frames
    // horizontally and leaves lanes alone, which is why `findBar` still works afterwards.
    // (Learnt by running it: the first version probed at the default framing and reported "no
    // probed canvas point hit …", which reads like a missing bar rather than a mis-aimed probe.)
    await zoomOut(page, 2);

    // `placeOnDay`'s third argument is the bar's **y pixel**, not its lane index — the lane is
    // stable under zoom but its pixel is not something a journey may assume, so it is probed.
    // `findBarWide`, not `findBar`: this bar is a successor, so the network puts it three days in,
    // and `findBar`'s probe columns all sit within 200 px of the left edge. Measured at x 660–820.
    const pourRow = (await findBarWide(page, pour.id)).y;
    await placeOnDay(page, orgSlug, pour, pourRow, 0);

    // **The engine has to have SEEN the placement**, and the drag alone does not guarantee that.
    // `placeOnDay` waits for the version to move and for the drawn position not to precede the
    // dropped one — both of which a stale read satisfies here, because this placement is EARLIER
    // than the bar's computed start. So it can return with `visualStart` persisted, no
    // recalculation yet run, and `visualConflict` still false. Measured: the first version of this
    // case read exactly that state and the failure looked like the toolbar not updating.
    await expect
      .poll(
        async () =>
          (await placements(page, orgSlug)).find((r) => r.name === 'Pour slab')?.visualConflict ??
          null,
        { message: 'the engine never flagged the placement as a conflict', timeout: 25_000 },
      )
      .toBe(true);

    // ── 3 · The count is readable at rest, on both channels ──────────────────────────────────
    await expect
      .poll(async () => await nextConflict.getAttribute('aria-disabled'), {
        message: 'the recalculation never surfaced the conflict to the toolbar',
        timeout: 20_000,
      })
      .not.toBe('true');

    // The copy IS the assertion here: "1 conflict" against "1 conflicts" is the kind of thing that
    // ships and is read every day by the one person it annoys.
    await expect(status).toHaveText(/1 conflict\b/);

    // The chip is `aria-hidden`, so the magnitude has to reach an AT user from the BUTTON. Without
    // this an AT user met an enabled control called "Next conflict" with no idea whether it was
    // worth pressing, while a sighted planner read the number at rest — same requirement, half the
    // audience.
    await expect(
      nextConflict,
      'the count reaches assistive tech through the button, because the visible chip does not',
    ).toHaveAccessibleDescription(/1 conflict in this plan/);
    await expect(
      nextConflict,
      'and it is a DESCRIPTION, not part of the name — a name that is a status is not a command',
    ).toHaveAccessibleName('Next conflict');

    // ── 4 · The filter and the count agree about what a conflict is ──────────────────────────
    // The defect this epic opened on: "Has conflict" matched `visualConflict` alone while the cycle
    // counted the whole set. They agree here by construction now, and this is the live half — the
    // two are wired through different hooks, so only a real recalculation shows them agreeing on
    // one plan.
    // The `data-toolbar-item` marker sits ON the focusable control (`api.itemProps` is spread on
    // exactly one element), so these locators ARE the buttons — reaching for `.getByRole('button')`
    // inside one finds nothing, which times out looking like a missing control.
    const filter = lookRow(page).locator('[data-toolbar-item="filter"]');
    await filter.click();
    // A native checkbox inside the Filter popover's `Show only` fieldset — not a menu item. Checked
    // by reading `tsld-toolbar-items.tsx`'s `FILTER_ATTRS` render rather than assumed from the shape
    // of the neighbouring overflow menus.
    const hasConflict = page.getByRole('checkbox', { name: 'Has conflict' });
    await expect(hasConflict).toBeVisible();
    await hasConflict.click();
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => await status.textContent(), {
        message: 'filtering changed what the toolbar counts',
        timeout: 10_000,
      })
      .toMatch(/1 conflict\b/);

    // Undo the filter so the rest of the journey sees an unfiltered canvas.
    await filter.click();
    await page.getByRole('checkbox', { name: 'Has conflict' }).click();
    await page.keyboard.press('Escape');

    // ── 5 · Pressing it lands on the flagged activity, and the remedy is on the object ───────
    await nextConflict.click();
    await expect(dock(page)).toBeVisible();
    await expect(
      dock(page),
      'the cycle selects the flagged activity, which is what puts its remedy on screen',
    ).toHaveAccessibleName(/Pour slab/);

    // The read-out switches from a magnitude to a position once a planner is walking them.
    await expect(status).toHaveText(/1 of 1/);

    // ── 6 · Exactly ONE control clears the placement, and it is the bar's own ────────────────
    const clearOnBar = dock(page).locator('[data-toolbar-item="clear-visual-placement"]');
    await expect(clearOnBar, 'the remedy for a hand-placed conflict is this item').toBeVisible();
    await expect(
      dock(page).getByRole('button', { name: /Clear visual placement/ }),
      'and there is exactly one of it — the `visualConflict` remedy points AT this item rather ' +
        'than rendering a conflict-flavoured twin beside it (ADR-0094 M4-T2)',
    ).toHaveCount(1);
    await expect(
      lookRow(page).locator('[data-toolbar-item="clear-visual-placement"]'),
      'and the command surface no longer carries it at all (ADR-0094 M4-T1)',
    ).toHaveCount(0);

    // ── 7 · Using it resolves the conflict the toolbar was describing ────────────────────────
    await clearOnBar.click();
    await expect
      .poll(async () => await nextConflict.getAttribute('aria-disabled'), {
        message: 'clearing the placement never cleared the conflict',
        timeout: 20_000,
      })
      .toBe('true');
    await expect(nextConflict).toHaveAccessibleDescription('No conflicts to review');
    await expect(status, 'and the read-out withdraws with the last conflict').toHaveCount(0);
  });

  test('offers a route rather than a one-click fix when the fix is a judgement', async ({
    page,
  }) => {
    // `constraintViolated` and `levelingWindowExceeded` have no honest one-click remedy — which
    // constraint to relax, or by how much, is the planner's call — so the bar offers a ROUTE into
    // the editor where the problem lives. This case proves the route exists and lands on the right
    // tab; which field to change once there is deliberately not this journey's business.
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Conflict routes');
    await ensurePen(page);

    const [beam] = await seedActivities(page, orgSlug, [{ name: 'Steel beam', laneIndex: 0 }]);
    if (!beam) throw new Error('seeding returned no activity');

    // A MANDATORY start pinned a fortnight before the data date. The engine produces and FLAGS the
    // result rather than refusing it (ADR-0035 §7, mandatory-constraints-break-logic), which is
    // what makes this reachable from the product at all.
    const failure = await page.evaluate(
      async ({ org, id, version }: { org: string; id: string; version: number }) => {
        const response = await fetch(`/api/v1/organizations/${org}/activities/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            constraintType: 'MANDATORY_START',
            constraintDate: '2025-12-22',
            version,
          }),
        });
        return response.ok ? null : `${String(response.status)} ${await response.text()}`;
      },
      { org: orgSlug, id: beam.id, version: 1 },
    );
    if (failure !== null) throw new Error(`pinning the constraint failed: ${failure}`);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    await findBar(page, beam.id);
    const remedy = dock(page).locator('[data-toolbar-item="conflict-remedy"]');
    await expect(
      remedy,
      'a constraint conflict is a route, so the bar offers one — an activity a planner has been ' +
        'sent to with nothing on it to press is the dead end this epic exists to remove',
    ).toBeVisible();
    // The copy IS the assertion, twice over: the trailing ellipsis is the convention for "this opens
    // something", and the verb is **Review** rather than Fix — the two routes are structurally
    // identical, so calling one a fix promised a single-click resolution neither can give (the ux
    // gate found the pair disagreeing).
    await expect(remedy).toContainText('Review the constraint…');

    await remedy.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Steel beam');
    await expect(
      dialog.getByRole('tab', { name: 'Scheduling', selected: true }),
      'send someone to fix a constraint and they should arrive where the constraint is — the ' +
        'General tab would be the editor opening, not the route working',
    ).toBeVisible();
  });
});
