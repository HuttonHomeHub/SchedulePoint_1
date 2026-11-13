import { type Page } from '@playwright/test';

import { placeRelativeTo } from '../e2e-arrange/support';
import { holdThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';
import { openHealthCheck } from '../e2e-support/toolbar';

import {
  footBase,
  footFigures,
  sentenceShape,
  raiseOfferByLinking,
  raiseOfferForPourSlab,
  selectInList,
  selfHit,
} from './follow-logic-support';
import {
  canvas,
  createHierarchy,
  diagramList,
  findBar,
  newPlan,
  onboard,
  openPlanId,
  recalculate,
  seedActivities,
} from './support';

/**
 * **The dock costs the canvas nothing** (workspace-chrome M3).
 *
 * The transient strips a planner meets while working — the armed-tool statement, the selection
 * actions, the plural bar, the conflict banner, the empty-plan notice — were reserved chrome ABOVE
 * the scene. ADR-0064 put them there on a rule that still holds (nothing overlays the diagram) and
 * priced only the alternative it rejected; what it did not price is that chrome above the scene
 * pushes the scene down. The product owner reported both halves: "the helper text in blue which
 * tells a user what to do is taking up canvas space", and separately that the selection bar
 * "obscures some other activities and view".
 *
 * The claim this milestone makes is arithmetic, so it is asserted as arithmetic: **the canvas is
 * exactly as tall with a tool armed and an activity selected as it is with neither.** No unit test
 * can make that claim — jsdom has no layout, so every `<TsldPanel>` suite in the repository would
 * report the same zero height for a strip that is pushing the scene down by 40 px in a browser.
 *
 * Verified red before it was kept: with the strips left above the scene, the armed measurement is
 * 40 px short of the idle one and the second assertion fails on the row the statement lands in.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 500;

/** The scene canvas's rendered height, from the browser rather than from a constant. */
async function canvasHeight(page: Page): Promise<number> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return Math.round(box.height);
}

/** The activities row at the foot of the workspace — the dock's host. */
/**
 * The collapsed activities bar — **the `CanvasDockOutlet`'s host** (ADR-0092), which is why this
 * journey needs it.
 *
 * Located by `data-activities-bar`, not by the word "Activities". The copy locator resolved to two
 * elements the moment Graphite M7 put an activity **count** in the status bar, and it would have
 * broken again on any wording change — the standing rule after three journeys broke on one.
 */
function activitiesRow(page: Page) {
  return page.locator('[data-activities-bar]');
}

test.describe('The canvas dock', () => {
  test('an armed tool and a selection cost the canvas no height, and land at the foot', async ({
    page,
  }) => {
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Dock');
    await holdThePen(page);

    const [dig] = await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0 },
      { name: 'Steel frame', laneIndex: 1 },
    ]);
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await holdThePen(page);
    await expect(canvas(page)).toBeVisible();

    const idle = await canvasHeight(page);
    expect(idle, 'the canvas should have real height to compare against').toBeGreaterThan(200);

    // ── An armed tool. ────────────────────────────────────────────────────────────────────────
    // Its statement is the strip the product owner named. Arming it is the whole gesture: no
    // second click, so nothing else about the layout has changed between the two measurements.
    //
    // **This drove the LINK tool and asserted its statement until 2026-08-26.** That statement is
    // now withdrawn (`docs/specs/foot-row/spec.md` D3) because `LinkControl` swaps its own label to
    // `Linking · FS` and restates it — so the assertion was amended rather than deleted, and it
    // drives `Select` instead, whose statement is KEPT precisely because its trigger's label does
    // NOT change when armed (the `marquee-select` registration in `tsld-toolbar-items.tsx`). The
    // subject of the case is
    // unchanged: a docked strip costs the canvas no height.
    await page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Select', exact: true })
      .click();

    const statement = page.getByText(/^Select · drag across bars/).first();
    await expect(statement, 'the armed tool should say what the next click does').toBeVisible();
    await expect(
      activitiesRow(page),
      'the statement belongs in the row the workspace already pays for',
    ).toContainText(/Select · drag across bars/);
    expect(await canvasHeight(page), 'arming a tool must not shorten the canvas').toBe(idle);

    // **And the withdrawn half, pinned in the same breath.** Arming Link must now state nothing in
    // the dock — without this the amendment above would pass equally against a build that had
    // simply stopped docking statements at all.
    await canvas(page).press('Escape');
    await page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Link', exact: true })
      .click();
    await expect(
      page
        .getByRole('toolbar', { name: 'Plan commands' })
        .getByRole('button', { name: /^Linking/ }),
    ).toBeVisible();
    await expect(activitiesRow(page)).not.toContainText(/click the predecessor/i);
    expect(await canvasHeight(page), 'an armed Link must not shorten the canvas either').toBe(idle);

    // ── A selection. ──────────────────────────────────────────────────────────────────────────
    await canvas(page).press('Escape');
    await canvas(page).press('Escape');
    await findBar(page, dig.id);
    await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();

    /**
     * **This was an equality and is now a bound, and that is a deliberate regression rather than a
     * gate relaxed to get green.**
     *
     * ADR-0092's rule is that a docked strip costs the canvas 0 px, and it held because the
     * selection bar could not wrap — its wrapper was `shrink-0`, so the row stayed 36 px tall and
     * the surplus was CLIPPED, putting `Clear visual placement` (as it was then labelled)
     * off-screen at 1920 and `Edit`,
     * `Duplicate` and `Delete` with it at 1646 (`docs/specs/foot-row/m0-measurement.md`). The
     * equality was, in other words, being paid for by hiding controls.
     *
     * With the row wrapping (M1) nothing is hidden and the row grows instead: measured 41 → 117 px
     * at this viewport with a selection. A row that is too tall is a trade; a row that hides a
     * command is not.
     *
     * **The bound was `<= 120` and that is now an equality, because the loose one could not tell the
     * fixed state from the broken one.** The pre-epic worst case at this viewport was **117 px** —
     * inside the bound — so the only CI-runnable assertion about the defect the foot-row-and-deck
     * epic exists to close passed just as happily before the fix as after it. ADR-0110 D5's rule is
     * that a gate is finished when the defect it names can make it fail, and this one could not.
     * Raised by the architecture review; the epic quotes that ADR in three places.
     *
     * The loose bound was written on the reasoning that "the epic's later milestones reduce the
     * row's content, and a tight bound would fail on the improvement". They did reduce it — to
     * **zero**: `m1-result` and `m3m4-result` both measure the foot row at 41 px in BOTH states at
     * 1920, 1646 and 1440, so a selection now costs the canvas nothing at all. ADR-0092's original
     * guarantee is restored rather than merely approached, and it is asserted as one.
     *
     * If a future milestone genuinely needs to spend canvas on a selection, this number is the
     * conversation — which is what an equality is for and what `<= 120` quietly prevented.
     */
    const withSelection = await canvasHeight(page);
    expect(
      idle - withSelection,
      'a selection costs the canvas nothing — ADR-0092’s guarantee, restored by ADR-0115',
    ).toBe(0);

    // And it is at the foot rather than over the diagram — the complaint that opened this
    // milestone. Asserted as containment in the row, not as "not over the canvas": a bar can sit
    // outside the canvas box and still be an overlay, and only its host says where it belongs.
    await expect(activitiesRow(page).getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
  });

  /**
   * **The armed Select tool's sentence is one line at the 1024 px floor** (follow-logic follow-ups
   * M2, `docs/specs/follow-logic-follow-ups/`). The premise — that the old 58-character sentence
   * wraps beside the plan facts — was unmeasured when the spec was written (ADR-0113), so this case
   * is written first and recorded failing on that sentence before the copy changes.
   *
   * The state is fixed because the facts' width varies with it (ADR-0216 D6): a computed plan,
   * nothing selected, facts current. The sentence is found by its tail, not its head, so the same
   * case measures the old copy and the new. It counts line boxes of the sentence's own text node —
   * a `Range` over it — and states no pixel figure.
   */
  test('the armed Select sentence is one line box at 1024 wide, and costs the diagram no height', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const orgSlug = await onboard(page, STAMP + 11);
    await createHierarchy(page);
    await newPlan(page, 'Select hint');
    await holdThePen(page);

    await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0 },
      { name: 'Steel frame', laneIndex: 1 },
    ]);
    await recalculate(page, orgSlug);
    await holdThePen(page);
    await expect(canvas(page)).toBeVisible();

    const idle = await canvasHeight(page);
    await page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    const band = page.getByTestId('canvas-mode-band');
    await expect(band).toBeVisible();

    const lineBoxes = await band.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.includes('Esc to stop')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
      }
      throw new Error('the armed Select band has no sentence ending "Esc to stop"');
    });
    expect(lineBoxes, 'the armed Select sentence should occupy one line box').toBe(1);
    expect(await canvasHeight(page), 'arming Select must not shorten the diagram').toBe(idle);
  });
});

test.describe('a dock message with long names, at the 1024 px floor', () => {
  test('the Linked band keeps its Undo on screen and pressable', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    const orgSlug = await onboard(page, STAMP + 7);
    await createHierarchy(page);
    await newPlan(page, 'Long names');
    await holdThePen(page);

    // Two 46-character names: the sentence is wider than the foot row's outlet. Before the strip
    // could shrink, it kept its content width, spilled 423 px past the outlet and put Undo
    // under the foot row's clip (`docs/specs/placed-bar-follows-link/m0-measurement.md`, M0b).
    const [first, second] = await seedActivities(page, orgSlug, [
      { name: 'Install structural steel to level 3 west wings', laneIndex: 0 },
      { name: 'Fabricate and erect precast stair cores, blk B', laneIndex: 1 },
    ]);
    if (!first || !second) throw new Error('seeding returned fewer than two activities');
    await recalculate(page, orgSlug);
    await holdThePen(page);

    const firstPoint = await findBar(page, first.id);
    const secondPoint = await findBar(page, second.id);
    // Deselect before arming: a bar still selected from the search above takes the next click.
    await canvas(page).press('Escape');
    await canvas(page).press('Escape');
    await canvas(page).click({ position: { x: 20, y: 200 } });
    await page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Link', exact: true })
      .click();
    await canvas(page).click({ position: firstPoint });
    await canvas(page).click({ position: secondPoint });

    const band = page.getByTestId('canvas-mode-band');
    await expect(band).toContainText('Linked “Install structural steel');
    const undo = band.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();

    const fit = await activitiesRow(page).evaluate((foot) => {
      const outlet = foot.querySelector<HTMLElement>('div[class*="not-empty:min-w-"]');
      if (!outlet) throw new Error('the dock outlet is not in the foot row');
      return {
        outletOver: outlet.scrollWidth - outlet.clientWidth,
        footOver: foot.scrollWidth - foot.clientWidth,
      };
    });
    expect(
      fit.outletOver,
      'the band must fit its outlet rather than spill out of it',
    ).toBeLessThanOrEqual(0);
    expect(fit.footOver, 'the foot row must not scroll sideways').toBeLessThanOrEqual(0);

    const hit = await undo.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return top !== null && button.contains(top);
    });
    expect(hit, 'a pointer at Undo’s centre must land on Undo').toBe(true);

    await undo.click();
    // The press worked, asserted at the API rather than from the sentence the press replaces.
    await expect
      .poll(async () =>
        page.evaluate(
          async ({ org, plan }: { org: string; plan: string }) => {
            const response = await fetch(
              `/api/v1/organizations/${org}/plans/${plan}/dependencies`,
              {
                credentials: 'include',
              },
            );
            const body = (await response.json()) as { data: unknown[] };
            return body.data.length;
          },
          { org: orgSlug, plan: openPlanId(page) },
        ),
      )
      .toBe(0);
  });
});

test.describe('below the floor, after Continue anyway', () => {
  test.use({ acknowledgeViewportNotice: true });

  /**
   * **Expanding the activities panel moves neither the facts nor the object actions** (foot-row epic
   * M4).
   *
   * The product owner's original complaint, asserted rather than described. Until 2026-08-26 the
   * facts sat left of the collapsed row and the object actions right of it; expanding moved the
   * actions up into the panel's header and dropped the facts to a full-width strip at the very bottom
   * of the screen. They swapped sides. There is one row now and it is the last band in both states.
   *
   * **Asserted as a position, not as presence.** "The facts are somewhere on screen" is true in both
   * the broken and the fixed arrangement — it was true the whole time the row was juggling. What has
   * to hold is that the row containing them is the same row, in the same place, before and after.
   */
  test('expanding the panel leaves the facts and the actions where they were', async ({ page }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, Date.now() + 7);
    await createHierarchy(page);
    await newPlan(page, 'Foot row');
    await holdThePen(page);
    const [dig] = await seedActivities(page, orgSlug, [{ name: 'Dig', laneIndex: 0 }]);
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await holdThePen(page);

    const row = activitiesRow(page);
    await expect(row).toBeVisible();
    const collapsedBox = await row.boundingBox();
    const factsCollapsed = await page.locator('[data-schedule-state]').boundingBox();

    await page.getByRole('button', { name: 'Expand activities panel' }).click();
    await expect(page.getByRole('button', { name: 'Collapse activities panel' })).toBeVisible();

    // The row still exists, still holds the facts, and still sits at the foot.
    await expect(row).toBeVisible();
    const expandedBox = await row.boundingBox();
    const factsExpanded = await page.locator('[data-schedule-state]').boundingBox();

    expect(
      Math.abs((expandedBox?.y ?? 0) - (collapsedBox?.y ?? 0)),
      'the foot row must not move vertically when the panel opens',
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs((factsExpanded?.x ?? 0) - (factsCollapsed?.x ?? 0)),
      'the facts must not slide sideways when the panel opens',
    ).toBeLessThanOrEqual(2);

    // And exactly one facts region exists — the failure mode where the shell status bar keeps its own
    // copy would satisfy every assertion above while showing the reader two.
    await expect(page.locator('[data-schedule-state]')).toHaveCount(1);

    /**
     * **Below `md` the facts must still exist somewhere, and M4 made them vanish.**
     *
     * That was a separate single-pane layout: it mounted both panes and hid the inactive one with
     * `display: none`, and M4 put `PlanFactsOutlet` in the foot row and gated only its neighbour, so
     * the outlet registered inside the hidden pane, `PlanStatusBar` portalled the facts, the schedule
     * state, the only `Recalculate` control and the pen's `role="status"` region into a node nobody
     * could see, and the shell's `empty:hidden` status row collapsed. The pane is gone (ADR-0181), so
     * that mechanism cannot recur; what this keeps is the claim it protected: at 700 px wide the
     * facts exist exactly once and are on screen, after the panel has been expanded and the
     * window narrowed under it.
     *
     * Nothing could have caught the original: every unit suite runs in jsdom, where `useMediaQuery`
     * defaulted wide and `display: none` means nothing because there is no layout. This stays a
     * journey for the same reason — one `setViewportSize` call.
     *
     * **Verified red** at the time against the ungated outlet: `toBeVisible()` failed, the facts
     * having been portalled into the hidden pane.
     */
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(
      page.locator('[data-schedule-state]'),
      'the plan facts must survive the narrowing',
    ).toBeVisible();
    await expect(page.locator('[data-schedule-state]')).toHaveCount(1);
  });
});

/**
 * **An expanded activities panel cannot crush an open dock** (workspace visual polish, the ux
 * gate's blocking finding, 2026-08-28).
 *
 * The dock-pushes-canvas-only restructure made an open right dock's height BE the canvas row's
 * height — so with the panel clamp reserving only `CANVAS_MIN_HEIGHT` (240), a planner who
 * expanded the activities panel squeezed an open Health/Float-paths/Notes panel down to 240 px: a
 * scrolling review panel in a box shorter than the content it exists to walk, in the pass whose
 * item 8 was about STOPPING other layout state taxing the docks. The clamp now reserves
 * `DOCK_MIN_HEIGHT` (360) while any right dock is open; the cost runs the other way and is stated
 * in that constant's docblock.
 *
 * The floor asserted here is 350, not 360: the reservation is spent on the whole canvas row, and
 * the panel's ~4 px splitter lives inside it — the dock gets the reservation minus the splitter.
 *
 * **Verified red** against the unfloored clamp: the dock measured 236 px at this viewport.
 */
test('an expanded activities panel leaves an open dock a usable height', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1646, height: 900 });
  const orgSlug = await onboard(page, Date.now() + 11);
  await createHierarchy(page);
  await newPlan(page, 'Dock floor');
  await holdThePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Dig', laneIndex: 0 }]);
  await recalculate(page, orgSlug);

  // Persist the panel's HEIGHT at its static maximum, then reload so the clamp meets the worst
  // case the storage can hold — the state a planner reaches by dragging the splitter to the top
  // and coming back tomorrow. The collapsed flag is deliberately NOT seeded: the workspace's
  // collapsed state is session-local `useState(true)` (ADR-0113 — only the height persists), so
  // the expansion is a button press, which is also the honest route.
  await page.evaluate(() =>
    window.localStorage.setItem(
      'schedulepoint-activity-panel',
      JSON.stringify({ size: 720, collapsed: false }),
    ),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Expand activities panel' }).click();
  await expect(page.getByRole('button', { name: 'Collapse activities panel' })).toBeVisible();

  // Open the Health dock — a scrolling review panel, the content the squeeze hurts most.
  await openHealthCheck(page);
  const dock = page
    .locator('[data-surface="panel"]')
    .filter({ has: page.getByRole('heading', { name: 'Health check' }) });
  await expect(dock).toBeVisible();

  const box = await dock.boundingBox();
  if (!box) throw new Error('the health dock has no bounding box');
  expect(
    Math.round(box.height),
    'an expanded activities panel squeezed the open dock below its floor',
  ).toBeGreaterThanOrEqual(350);

  // The pinned positive for the trade's other half: the panel is still open and still real — the
  // floor must be paid by clamping the panel, never by collapsing it.
  await expect(page.getByRole('button', { name: 'Collapse activities panel' })).toBeVisible();
});

/**
 * **The foot row's two new rules, read against the real DOM** (placed-bar-follows-link M2, ADR-0216
 * D8 and D9; `docs/TECH_DEBT.md` #581).
 *
 * M0d measured an INJECTED copy of the offer (a clone of the real `NoticeStrip` with the draft copy
 * put in, and the foot row's group built in the page) at 1,354 readings. This is the same plan, the
 * same viewport and the same selection, with the real component, so a figure that moves is the
 * injection and the product disagreeing, and is reported as such rather than adjusted.
 *
 * **The figures** are `follow-logic-m0d-offer-row.{fine,coarse}.json`, mode `A-double-prime`,
 * variant `edit-one`, view `diagram`: a mouse at 1250 × 800 with the flagged bar selected reads foot
 * 205, strip 50, stage 448, outlet 957; at 1024 × 600 nothing selected 101 / 50 / 352 / 731 and the
 * flagged bar selected 205 / 50 / 248; a finger at 1250 × 800 flagged 229 / 62 / 404 and at 1024 × 600
 * flagged 277 / 62 / 52 (the waived floor, D8), nothing selected 113 / 62 / 216.
 */

/** Whether the foot row's toggle is on the same line as the plan facts (centres within half a line). */
async function toggleOnFactsLine(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const group = document.querySelector<HTMLElement>('[data-activities-bar] > [data-foot-trail]');
    const facts = group?.firstElementChild as HTMLElement | null;
    const toggle = group?.querySelector<HTMLElement>('[data-activities-toggle]');
    if (!group || !facts || !toggle) throw new Error('the foot row has no facts-and-toggle group');
    const f = facts.getBoundingClientRect();
    const t = toggle.getBoundingClientRect();
    return (
      Math.abs(f.top + f.height / 2 - (t.top + t.height / 2)) <= Math.max(f.height, t.height) / 2
    );
  });
}

/** Every button of the strip is pressable where it is, and the foot row does not scroll sideways. */
async function expectOfferPressable(page: Page, label: string): Promise<void> {
  const strip = page.getByTestId('canvas-follow-logic-offer');
  const buttons = strip.getByRole('button');
  expect(await buttons.count(), `${label}: the strip’s two buttons`).toBe(2);
  for (const button of await buttons.all()) {
    expect(
      await selfHit(button),
      `${label}: a pointer at the centre of “${await button.textContent()}”`,
    ).toBe(true);
  }
  const figures = await footFigures(page);
  expect(figures.sideways, `${label}: the foot row must not scroll sideways`).toBe(false);
  expect(await toggleOnFactsLine(page), `${label}: the toggle sits on the facts’ line`).toBe(true);
}

/**
 * **What this journey asserts, and what it deliberately does not** (CI failure on PR #1319).
 *
 * M0d read the injected offer to the pixel (a mouse at 1250 x 800 with the flagged bar selected: foot
 * 205, strip 50, outlet 957, in the container). That is a statement about THAT machine's fonts, and at
 * 1250 the foot row sits on a documented knife edge: the 36 rem floor plus the 375.5 px facts group is
 * 959.5 px against a 957 px row, so 2.5 px of text-width difference puts the strip BESIDE the group
 * (outlet 576, strip 58, foot 213) instead of above it (outlet 957, strip 50, foot 205). The CI runner
 * landed on the other side of the edge in 3 of 3 attempts. **Both arrangements cost the diagram the
 * same** (213 - 58 - 8 = 205 - 50 - 8 = 147, the dock's own height), so this is not a defect a user
 * can hit. The exact figures stay in `m0-measurement.md` and the measuring probe, where they are
 * readings; here the INVARIANTS are asserted, measured against a base read in the same cell on the same
 * runner (`footBase`): the strip costs at most its own height plus the 8 px gap, every button is
 * pressable, nothing scrolls sideways, the toggle sits on the facts' line, and the sentence is whole
 * and in at most two lines.
 */
const STRIP_GAP = 8;
const SLACK = 4;

async function expectStripCostsItsOwnHeight(page: Page, label: string): Promise<void> {
  const figures = await footFigures(page);
  const base = await footBase(page);
  expect(
    figures.foot - base.foot,
    `${label}: the strip costs the foot row at most its own height and gap (foot ${String(figures.foot)}, base ${String(base.foot)}, strip ${String(figures.strip)})`,
  ).toBeLessThanOrEqual(figures.strip + STRIP_GAP + SLACK);
  const sentence = await sentenceShape(page);
  expect(sentence.cut, `${label}: the sentence is never cut`).toBe(false);
  expect(sentence.lines, `${label}: the sentence takes at most two lines`).toBeLessThanOrEqual(2);
}

for (const { pointer, touch } of [
  { pointer: 'mouse', touch: false },
  { pointer: 'finger', touch: true },
] as const) {
  test.describe(`the follow-logic offer in the foot row, ${pointer}`, () => {
    test.use({ hasTouch: touch });

    test(`1250 and 1024 wide: every button pressable, no sideways scroll, the toggle on the facts’ line (${pointer})`, async ({
      page,
    }) => {
      test.setTimeout(420_000);
      const orgSlug = await onboard(page, STAMP + (touch ? 41 : 40));
      await createHierarchy(page);
      await newPlan(page, 'Offer row');
      await holdThePen(page);
      await raiseOfferForPourSlab(page, orgSlug);
      expect(
        await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
        'the pointer this describe says it is',
      ).toBe(touch);

      // ── 1250 × 800, the flagged bar selected: the cell M0c fired on (+40 px, the toggle stranded) ──
      await page.setViewportSize({ width: 1250, height: 800 });
      await selectInList(page, orgSlug, 'Pour slab');
      await expectOfferPressable(page, `${pointer} 1250 × 800, flagged bar selected`);
      await expectStripCostsItsOwnHeight(page, `${pointer} 1250 × 800, flagged bar selected`);

      // ── 1024 × 600, nothing selected, then the flagged bar selected ────────────────────────────
      await page.setViewportSize({ width: 1024, height: 600 });
      await canvas(page).press('Escape');
      await expect(page.getByRole('toolbar', { name: /^Actions for / })).toHaveCount(0);
      await expectOfferPressable(page, `${pointer} 1024 × 600, nothing selected`);
      await expectStripCostsItsOwnHeight(page, `${pointer} 1024 × 600, nothing selected`);
      const none = await footFigures(page);
      expect(
        none.stage,
        'with nothing selected the stage keeps its 120 px floor (D8: never waived)',
      ).toBeGreaterThanOrEqual(120);

      await selectInList(page, orgSlug, 'Pour slab');
      await expectOfferPressable(page, `${pointer} 1024 × 600, flagged bar selected`);
      await expectStripCostsItsOwnHeight(page, `${pointer} 1024 × 600, flagged bar selected`);
      const withStrip = await footFigures(page);
      const base = await footBase(page);

      // ── The floor comes back with the strip: Keep it here, and the stage is whole again ───────────
      await page
        .getByTestId('canvas-follow-logic-offer')
        .getByRole('button', { name: 'Keep it here' })
        .click();
      await expect(page.getByTestId('canvas-follow-logic-offer')).toHaveCount(0);
      const kept = await footFigures(page);
      expect(kept.strip).toBe(0);
      // The dock as it shipped, with the same selection, is the base this cell read with the strip hidden.
      expect(Math.abs(kept.foot - base.foot), 'the kept dock is the base dock').toBeLessThanOrEqual(
        2,
      );
      expect(kept.stage).toBeGreaterThan(withStrip.stage - 1);
      expect(
        kept.stage,
        'the 120 px floor holds again once nothing awaits an answer',
      ).toBeGreaterThanOrEqual(120);
    });
  });
}

test.describe('the facts and the toggle are one item (docs/TECH_DEBT.md #581)', () => {
  /**
   * The shipped dock stranded the panel toggle on a line of its own, with a bar selected, in three
   * states (M0d): the real stale sentence on a mouse at about 1220 to 1260, and the ordinary current
   * facts on a FINGER at about 1210 to 1250. Both are driven here, with no offer at all, because the
   * defect was never the offer's: it was the foot row's three-item line test, and the group removes it.
   * **Verified red** by taking the group out of `PlanActivitiesFootRow`: the toggle reads on its own
   * line (a foot row 80 px taller at 1240 on a mouse, 48 px at 1230 on a finger).
   */
  test('a real stale sentence beside a selection bar, on a mouse at 1240 × 800', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1240, height: 800 });
    const orgSlug = await onboard(page, STAMP + 50);
    await createHierarchy(page);
    await newPlan(page, 'Stale facts');
    await holdThePen(page);
    const [dig] = await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0 },
      { name: 'Steel frame', laneIndex: 1 },
    ]);
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await holdThePen(page);
    // An activity created AFTER the last calculation, then a reload: the plan reads "Edited since it
    // was last calculated" with its Recalculate button, which is the wide state.
    await seedActivities(page, orgSlug, [{ name: 'Late addition', laneIndex: 2 }]);
    await page.reload();
    await holdThePen(page);
    await expect(page.locator('[data-schedule-state="stale"]')).toBeVisible({ timeout: 20_000 });
    await findBar(page, dig.id);
    await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
    expect(await toggleOnFactsLine(page), 'the toggle shares the stale facts’ line').toBe(true);
    expect((await footFigures(page)).sideways).toBe(false);
  });

  test.describe('on a finger', () => {
    test.use({ hasTouch: true });

    test('current facts beside a selection bar at 1230 × 800', async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 1230, height: 800 });
      const orgSlug = await onboard(page, STAMP + 51);
      await createHierarchy(page);
      await newPlan(page, 'Finger facts');
      await holdThePen(page);
      const [dig] = await seedActivities(page, orgSlug, [
        { name: 'Dig footings', laneIndex: 0 },
        { name: 'Steel frame', laneIndex: 1 },
      ]);
      if (!dig) throw new Error('seeding returned no activity');
      await recalculate(page, orgSlug);
      await holdThePen(page);
      expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
      await findBar(page, dig.id);
      await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
      await expect(page.locator('[data-schedule-state="current"]')).toBeVisible();
      expect(await toggleOnFactsLine(page), 'the toggle shares the current facts’ line').toBe(true);
      expect((await footFigures(page)).sideways).toBe(false);
    });
  });
});

test.describe('the follow-logic offer at 200 % text', () => {
  test('every button can be reached by scrolling, and nothing scrolls sideways', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: 1646, height: 1097 });
    const orgSlug = await onboard(page, STAMP + 60);
    await createHierarchy(page);
    await newPlan(page, 'Offer 200');
    await holdThePen(page);
    await raiseOfferForPourSlab(page, orgSlug);

    // Root font size, one of the two routes M0d read: the root font moves every rem floor, which is
    // what the `min(<rem>, 100%)` caps exist for (selection-bar-fit M1). The bar is selected BEFORE
    // the text grows, because at 200 % the stage is too short to walk a list in.
    await page.setViewportSize({ width: 1024, height: 600 });
    await selectInList(page, orgSlug, 'Pour slab');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    for (const selection of ['the flagged bar', 'nothing'] as const) {
      if (selection === 'nothing') {
        // Back to 100 % to clear the selection (the stage is too short to focus at 200 %), then up again.
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '';
        });
        await diagramList(page).focus();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('toolbar', { name: /^Actions for / })).toHaveCount(0);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '32px';
        });
      }
      const strip = page.getByTestId('canvas-follow-logic-offer');
      await expect(strip).toBeVisible();
      for (const button of await strip.getByRole('button').all()) {
        expect(
          await selfHit(button),
          `200 %, ${selection}: “${await button.textContent()}” is reachable after scrolling it into view`,
        ).toBe(true);
      }
      const figures = await footFigures(page);
      expect(figures.sideways, `200 %, ${selection}: no sideways scroll`).toBe(false);
      if (selection === 'nothing') {
        expect(
          figures.stage,
          'with nothing selected the diagram keeps at least the 219 px M0d read',
        ).toBeGreaterThanOrEqual(219);
      }
    }
  });
});

test.describe('the follow-logic offer reflows at 320 CSS px (WCAG 1.4.10)', () => {
  test.use({ acknowledgeViewportNotice: true });

  test('no sideways scroll, and every button of the link-plus-offer is still hit-testable', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const orgSlug = await onboard(page, STAMP + 70);
    await createHierarchy(page);
    await newPlan(page, 'Offer reflow');
    await holdThePen(page);
    await raiseOfferByLinking(page, orgSlug);

    await page.setViewportSize({ width: 320, height: 640 });
    const strip = page.getByTestId('canvas-follow-logic-offer');
    await expect(strip).toBeVisible();
    for (const button of await strip.getByRole('button').all()) {
      expect(
        await selfHit(button),
        `320 px: a pointer at the centre of “${await button.textContent()}” lands on it`,
      ).toBe(true);
    }
    expect(
      (await footFigures(page)).sideways,
      '320 px: the foot row does not scroll sideways',
    ).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      '320 px: the page does not scroll sideways',
    ).toBe(true);
  });
});

/**
 * **The four existing foot messages are read whole** (`docs/TECH_DEBT.md` #580, closed by the own-row
 * treatment M2 landed for the offer): the bare Linked band, the undo-result strip, the layout-resolved
 * notice and the multi-select bar all wrap on a row of their own, so no sentence is cut and no
 * subject name is lost.
 *
 * Each is raised for real with 46-character names, then read at the three conditions the offer's
 * journeys use: 1024 × 600, 200 % text (root font 32 px) and 320 CSS px (WCAG 1.4.10). A strip is
 * "read whole" when its sentence has no clipped overflow and is not cut by an ellipsis, every one of
 * its buttons receives a pointer at its own centre, and neither the foot row nor the page scrolls
 * sideways. Mouse and finger both, because a coarse pointer grows every control (ADR-0183).
 */
const LONG = [
  'Install structural steel to level 3 west wings',
  'Fabricate and erect precast stair cores, blk B',
  'Commission the mechanical plant room, level 4',
  'Waterproof and screed the podium roof terrace',
] as const;

async function expectStripReadWhole(page: Page, testId: string, label: string): Promise<void> {
  const strip = page.getByTestId(testId);
  await expect(strip, `${label}: the strip is on screen`).toBeVisible();
  // Focus inside pauses the undo result's 15 s timer, so a slow sweep cannot lose the strip. Focus,
  // not hover: a hover is a no-op on the touch project, and a strip without buttons has nothing to
  // expire.
  const firstButton = strip.getByRole('button').first();
  if ((await firstButton.count()) > 0) await firstButton.focus();
  const sentence = await strip.evaluate((el) => {
    const p = el.querySelector<HTMLElement>(':scope > p');
    if (!p) throw new Error('the strip has no sentence');
    const box = p.getBoundingClientRect();
    const outer = el.getBoundingClientRect();
    const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
    if (!foot) throw new Error('the foot row is not on screen');
    return {
      clipped: p.scrollWidth > p.clientWidth + 1,
      ellipsis: getComputedStyle(p).textOverflow === 'ellipsis',
      outside: box.right > outer.right + 1 || box.left < outer.left - 1,
      // Under wrap the checks above are near-vacuous: a cut sentence is a strip pushed past the foot
      // row, not a clipped line, so the strip's foot must not fall below the foot row's.
      belowFoot: outer.bottom > foot.getBoundingClientRect().bottom + 1,
    };
  });
  expect(sentence.belowFoot, `${label}: the strip is not clipped below the foot row`).toBe(false);
  expect(sentence.ellipsis, `${label}: the sentence is not ellipsised`).toBe(false);
  expect(sentence.clipped, `${label}: the sentence is not clipped`).toBe(false);
  expect(sentence.outside, `${label}: the sentence stays inside its strip`).toBe(false);
  for (const button of await strip.getByRole('button').all()) {
    expect(
      await selfHit(button),
      `${label}: a pointer at the centre of “${await button.textContent()}” lands on it`,
    ).toBe(true);
    expect(
      await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= window.innerWidth &&
          r.bottom <= window.innerHeight
        );
      }),
      `${label}: “${await button.textContent()}” lies inside the viewport`,
    ).toBe(true);
  }
  expect(
    (await footFigures(page)).sideways,
    `${label}: the foot row does not scroll sideways`,
  ).toBe(false);
}

/**
 * The armed-tool band, read against the foot row as it was with no band (`idleFoot`, taken on this
 * runner just before). It asks for no row of its own and its sentence is never cut; when it does not
 * fit beside the plan facts it may take a second LINE of text (so "Esc to stop" is not lost) and costs
 * the foot row no more than that one line, never a whole strip's row.
 */
async function expectArmedHintCostsNothing(
  page: Page,
  idleFoot: number,
  label: string,
): Promise<void> {
  const band = page.getByTestId('canvas-mode-band');
  await expect(band).toBeVisible();
  expect(await band.getAttribute('data-dock-row'), `${label}: no row of its own`).toBeNull();
  const shape = await band.evaluate((el) => {
    const p = el.querySelector<HTMLElement>(':scope > p');
    if (!p) throw new Error('the band has no sentence');
    const parsed = Number.parseFloat(getComputedStyle(p).lineHeight);
    const lineHeight = Number.isFinite(parsed) ? parsed : 20;
    return {
      cut: getComputedStyle(p).textOverflow === 'ellipsis' || p.scrollWidth > p.clientWidth + 1,
      lineHeight,
      lines: Math.round(p.getBoundingClientRect().height / lineHeight),
    };
  });
  expect(shape.cut, `${label}: the sentence is not truncated`).toBe(false);
  expect(shape.lines, `${label}: the sentence takes at most two lines`).toBeLessThanOrEqual(2);
  const foot = (await footFigures(page)).foot;
  expect(
    foot,
    `${label}: the foot row grows by at most the sentence's extra line (idle ${String(idleFoot)})`,
  ).toBeLessThanOrEqual(idleFoot + (shape.lines - 1) * shape.lineHeight + 4);
}

/** The strip at 1024 × 600, at 200 % text, and at 320 CSS px, leaving the viewport at 1024 × 600. */
async function expectStripAtAllWidths(page: Page, testId: string, name: string): Promise<void> {
  await page.setViewportSize({ width: 1024, height: 600 });
  await expectStripReadWhole(page, testId, `${name}, 1024 × 600`);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await expectStripReadWhole(page, testId, `${name}, 200 % text`);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 320, height: 640 });
  await expectStripReadWhole(page, testId, `${name}, 320 CSS px`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    `${name}, 320 CSS px: the page does not scroll sideways`,
  ).toBe(true);
  await page.setViewportSize({ width: 1024, height: 600 });
}

for (const { pointer, touch } of [
  { pointer: 'mouse', touch: false },
  { pointer: 'finger', touch: true },
] as const) {
  test.describe(`the four existing foot messages are read whole, ${pointer}`, () => {
    test.use({ hasTouch: touch, acknowledgeViewportNotice: true });

    test('the multi-select bar, the Linked band, the undo result and the layout notice', async ({
      page,
    }) => {
      test.setTimeout(540_000);
      await page.setViewportSize({ width: 1024, height: 600 });
      const orgSlug = await onboard(page, STAMP + (touch ? 91 : 90));
      await createHierarchy(page);
      await newPlan(page, 'Row 580');
      await holdThePen(page);
      const seeded = await seedActivities(page, orgSlug, [
        { name: LONG[0], laneIndex: 0 },
        { name: LONG[1], laneIndex: 1 },
        { name: LONG[2], laneIndex: 2, durationDays: 5 },
        { name: LONG[3], laneIndex: 2, durationDays: 5 },
      ]);
      const [first, second] = seeded;
      if (!first || !second) throw new Error('seeding returned too few activities');
      await recalculate(page, orgSlug);
      await holdThePen(page);
      // Far enough after the third that nothing overlaps until the third is lengthened.
      await placeRelativeTo(page, orgSlug, LONG[3], LONG[2], 8);
      await recalculate(page, orgSlug);
      await holdThePen(page);

      // Found before anything resizes the window: a resize moves where the bars are drawn.
      const firstPoint = await findBar(page, first.id);
      const secondPoint = await findBar(page, second.id);

      // The bare Linked band: the Link tool armed, nothing selected.
      await canvas(page).press('Escape');
      await canvas(page).press('Escape');
      // Mid-canvas, clear of its edges: on a finger the panel divider's hit strip is a control-height
      // wide and covers the left edge, so a click at x = 20 never reaches the scene.
      const stage = await canvas(page).boundingBox();
      await canvas(page).click({
        position: { x: (stage?.width ?? 600) / 2, y: (stage?.height ?? 200) - 40 },
      });
      // An armed tool's hint names nothing and stays up the whole time, so it must cost the diagram no
      // line (ADR-0092): the foot row is no taller than with no band, measured here on this runner.
      const idleFoot = (await footFigures(page)).foot;
      const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
      await toolbar.getByRole('button', { name: 'Select', exact: true }).click();
      await expect(page.getByTestId('canvas-mode-band')).toContainText('Select · drag across bars');
      await expectArmedHintCostsNothing(page, idleFoot, `${pointer} Select tool armed`);
      await canvas(page).press('Escape');
      await expect(page.getByTestId('canvas-mode-band')).toHaveCount(0);
      await toolbar.getByRole('button', { name: 'Link', exact: true }).click();
      await canvas(page).click({ position: firstPoint });
      await canvas(page).click({ position: secondPoint });
      await expect(page.getByTestId('canvas-mode-band')).toContainText(
        'Linked “Install structural',
      );
      await expectStripAtAllWidths(page, 'canvas-mode-band', `${pointer} Linked band`);

      // The undo result: disarm, then undo the link from the keyboard.
      await canvas(page).press('Escape');
      await canvas(page).press('Escape');
      await expect(page.getByTestId('canvas-mode-band')).toHaveCount(0);
      await diagramList(page).focus();
      await page.keyboard.press('Control+z');
      await expectStripAtAllWidths(page, 'canvas-history-result', `${pointer} undo result`);
      await page
        .getByTestId('canvas-history-result')
        .getByRole('button', { name: 'Dismiss' })
        .click();
      await expect(page.getByTestId('canvas-history-result')).toHaveCount(0);

      // The multi-select bar: two selected. Its subject sentence is the bar's accessible description
      // now (diagram-keys M7), so what is read whole on screen is the caption and the actions.
      await diagramList(page).focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+ArrowDown');
      const bulk = page.getByTestId('bulk-selection-bar');
      await expect(bulk).toContainText(/^2 selected/);
      await expect(bulk).toHaveAccessibleDescription(/“.{40,}” is the subject of single-activity/);
      await expectStripAtAllWidths(page, 'bulk-selection-bar', `${pointer} multi-select bar`);
      await diagramList(page).focus();
      await page.keyboard.press('Escape');
      await expect(bulk).toHaveCount(0);

      // The layout-resolved notice: lengthen the third into the fourth, one day at a time.
      await selectInList(page, orgSlug, LONG[2]);
      const notice = page.getByTestId('canvas-layout-resolved');
      for (let i = 0; i < 6 && (await notice.count()) === 0; i += 1) {
        await page.keyboard.press('Shift+ArrowRight');
        await page.waitForTimeout(1_500);
      }
      await expect(notice).toContainText(`Moved “${LONG[2]}” to lane`);
      await expectStripAtAllWidths(page, 'canvas-layout-resolved', `${pointer} layout notice`);
    });
  });
}
