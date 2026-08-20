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
function activitiesRow(page: Page) {
  return page.getByText('Activities', { exact: true }).locator('xpath=..');
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
    await page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Link', exact: true })
      .click();
    await expect(
      page
        .getByRole('toolbar', { name: 'Plan commands' })
        .getByRole('button', { name: /^Linking/ }),
    ).toBeVisible();

    const statement = page.getByText(/predecessor/i).first();
    await expect(statement, 'the armed tool should say what the next click does').toBeVisible();
    await expect(
      activitiesRow(page),
      'the statement belongs in the row the workspace already pays for',
    ).toContainText(/predecessor/i);
    expect(await canvasHeight(page), 'arming a tool must not shorten the canvas').toBe(idle);

    // ── A selection. ──────────────────────────────────────────────────────────────────────────
    await canvas(page).press('Escape');
    await canvas(page).press('Escape');
    await findBar(page, dig.id);
    await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
    expect(await canvasHeight(page), 'selecting an activity must not shorten the canvas').toBe(
      idle,
    );

    // And it is at the foot rather than over the diagram — the complaint that opened this
    // milestone. Asserted as containment in the row, not as "not over the canvas": a bar can sit
    // outside the canvas box and still be an overlay, and only its host says where it belongs.
    await expect(activitiesRow(page).getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
  });
});
