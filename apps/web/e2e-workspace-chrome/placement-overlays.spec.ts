import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  bookOnCrane,
  canvas,
  createHierarchy,
  diagramList,
  ensurePen,
  isoDay,
  linkActivities,
  newPlan,
  onboard,
  openViewMenu,
  placements,
  placeViaApi,
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

  test('a lift placed clear of the other on a one-lift crane: the lens draws nothing (#413)', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 4);
    await createHierarchy(page);
    await newPlan(page, 'Placed lifts');
    await ensurePen(page);

    const lifts = await seedActivities(page, orgSlug, [
      { name: 'Lift A', laneIndex: 0 },
      { name: 'Lift B', laneIndex: 1 },
    ]);
    await bookOnCrane(
      page,
      orgSlug,
      lifts.map((lift) => lift.id),
      { capacity: 1, units: 24 },
    );
    // Both lifts want the crane on the data date; B is placed four weeks clear of A, so there is no
    // clash left for levelling to resolve.
    await placeViaApi(page, orgSlug, 'Lift B', '2026-02-02');
    await setLevelResources(page, orgSlug, true);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // The fixture is what it claims: B is drawn at its placement, which is NOT its early date.
    // Without this the case would pass on a plan where nothing had been placed at all.
    const placed = requirePlacement(await placements(page, orgSlug), 'Lift B');
    expect(isoDay(placed.visualEffectiveStart)).toBe('2026-02-02');
    expect(isoDay(placed.earlyStart)).not.toBe('2026-02-02');

    await openViewMenu(page);
    await expect(levelledToggle(page)).toBeEnabled();
    await levelledToggle(page).check();
    await page.keyboard.press('Escape');

    // The lens's own status text, not the canvas: a placed participant levelling did not move is not
    // a ghost. Before #413 the predicate compared with the EARLY start and drew one on Lift B.
    await expect(
      page.locator('p[aria-hidden]', { hasText: /did not move any activity/i }),
    ).toBeVisible();
    await expect(page.locator('p.sr-only', { hasText: /nothing to show/i })).toHaveCount(1);
    await expect(diagramList(page).getByRole('option', { name: /Lift B/ })).not.toContainText(
      'levelled to',
    );
  });

  /**
   * **The strip's "Levelled finish" counts a hand-placed last bar** (`docs/specs/logic-aware-levelling/`
   * M1, C7).
   *
   * `GET …/schedule/summary` used to take `MAX(COALESCE(leveled_finish, early_finish))`, so a bar that
   * holds no capped resource was counted where logic puts it, and a plan whose last bar was dragged
   * late read a "Levelled finish" EARLIER than its own "Finish". The API e2e proves the number; this
   * proves it is the number a planner reads, in the popover the strip lives in.
   */
  test('the strip’s Levelled finish reads the hand-placed last bar, and never before Finish', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 6);
    await createHierarchy(page);
    await newPlan(page, 'Levelled finish');
    await ensurePen(page);

    const [liftA, liftB] = await seedActivities(page, orgSlug, [
      { name: 'Lift A', laneIndex: 0 },
      { name: 'Lift B', laneIndex: 1 },
      { name: 'Late slab', laneIndex: 2 },
    ]);
    if (!liftA || !liftB) throw new Error('seeding returned too few activities');
    // The slab holds no resource, so levelling never touches it; only the lifts share the crane.
    await bookOnCrane(page, orgSlug, [liftA.id, liftB.id], { capacity: 1, units: 24 });
    await placeViaApi(page, orgSlug, 'Late slab', '2026-03-02');
    await setLevelResources(page, orgSlug, true);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // The fixture is what it claims: the slab is drawn at its placement, well after its early date
    // and after both lifts. Without this the case passes on a plan where nothing had been placed.
    const slab = requirePlacement(await placements(page, orgSlug), 'Late slab');
    expect(isoDay(slab.visualEffectiveStart)).toBe('2026-03-02');
    expect(isoDay(slab.earlyStart)).not.toBe('2026-03-02');

    await page.getByRole('button', { name: /Summary/ }).click();
    const summary = page.getByRole('dialog', { name: 'Summary' });
    const statValue = (label: string) =>
      summary
        .locator('dt', { hasText: new RegExp(`^${label}$`) })
        .locator('xpath=following-sibling::dd');
    const finish = statValue('Project finish');
    const levelledFinish = statValue('Levelled finish');
    await expect(levelledFinish).toHaveCount(1);
    // The slab's drawn finish is in March; the lifts' levelled finishes are in January.
    await expect(finish).toContainText('Mar 2026');
    await expect(levelledFinish).toHaveText((await finish.textContent()) ?? '');
    await page.keyboard.press('Escape');
  });

  /**
   * **Apply levelled dates…, driven end to end** (`docs/specs/apply-levelled-dates/` T2.4, ADR-0081).
   *
   * The command is the capability this milestone claims, so the journey is its gate: a unit suite
   * mounts the dialog and the model separately and can say nothing about the seam between the
   * toolbar item, the dialog, the batch write, the recalculation and the undo stack.
   *
   * It runs on two lifts booked on one crane (the fixture the case above uses), so levelling really
   * does delay one of them. **The first assertion is that the lens reports something moved**, so a
   * plan on which levelling moved nothing cannot pass the rest vacuously.
   */
  test('Apply levelled dates…: review the list, confirm as one step, then undo it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP + 5);
    await createHierarchy(page);
    await newPlan(page, 'Apply levelled');
    await ensurePen(page);

    const lifts = await seedActivities(page, orgSlug, [
      { name: 'Lift A', laneIndex: 0 },
      { name: 'Lift B', laneIndex: 1 },
    ]);
    await bookOnCrane(
      page,
      orgSlug,
      lifts.map((lift) => lift.id),
      { capacity: 1, units: 24 },
    );
    await setLevelResources(page, orgSlug, true);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // Nothing is hand-placed to begin with, so every `visualStart` read below is the apply's own.
    const placedCount = async (): Promise<number> =>
      (await placements(page, orgSlug)).filter((row) => row.visualStart !== null).length;
    expect(await placedCount()).toBe(0);

    await openViewMenu(page);
    await expect(levelledToggle(page)).toBeEnabled();
    await levelledToggle(page).check();
    await page.keyboard.press('Escape');

    // **The fixture guard.** The lens speaks its count from the same array that draws the ghosts
    // (`levelledOverlaySummary`), so this is "levelling moved at least one bar" read off the screen.
    const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
    const moved = diagram.getByText(
      /Levelled placement: \d+ activit\w+ moved by resource levelling/i,
    );
    await expect(moved).toHaveCount(1);
    const countIn = async (): Promise<number> =>
      Number(/(\d+) activit/.exec((await moved.textContent()) ?? '')?.[1]);
    const ghosts = await countIn();
    expect(ghosts).toBeGreaterThan(0);

    // ── 1 · Shaded WITH ITS REASON when the pen is not held ───────────────────────────────────
    const command = page.locator('[data-toolbar-item="apply-levelling"]');
    await expect(command).toBeVisible();
    await expect(command).not.toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Stop editing' }).click();
    await expect(command).toHaveAttribute('aria-disabled', 'true');
    // Resolved as a screen reader resolves it: a shaded control whose reason is unreachable is the
    // same defect as an absent one (ADR-0082).
    await expect(command).toHaveAccessibleDescription(/Start editing to apply levelled dates/);
    await ensurePen(page);
    await expect(command).not.toHaveAttribute('aria-disabled', 'true');

    // ── 2 · The dialog lists every move before anything is written ────────────────────────────
    await command.click();
    const dialog = page.getByRole('dialog', { name: 'Apply levelled dates' });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: /^Apply to \d+ activit/ });
    await expect(confirm).toBeVisible();
    // Not refused while the preview is still being re-read.
    await expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
    const planned = Number(/Apply to (\d+)/.exec((await confirm.textContent()) ?? '')?.[1]);
    expect(planned, 'the preview lists exactly what the lens draws').toBe(ghosts);
    expect(planned, 'one crane, two lifts: exactly one waits').toBe(1);
    const list = dialog.getByRole('table', { name: 'Activities that will move' });
    await expect(list.getByRole('row')).toHaveCount(planned + 1);
    // The preview writes nothing.
    expect(await placedCount()).toBe(0);

    // axe on the OPEN dialog, which the unit suite's scan cannot do in a real top layer.
    const scan = await new AxeBuilder({ page })
      .include('dialog[open]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(scan.violations).toEqual([]);

    // ── 3 · Confirm: one write, the bars land, the lens reports nothing moved ─────────────────
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(placedCount, { timeout: 15_000, intervals: [250, 500, 1_000, 2_000] })
      .toBe(planned);
    // The spoken sentence is the lens's only accessible account of itself (the visible strip is
    // aria-hidden), and it is unique to the "nothing to show" state.
    await expect(
      diagram.getByText(/Levelled placement: nothing to show — resource levelling did not move/i),
    ).toHaveCount(1, { timeout: 30_000 });
    // **Where the lift lands, not just that a bar was written.** Both lifts want the crane from the
    // data date (Mon 2026-01-05), each for three days, and the crane holds one. The winner runs
    // Mon-Wed, so the crane frees at the end of Wednesday and the other lift's first possible
    // start is Thursday 2026-01-08 — a day boundary on a Mon-Fri or a 24/7 calendar alike, so there
    // is no part-day rounding to reason about here (that case is the unit and API suites').
    // Exactly one lift moves; the winner keeps its early date and carries no placement.
    const applied = await placements(page, orgSlug);
    const landed = applied.filter((row) => row.visualStart !== null);
    expect(landed.map((row) => isoDay(row.visualStart))).toEqual(['2026-01-08']);
    expect(
      applied.filter((row) => row.visualStart === null).map((row) => isoDay(row.earlyStart)),
    ).toEqual(['2026-01-05']);
    // Nothing left to apply, and the command says so rather than opening an empty dialog.
    await expect(command).toHaveAttribute('aria-disabled', 'true');
    await expect(command).toHaveAccessibleDescription('Levelling hasn’t moved any bars');

    // ── 4 · ONE undo step returns every bar, and the ghosts come back ─────────────────────────
    const undo = page.getByRole('button', { name: /^Undo\b/ });
    await expect(undo).toHaveAccessibleName(/apply levelled dates/i);
    await undo.click();
    await expect
      .poll(placedCount, { timeout: 15_000, intervals: [250, 500, 1_000, 2_000] })
      .toBe(0);
    await expect(moved).toHaveCount(1, { timeout: 30_000 });
    expect(await countIn()).toBe(ghosts);
  });

  /**
   * **Levelling follows the links** (`docs/specs/logic-aware-levelling/` M2).
   *
   * A delay now pushes the work behind it, so a bar with no resource at all can carry a ghost, and the
   * apply must not turn that knock-on into a hand placement. Three things only a browser can say: that
   * the follower's ghost reaches the screen, that the strip's "Levelled finish" is the follower's
   * rather than the lift's, and that **Apply levelled dates…** lists the lift and not the slab behind it.
   *
   * Two lifts share one crane; "Pour slab" holds nothing and follows both of them. Which lift waits is
   * the engine's call (a tie), so the slab is linked behind both and the assertions are relations, not
   * dates: the calendar is the plan's own, and the days differ between a Mon-Fri and a 24/7 plan.
   */
  test('a follower of a levelled lift is ghosted after it, counted in the finish, and not applied', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP + 7);
    await createHierarchy(page);
    await newPlan(page, 'Follower levelled');
    await ensurePen(page);

    const [liftA, liftB, slab] = await seedActivities(page, orgSlug, [
      { name: 'Lift A', laneIndex: 0 },
      { name: 'Lift B', laneIndex: 1 },
      { name: 'Pour slab', laneIndex: 2, durationDays: 2 },
    ]);
    if (!liftA || !liftB || !slab) throw new Error('seeding returned too few activities');
    await bookOnCrane(page, orgSlug, [liftA.id, liftB.id], { capacity: 1, units: 24 });
    await linkActivities(page, orgSlug, liftA.id, slab.id);
    await linkActivities(page, orgSlug, liftB.id, slab.id);
    await setLevelResources(page, orgSlug, true);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // ── The fixture guard, read from the API so a plan where nothing moved cannot pass vacuously ──
    const before = await placements(page, orgSlug);
    const slabBefore = requirePlacement(before, 'Pour slab');
    const lifts = ['Lift A', 'Lift B'].map((name) => requirePlacement(before, name));
    const waiting = lifts.filter((lift) => (lift.levelingDelayDays ?? 0) > 0);
    expect(waiting, 'one crane, two lifts: exactly one waits').toHaveLength(1);
    // The slab holds no resource, yet it carries a ghost, later than where it is drawn, after the lift.
    expect(slabBefore.leveledStart).not.toBeNull();
    expect(isoDay(slabBefore.leveledStart)! > isoDay(slabBefore.earlyStart)!).toBe(true);
    expect(isoDay(slabBefore.leveledStart)! >= isoDay(waiting[0]!.leveledFinish)!).toBe(true);
    const movedByApi = before.filter((row) => (row.levelingDelayDays ?? 0) > 0).length;
    expect(movedByApi, 'the waiting lift and the slab behind it').toBe(2);

    // ── 1 · The lens draws the follower's ghost: it counts both moved bars ────────────────────
    await openViewMenu(page);
    await levelledToggle(page).check();
    await page.keyboard.press('Escape');
    const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
    const moved = diagram.getByText(
      /Levelled placement: \d+ activit\w+ moved by resource levelling/i,
    );
    await expect(moved).toHaveCount(1);
    expect(Number(/(\d+) activit/.exec((await moved.textContent()) ?? '')?.[1])).toBe(movedByApi);

    // ── 2 · The strip's Levelled finish is the slab's levelled finish, not the lift's ─────────────
    await page.getByRole('button', { name: /Summary/ }).click();
    const summary = page.getByRole('dialog', { name: 'Summary' });
    const levelledFinish = summary
      .locator('dt', { hasText: /^Levelled finish$/ })
      .locator('xpath=following-sibling::dd');
    await expect(levelledFinish).toHaveCount(1);
    const slabFinish = new Date(`${isoDay(slabBefore.leveledFinish)!}T00:00:00Z`);
    const month = slabFinish.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
    const day = String(slabFinish.getUTCDate());
    await expect(levelledFinish).toContainText(
      new RegExp(`\\b${day}\\b.*${month}|${month}.*\\b${day}\\b`),
    );
    // …and it says what "levelled" now means: a move can be a knock-on, not only a resource.
    await expect(
      summary.getByText(
        /Levelling moved \d+ activit\w+, either to keep resource demand within capacity or because the work before (it|them) moved/,
      ),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // ── 3 · Apply levelled dates… lists the lift, and not the slab that follows it ────────────────
    const command = page.locator('[data-toolbar-item="apply-levelling"]');
    await command.click();
    const dialog = page.getByRole('dialog', { name: 'Apply levelled dates' });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: /^Apply to \d+ activit/ });
    await expect(confirm).toBeVisible();
    expect(Number(/Apply to (\d+)/.exec((await confirm.textContent()) ?? '')?.[1])).toBe(1);
    const list = dialog.getByRole('table', { name: 'Activities that will move' });
    await expect(list.getByRole('row')).toHaveCount(2);
    await expect(list.getByRole('row', { name: /Pour slab/ })).toHaveCount(0);
    // The slab is named in a list of its own, a real list with a name, and the sentence says why.
    const follows = dialog.getByRole('list', { name: 'Will follow the bars before them' });
    await expect(follows.getByRole('listitem')).toHaveText(['Pour slab']);
    await expect(
      dialog.getByText(
        '1 more activity will follow the bars before it, with nothing written for it.',
      ),
    ).toBeVisible();

    // ── 4 · Confirm: the slab is not pinned, and it lands where its ghost was ─────────────────────
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(
        async () => (await placements(page, orgSlug)).filter((r) => r.visualStart !== null).length,
        { timeout: 15_000, intervals: [250, 500, 1_000, 2_000] },
      )
      .toBe(1);
    // The placement lands first and the coalesced recalculation follows it (ADR-0064), so the slab's
    // drawn start is polled rather than read once: a single read can fall between the two. A
    // recalculation that never moves the slab still fails here, at the poll's timeout.
    await expect
      .poll(
        async () =>
          isoDay(
            requirePlacement(await placements(page, orgSlug), 'Pour slab').visualEffectiveStart,
          ),
        { timeout: 15_000, intervals: [250, 500, 1_000, 2_000] },
      )
      .toBe(isoDay(slabBefore.leveledStart));
    const after = requirePlacement(await placements(page, orgSlug), 'Pour slab');
    expect(
      after.visualStart,
      'the slab follows its links, with no placement of its own',
    ).toBeNull();
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
