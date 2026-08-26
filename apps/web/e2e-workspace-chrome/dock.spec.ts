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
    // NOT change when armed (`tsld-toolbar-items.tsx:2558-2573`). The subject of the case is
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
     * The bound is generous on purpose — the epic's later milestones reduce the row's content, and
     * a tight bound here would fail on the improvement. What it still forbids is the failure mode
     * that matters: a strip taking a whole band of canvas rather than a line or two of it.
     */
    const withSelection = await canvasHeight(page);
    expect(
      idle - withSelection,
      'a selection may cost the canvas a line or two, never a band',
    ).toBeLessThanOrEqual(120);

    // And it is at the foot rather than over the diagram — the complaint that opened this
    // milestone. Asserted as containment in the row, not as "not over the canvas": a bar can sit
    // outside the canvas box and still be an overlay, and only its host says where it belongs.
    await expect(activitiesRow(page).getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
  });
});
