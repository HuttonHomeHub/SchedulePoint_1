import { type BrowserContext, type Page } from '@playwright/test';

import {
  armLink,
  canvas,
  clearSelection,
  createHierarchy,
  dependencies,
  diagramList,
  disarm,
  doToolbar,
  ensurePen,
  mapBars,
  newPlan,
  onboard,
  recalculate,
  requireBarPoint,
  seedActivities,
} from '../e2e-authoring-flow/support';
import { expect, test } from '../e2e-support/test';

/**
 * **The pointer two-click link pick with `VITE_CANVAS_AUTHORING_FLOW` off** (`docs/TECH_DEBT.md`
 * #76, `docs/specs/flag-off-link-pick/`).
 *
 * The pick's echo plumbing is wired unconditionally, so a rollback build still runs it; only the
 * mode band, the recalculation hold and the keyboard Enter link are gated. This is the one place
 * the flag-off pick is driven in a real browser. It does not retest the flag-on behaviours —
 * `e2e-authoring-flow` owns those.
 */
test.describe.configure({ mode: 'serial' });

test.describe('the Link pick with the authoring-flow flag off', () => {
  let orgSlug: string;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    page = await context.newPage();
    orgSlug = await onboard(page, Date.now());
    await createHierarchy(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  const band = (): ReturnType<Page['getByTestId']> => page.getByTestId('canvas-mode-band');

  /** A fresh plan holding two unlinked bars, with the click point that was measured to hit each. */
  async function twoBarPlan(planName: string, firstName: string, secondName: string) {
    await newPlan(page, planName);
    await ensurePen(page);
    const [a, b] = await seedActivities(page, orgSlug, [
      { name: firstName, laneIndex: 0 },
      { name: secondName, laneIndex: 1 },
    ]);
    if (!a || !b) throw new Error('seeding returned fewer than two activities');
    await recalculate(page, orgSlug);
    await ensurePen(page);
    // Probed in select mode, so the map is taken before Link is armed.
    const map = await mapBars(page);
    await clearSelection(page);
    return {
      a: { ...a, point: requireBarPoint(map, a.id, a.name) },
      b: { ...b, point: requireBarPoint(map, b.id, b.name) },
    };
  }

  test('two clicks link the first bar to the second, and no mode band appears', async () => {
    const { a, b } = await twoBarPlan('Flag-off pick', 'Set out', 'Reinforce');

    await armLink(page);
    await canvas(page).click({ position: a.point });
    // Asserted after the pick opens: "no band" before any pick would pass on a build that never
    // rendered one. The flag-on suite asserts the same slot holds the pick sentence.
    await expect(band()).toHaveCount(0);
    await canvas(page).click({ position: b.point });

    await expect.poll(async () => (await dependencies(page, orgSlug)).length).toBe(1);
    const rows = await dependencies(page, orgSlug);
    expect(rows).toHaveLength(1);
    // Direction is read at the API: the first click is the predecessor.
    expect(rows[0]).toMatchObject({ predecessorId: a.id, successorId: b.id });
    await expect(band()).toHaveCount(0);
  });

  test('Enter with Link armed opens the Logic editor and creates no link', async () => {
    await twoBarPlan('Flag-off Enter', 'Formwork', 'Strike');

    await armLink(page);
    const listbox = diagramList(page);
    await listbox.focus();
    await listbox.press('Enter');

    await expect(page.getByRole('dialog').getByRole('tab', { name: 'Logic' })).toBeVisible();
    expect(await dependencies(page, orgSlug)).toHaveLength(0);
    await expect(band()).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await disarm(page);
    await expect(doToolbar(page).getByRole('button', { name: 'Link', exact: true })).toBeVisible();
  });

  test('Escape after the first click drops the pick, so the second click links nothing', async () => {
    const { a, b } = await twoBarPlan('Flag-off Escape', 'Screed', 'Cure');

    await armLink(page);
    await canvas(page).click({ position: a.point });
    await canvas(page).press('Escape');
    // One Escape drops the pick and keeps the tool (ADR-0064 T3).
    await expect(doToolbar(page).getByRole('button', { name: /^Linking/ })).toBeVisible();
    await canvas(page).click({ position: b.point });

    // A negative needs a settle: polling for "still zero" is the nearest thing to waiting for
    // a write that must not happen, so give any would-be write the recalculation window.
    await page.waitForTimeout(1_500);
    expect(await dependencies(page, orgSlug)).toHaveLength(0);
  });
});
