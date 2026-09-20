import { expect, test, type Page } from '@playwright/test';

import {
  canvas,
  createHierarchy,
  diagramList,
  ensurePen,
  newPlan,
  onboard,
  openViewMenu,
  placements,
  recalculate,
  requirePlacement,
  seedActivities,
  setLevelResources,
} from './support';

/**
 * **The two placement overlays, driven against a real product** (one-planning-surface M-E, ADR-0081).
 *
 * M-E ships two marks and a vocabulary: the **feasible window** that replaced the float and drift
 * tails, and the **levelled-placement** lens. Its unit suites are thorough about the geometry, the
 * clause composition and the three lens states — and there are exactly three things they
 * structurally cannot say, which are the three this file exists for.
 *
 * 1. **That the lens has an entry point at all.** ADR-0081 was written after a milestone shipped a
 *    whole capability with no route to it, its unit tests validating dead code. A registry record
 *    is not a control until something renders it.
 * 2. **That a shaded control carries its reason.** Only a browser resolves `aria-describedby`; a
 *    unit test asserting the string exists proves nothing about whether a planner ever hears it.
 * 3. **That the undrawn state reaches the screen.** FC-1 predicts the levelled lens draws nothing
 *    on nearly every plan on the day it ships, so the sentence explaining that is not a corner —
 *    it is what the feature says to almost everybody, and it is composed across a hook, a summary
 *    and a portal that no single unit test crosses.
 *
 * **It also carries M-D's cover**, which M-D itself could not: that decision did not ship dark, and
 * its `visualConflictReason` is only observable end to end through what the product does with it.
 *
 * Serial. It was also the only config in the repository driving Visual mode; the mode is gone
 * (one-planning-surface M-F), and every plan is a planning surface.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();

/** The lens control, wherever `View ▾` puts it. Native checkbox in a label, so `checkbox`. */
const levelledToggle = (page: Page) => page.getByRole('checkbox', { name: 'Levelled placement' });

const windowToggle = (page: Page) => page.getByRole('checkbox', { name: 'Feasible window' });

test.describe('the feasible window and the levelled lens', () => {
  test('both overlays are reachable from View, and the window brackets an unmoved bar', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Overlays');
    await ensurePen(page);

    const [dig] = await seedActivities(page, orgSlug, [{ name: 'Dig trench', laneIndex: 0 }]);
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // **The entry point, which is the whole of ADR-0081's requirement.** Both controls are in
    // `View ▾ ▸ Insight overlays`; a registry record that nothing renders is not a control.
    await openViewMenu(page);
    await expect(windowToggle(page)).toBeVisible();
    await expect(levelledToggle(page)).toBeVisible();

    /**
     * **Both overlays ship OFF, and the first run of this case is how that got checked.**
     *
     * It was written asserting the window ON — reasoning that it replaced the float and drift
     * tails, so it inherits their default — and went red. Reading `DEFAULT_VIEW_TOGGLES` settles
     * it: `floatTails` is **absent** from that record and optional in the type, so it has always
     * been off, and the window inherited exactly that. The epic's headline mark is opt-in, which
     * is a real fact about what a planner sees on the day it ships and is recorded rather than
     * quietly accommodated (`m-e/window.md` §11).
     *
     * Asserted rather than skipped: a default that flipped later would make every case below
     * vacuous in the quiet direction — they would drive a control that was already on.
     */
    await expect(windowToggle(page)).not.toBeChecked();
    await expect(levelledToggle(page)).not.toBeChecked();
    await windowToggle(page).check();
    await expect(windowToggle(page)).toBeChecked();
    await page.keyboard.press('Escape');

    // The bar is unplaced, so `remainingFloat` is `totalFloat` and the window brackets it with no
    // drift. Read from the API rather than the DOM under test: the clause the listbox speaks is
    // derived from these fields, so asserting the DOM against the DOM would prove nothing.
    const row = requirePlacement(await placements(page, orgSlug), 'Dig trench');
    expect(row.visualStart).toBeNull();
    expect(row.visualConflict).toBe(false);

    /**
     * **The spoken twin, and reading it here is what deleted a whole clause.**
     *
     * The case first asserted `float left` on this row and got
     * `Dig trench, …, lane 1, critical (no float)` — a critical bar, so the Tier-1 sentence
     * correctly omits a float count (critical implies none), while the window clause M-E-T5 had
     * added said `no float` immediately after it. Following that thread showed the window's whole
     * half to be redundant: the Tier-1 sentence already states the remaining float, the positive
     * drift and the negative-drift conflict, which are exactly the facts the bracket's caps draw.
     * The clause is now the levelled ghost alone (`m-e/window.md` §11).
     *
     * So this asserts the sentence as it is: `critical`, and **no parenthesised window clause
     * trailing it**. The negative half is the half that matters — it is what would fail if the
     * deleted clause came back.
     */
    const option = diagramList(page).getByRole('option', { name: /Dig trench/ });
    await expect(option).toContainText('critical');
    await expect(option).not.toContainText('no float');
    await expect(option).not.toContainText('of float');
  });

  test('the levelled lens shades WITH ITS REASON when the plan does not level', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Unlevelled');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Pour slab', laneIndex: 0 }]);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // `levelResources` is off by default (ADR-0041's parity gate), so this is the state every plan
    // in the estate is in — asserted rather than assumed, because a default that had flipped would
    // make this case test the opposite of its name.
    await openViewMenu(page);
    const lens = levelledToggle(page);
    await expect(lens).toBeDisabled();

    /**
     * **The reason, resolved the way a screen reader resolves it.**
     *
     * This is the assertion no unit test in M-E can make. The registry's `reason` is a string in an
     * array; whether a planner ever encounters it depends on `aria-describedby` pointing at an
     * element that exists and carries the text, which is a fact about a real accessibility tree.
     * ADR-0082 exists because a shaded control whose reason is unreachable is the same defect as
     * an absent control, one layer down.
     */
    const describedBy = await lens.getAttribute('aria-describedby');
    expect(describedBy, 'a shaded lens must point at its reason').toBeTruthy();
    await expect(page.locator(`#${describedBy ?? ''}`)).toContainText(/levelling/i);

    await page.keyboard.press('Escape');
  });

  test('levelling on, nothing moved: the lens is offered, draws nothing, and SAYS WHICH', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 2);
    await createHierarchy(page);
    await newPlan(page, 'Levelled');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Erect steel', laneIndex: 0 }]);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    await setLevelResources(page, orgSlug, true);
    await page.reload();
    await ensurePen(page);

    /**
     * **The lens is NOT shaded here, and that is the decision M-E-T3 turns on.** Levelling ran; it
     * simply moved nothing, because this plan has no resources. Nothing is wrong, there is no
     * setting to point at, and shading would tell a planner their working overlay is broken. The
     * plausible mistake is the opposite of a missing feature, which is why it needs a test.
     */
    await openViewMenu(page);
    const lens = levelledToggle(page);
    await expect(lens).toBeEnabled();
    await lens.check();
    await page.keyboard.press('Escape');

    // **The undrawn sentence, which FC-1 predicts is the COMMON state on the day this ships.** A
    // control that lights and does nothing is the lit-but-inert dead end; the difference between
    // that and a working feature is this sentence reaching the screen.
    // The visible strip is `aria-hidden`, so it is located as the visible element it is; the
    // spoken copy is the `sr-only` sibling, asserted just below. They were BOTH announced until
    // this case's first run resolved to two elements and said so.
    await expect(
      page.locator('p[aria-hidden]', { hasText: /did not move any activity/i }),
    ).toBeVisible();
    await expect(page.locator('p.sr-only', { hasText: /nothing to show/i })).toHaveCount(1);

    /**
     * **The other empty state's SENTENCE is only transiently reachable, and that is correct rather
     * than a gap.** It was drafted as a second half of this case — turn levelling off, expect the
     * strip to change — and the run showed why it cannot be: the lens is session-local view state
     * (`DEFAULT_LENS_STATE`), so the reload that makes the plan's new setting visible also turns
     * the lens off, and with levelling off the control is shaded and cannot be turned back on.
     *
     * So a planner meets that sentence only in the window between changing the setting and
     * reloading. Which is right: when levelling is off, the **control's own reason** is the
     * message, and the case above asserts that reason resolves. The strip is what covers the
     * transient state, and its two wordings are pinned in `a11y.test.ts` with the mutation that
     * collapses them into one verified red.
     *
     * What IS asserted here is that turning levelling off does not leave the previous sentence on
     * screen — a stale explanation being worse than none.
     */
    await setLevelResources(page, orgSlug, false);
    await page.reload();
    await expect(page.getByText(/did not move any activity/i)).toHaveCount(0);
  });

  test('a placement conflict is flagged, and the bar keeps its position (M-D)', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 3);
    await createHierarchy(page);
    await newPlan(page, 'Conflicted');
    await ensurePen(page);

    const [first, second] = await seedActivities(page, orgSlug, [
      { name: 'Excavate', laneIndex: 0 },
      { name: 'Backfill', laneIndex: 1 },
    ]);
    if (!first || !second) throw new Error('seeding returned too few activities');
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // Place the successor BEFORE its own earliest feasible start by writing `visualStart` directly.
    // The gesture that produces this is a drag, which `placement.spec.ts` already drives; what is
    // under test here is the ENGINE's verdict and what the product does with it, so the input is
    // set exactly rather than approximated by pixels.
    const before = requirePlacement(await placements(page, orgSlug), 'Backfill');
    expect(before.earlyStart).not.toBeNull();

    // **The activity route is org-scoped, not plan-nested** — `/organizations/:org/activities/:id`.
    // The first version of this call nested it under the plan and got a 404 whose message begins
    // "Cannot PATCH", which is the router saying the ROUTE does not exist rather than the resource;
    // read off `use-activities.ts` rather than guessed a second time.
    await page.evaluate(
      async ({ org, activityId, version }) => {
        const response = await fetch(`/api/v1/organizations/${org}/activities/${activityId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visualStart: '2025-12-01', version }),
        });
        if (!response.ok) {
          throw new Error(`placement patch ${String(response.status)}: ${await response.text()}`);
        }
      },
      { org: orgSlug, activityId: second.id, version: before.version },
    );
    await recalculate(page, orgSlug);

    /**
     * **Stay-and-flag** (ADR-0033): a placement earlier than logic is KEPT and flagged, never
     * clamped, so the drift is signed and a planner can see what they asked for. The engine's own
     * verdict is read — `visualConflict` — rather than inferred from two dates, which is the
     * conflation M-D's `visualConflictReason` exists to end.
     */
    const after = requirePlacement(await placements(page, orgSlug), 'Backfill');
    expect(after.visualConflict).toBe(true);
    expect(after.visualStart).not.toBeNull();
    expect(after.visualEffectiveStart).not.toBeNull();

    // The canvas is still there and still interactive — a conflicted placement is a flag, not a
    // refusal. Asserted because a lens epic that quietly broke editing would pass every case above.
    await expect(canvas(page)).toBeVisible();
  });
});
