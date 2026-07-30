import { expect, test, type Page } from '@playwright/test';

import {
  activityCount,
  armAdd,
  armLink,
  canvas,
  clearSelection,
  doToolbar,
  createHierarchy,
  dependencies,
  disarm,
  drawTask,
  ensurePen,
  mapBars,
  newPlan,
  onboard,
  recalculate,
  requireBarPoint,
  seedActivities,
  selectedActivityId,
} from './support';

/**
 * **T1 — the instrumented reproduction of the link-direction defect** (ADR-0064 F1.1).
 *
 * The reported symptom: clicking _Set out_ then _Reinforce_ with the Link tool armed recorded
 * `Reinforce → Set out`. The gesture reducer maps the **first** click to the predecessor and
 * contains no inversion on any path, so the cause has to be one of:
 *
 * - **(i) a swallowed click** — the first click never became a pick, so a later click armed it and
 *   the one after that committed, shifting the whole sequence by one; or
 * - **(ii) a mid-pick relayout** — the coalesced auto-recalculation (500 ms) fired between the two
 *   clicks, moved the bars, and each click hit the other activity.
 *
 * The two produce different evidence, which is why this file measures rather than asserts. Every
 * click point is **discovered** by probing in `select` mode and reading the canvas's own parallel
 * listbox, so "which bar is at this pixel" is known before the pick and re-checked after it:
 *
 * - 0 dependencies from 2 clicks ⇒ **(i)**: a click was dropped.
 * - 1 dependency, reversed, and the pixel→bar map **changed** ⇒ **(ii)**.
 * - 1 dependency, reversed, and the map **held** ⇒ a third mechanism, and the map proves it.
 *
 * The inter-click delay is swept across the 500 ms debounce boundary because a defect that only
 * appears on one side of it names its own cause.
 */

interface PickOutcome {
  /** The two pixels re-probed after the pick — a changed answer means the scene moved. */
  after: { predecessor: string | null; successor: string | null };
  rows: { predecessorId: string; successorId: string }[];
}

/**
 * Arm Link, click `first` then `second` with `delayMs` between, and report what the API recorded
 * alongside what the canvas says is under each pixel afterwards.
 */
async function pickAcross(
  page: Page,
  orgSlug: string,
  first: { x: number; y: number },
  second: { x: number; y: number },
  delayMs: number,
): Promise<PickOutcome> {
  // Drop any selection first, so the floating selection-actions bar cannot come to rest over a
  // point this pick is about to click (see `clearSelection`).
  await clearSelection(page);
  await armLink(page);
  await canvas(page).click({ position: first });
  if (delayMs > 0) await page.waitForTimeout(delayMs);
  await canvas(page).click({ position: second });

  // Give the write a chance to land before reading. Polling beats sleeping: a fixed wait either
  // flakes or hides a slow path, and "no row yet" is itself one of the three outcomes.
  let rows: { predecessorId: string; successorId: string }[] = [];
  const deadline = Date.now() + 5_000;
  for (;;) {
    rows = (await dependencies(page, orgSlug)).map((r) => ({
      predecessorId: r.predecessorId,
      successorId: r.successorId,
    }));
    if (rows.length > 0 || Date.now() > deadline) break;
    await page.waitForTimeout(200);
  }

  await disarm(page);
  await canvas(page).click({ position: first });
  const afterFirst = await selectedActivityId(page);
  await canvas(page).click({ position: second });
  const afterSecond = await selectedActivityId(page);

  return { after: { predecessor: afterFirst, successor: afterSecond }, rows };
}

test.describe.configure({ mode: 'serial' });

test.describe('A2 — which click becomes the predecessor', () => {
  let orgSlug: string;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    orgSlug = await onboard(page, Date.now());
    await createHierarchy(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  /**
   * Stand up a fresh plan holding exactly two bars, one lane apart, with the schedule computed and
   * the pen held. Returns each bar's id and the canvas point that was **measured** to hit it.
   */
  async function twoBarPlan(
    planName: string,
    firstName: string,
    secondName: string,
  ): Promise<{
    first: { id: string; name: string; point: { x: number; y: number } };
    second: { id: string; name: string; point: { x: number; y: number } };
  }> {
    await newPlan(page, planName);
    await ensurePen(page);
    const [a, b] = await seedActivities(page, orgSlug, [
      { name: firstName, laneIndex: 0 },
      { name: secondName, laneIndex: 1 },
    ]);
    if (!a || !b) throw new Error('seeding returned fewer than two activities');
    await recalculate(page, orgSlug);
    await ensurePen(page);
    const map = await mapBars(page);
    return {
      first: { ...a, point: requireBarPoint(map, a.id, a.name) },
      second: { ...b, point: requireBarPoint(map, b.id, b.name) },
    };
  }

  /** Report the run's evidence whatever the verdict — output that survives only a failure teaches
   * nothing on the run where it passes. */
  function report(label: string, bars: Awaited<ReturnType<typeof twoBarPlan>>, out: PickOutcome) {
    // eslint-disable-next-line no-console
    console.log(
      `[T1 ${label}] clicked ${bars.first.name}@${JSON.stringify(bars.first.point)} then ` +
        `${bars.second.name}@${JSON.stringify(bars.second.point)}; re-probe → ` +
        `${JSON.stringify(out.after)}; rows ${JSON.stringify(out.rows)}`,
    );
  }

  /**
   * The **quiescent** case: the plan is fully recalculated and nothing is in flight, so nothing can
   * move between the two clicks. A wrong direction here excludes mechanism (ii) outright.
   */
  for (const delay of [0, 250, 600, 1500] as const) {
    test(`quiescent plan, ${String(delay)} ms between clicks`, async () => {
      const bars = await twoBarPlan(
        `Quiescent ${String(delay)}`,
        `Set out ${String(delay)}`,
        `Reinforce ${String(delay)}`,
      );
      const out = await pickAcross(page, orgSlug, bars.first.point, bars.second.point, delay);
      report(`quiescent ${String(delay)}ms`, bars, out);

      expect(
        out.rows,
        'two clicks with the Link tool armed create exactly one dependency',
      ).toHaveLength(1);
      expect(out.rows[0]).toEqual({
        predecessorId: bars.first.id,
        successorId: bars.second.id,
      });
      // The scene did not move, so a wrong direction above could not have been a relayout.
      expect(out.after).toEqual({ predecessor: bars.first.id, successor: bars.second.id });
    });
  }

  /**
   * The **unquiescent** case — the one the defect was observed in. A task drawn on the canvas arms
   * the coalesced recalculation; the pick then straddles it. `0 ms` picks entirely inside the
   * debounce window, `900 ms` puts the recalculation between the two clicks.
   */
  for (const delay of [0, 900] as const) {
    test(`recalculation in flight, ${String(delay)} ms between clicks`, async () => {
      const bars = await twoBarPlan(
        `In flight ${String(delay)}`,
        `Excavate ${String(delay)}`,
        `Blind ${String(delay)}`,
      );
      // The structural edit that arms the coalescer. Drawn well below the two bars we are about to
      // pick, so the draw itself cannot land on either of them.
      await drawTask(page, `Disturb ${String(delay)}`, { x: 300, y: 300 });

      const out = await pickAcross(page, orgSlug, bars.first.point, bars.second.point, delay);
      report(`in-flight ${String(delay)}ms`, bars, out);

      expect(
        out.rows,
        'a pick across a live recalculation still creates exactly one dependency',
      ).toHaveLength(1);
      expect(out.rows[0]).toEqual({
        predecessorId: bars.first.id,
        successorId: bars.second.id,
      });
    });
  }

  /**
   * **A1c, at journey level.** This is what actually went wrong in the session that opened the
   * epic: the Link split-button's primary region opened its type menu and armed *nothing*, so a
   * planner who clicked "Link" and then clicked two bars was still in **Add** mode — and got two
   * new activities instead of a dependency. Measured then: 0 dependencies from 6 link attempts.
   *
   * The invariant is therefore stated as a **replacement**, not merely as "Link arms": arming Link
   * while Add is armed must leave Add disarmed, and the next canvas click must pick an endpoint
   * rather than open the create popover. Only a real canvas can tell you which one a click reached.
   */
  test('arming Link replaces Add — the next canvas click picks, it does not create', async () => {
    const bars = await twoBarPlan('Tool replacement', 'Formwork', 'Strike');
    const activitiesBefore = await activityCount(page, orgSlug);

    await armAdd(page, 'Task');
    await armLink(page);
    // The Add control has returned to its idle label: one tool is armed, and it is Link.
    await expect(doToolbar(page).getByRole('button', { name: 'Add', exact: true })).toBeVisible();

    const out = await pickAcross(page, orgSlug, bars.first.point, bars.second.point, 0);
    report('tool replacement', bars, out);

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toEqual({ predecessorId: bars.first.id, successorId: bars.second.id });
    // …and nothing was drawn. Asserting only the dependency would pass on a run that ALSO created
    // two stray activities, which is the shape of the original defect.
    expect(await activityCount(page, orgSlug)).toBe(activitiesBefore);
  });

  /**
   * **The disarm contract, where the geometry is real** (ADR-0064 T3). The component suite
   * (`TsldPanel.disarm.test.tsx`) covers Escape from an armed-but-idle tool; it deliberately does
   * not cover the mid-pick half, because opening a pick means driving the gesture machine through a
   * canvas that jsdom gives no layout — the hit test would answer from a zero-sized rect, and the
   * test would pass or fail on geometry rather than on the rule.
   *
   * The rule: **one** Escape drops an open link pick and leaves the tool armed (a wrong endpoint
   * should not cost you the tool); the **next** disarms it. And Escape after a committed draw
   * disarms Add — the case the spec recorded as broken, which is measured here rather than assumed.
   */
  test('Escape drops an open pick first, then the tool — and disarms Add after a draw', async () => {
    const bars = await twoBarPlan('Disarm', 'Screed', 'Cure');
    const add = doToolbar(page).getByRole('button', { name: /^Add(ing .+)?$/ });
    const link = doToolbar(page).getByRole('button', { name: /^Link(ing .+)?$/ });

    // Add: armed → a committed draw leaves it armed (it is sticky by design) → Escape disarms.
    await armAdd(page, 'Task');
    await drawTask(page, 'Joint', { x: 300, y: 300 });
    await expect(add, 'the Add tool is sticky — a draw does not disarm it').toHaveAccessibleName(
      /^Adding/,
    );
    await canvas(page).press('Escape');
    await expect(add).toHaveAccessibleName('Add');

    // Link: armed → one endpoint picked → Escape keeps the tool → Escape disarms it.
    await armLink(page);
    await canvas(page).click({ position: bars.first.point });
    await canvas(page).press('Escape');
    await expect(link, 'dropping a pick must not also drop the tool').toHaveAccessibleName(
      /^Linking/,
    );
    await canvas(page).press('Escape');
    await expect(link).toHaveAccessibleName('Link');
  });
});
