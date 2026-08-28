import { expect, test, type Page } from '@playwright/test';

import {
  canvas,
  createHierarchy,
  ensurePen,
  findBar,
  newPlan,
  onboard,
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
    await ensurePen(page);

    const [dig] = await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0 },
      { name: 'Steel frame', laneIndex: 1 },
    ]);
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await ensurePen(page);
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

    const statement = page.getByText(/^Marquee select/).first();
    await expect(statement, 'the armed tool should say what the next click does').toBeVisible();
    await expect(
      activitiesRow(page),
      'the statement belongs in the row the workspace already pays for',
    ).toContainText(/Marquee select/);
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
});

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
  await ensurePen(page);
  const [dig] = await seedActivities(page, orgSlug, [{ name: 'Dig', laneIndex: 0 }]);
  if (!dig) throw new Error('seeding returned no activity');
  await recalculate(page, orgSlug);
  await ensurePen(page);

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
   * The narrow layout mounts both panes and hides the inactive one with `display: none`, defaulting
   * to the diagram. M4 put `PlanFactsOutlet` in the foot row and gated only its neighbour, so on
   * that layout the outlet registered inside the hidden pane, `PlanStatusBar` portalled the facts,
   * the schedule state, the only `Recalculate` control and the pen's `role="status"` region into a
   * node nobody could see, and the shell's `empty:hidden` status row collapsed. The plan's facts
   * disappeared entirely on the smallest screens while three docblocks said they moved to the shell.
   *
   * Nothing could have caught it: every unit suite runs in jsdom, where `useMediaQuery` defaults
   * wide and `display: none` means nothing because there is no layout. This assertion is the whole
   * reason it is here rather than in a unit test — and it is exactly one `setViewportSize` call.
   *
   * **Verified red** against the ungated outlet: `toBeVisible()` fails, the facts having been
   * portalled into the hidden pane.
   */
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(
    page.locator('[data-schedule-state]'),
    'the plan facts must survive the narrow single-pane layout',
  ).toBeVisible();
  await expect(page.locator('[data-schedule-state]')).toHaveCount(1);
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
  await ensurePen(page);
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
  await page.locator('[data-toolbar-item="analysis"]').click();
  await page.getByRole('menuitem', { name: /Health check/ }).click();
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
