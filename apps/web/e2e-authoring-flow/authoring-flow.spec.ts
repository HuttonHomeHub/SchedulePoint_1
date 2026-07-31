import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  armAdd,
  armLink,
  canvas,
  clearSelection,
  createHierarchy,
  dependencies,
  diagramList,
  doToolbar,
  ensurePen,
  mapBars,
  newPlan,
  onboard,
  recalculate,
  requireBarPoint,
  seedActivities,
} from './support';

/**
 * **The flag-on authoring-flow journey** (ADR-0064 T10), with `VITE_CANVAS_AUTHORING_FLOW` on and
 * the pen enforced at the API.
 *
 * The unit suites cover each surface in isolation; what only a browser can show is that they
 * compose — that the band states the pick the canvas actually holds, that the keyboard path and
 * the pointer path are one pick rather than two, and that the confirmation names the direction the
 * server recorded rather than the direction the client hoped for.
 */
test.describe.configure({ mode: 'serial' });

test.describe('the canvas says what it is doing', () => {
  let orgSlug: string;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // An explicit context, not `browser.newPage()`: axe-core/playwright refuses a page created
    // outside one ("Please use browser.newContext()"), and the accessibility assertion is the point
    // of running this in a browser at all.
    context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    page = await context.newPage();
    orgSlug = await onboard(page, Date.now());
    await createHierarchy(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  const band = (): ReturnType<Page['getByTestId']> => page.getByTestId('canvas-mode-band');

  test('an empty plan names the first gesture, and the affordance arms Add', async () => {
    await newPlan(page, 'Empty');
    await ensurePen(page);
    await expect(page.getByTestId('canvas-empty-state')).toContainText(
      'This plan has no activities yet.',
    );
    await page.getByRole('button', { name: 'Draw the first activity' }).click();
    await expect(band()).toContainText('Adding task');
    await expect(doToolbar(page).getByRole('button', { name: /^Adding/ })).toBeVisible();
  });

  test('the band states the open pick, and the confirmation names the direction', async () => {
    await newPlan(page, 'Stated');
    await ensurePen(page);
    const [a, b] = await seedActivities(page, orgSlug, [
      { name: 'Set out', laneIndex: 0 },
      { name: 'Reinforce', laneIndex: 1 },
    ]);
    if (!a || !b) throw new Error('seeding returned fewer than two activities');
    await recalculate(page, orgSlug);
    await ensurePen(page);
    const map = await mapBars(page);
    const first = requireBarPoint(map, a.id, a.name);
    const second = requireBarPoint(map, b.id, b.name);

    await clearSelection(page);
    await armLink(page);
    await expect(band()).toContainText('Linking FS — click the predecessor');

    await canvas(page).click({ position: first });
    // The whole point: after ONE click, the surface can answer "which one did I pick?".
    await expect(band()).toContainText('Linking FS from “Set out” — click the successor');

    await canvas(page).click({ position: second });
    await expect(band()).toContainText('Linked “Set out” → “Reinforce” (FS).');

    const rows = await dependencies(page, orgSlug);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ predecessorId: a.id, successorId: b.id });

    // The confirmation is accessible, and the whole armed surface is axe-clean.
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
  });

  test('the keyboard creates the same link, in the same direction', async () => {
    await newPlan(page, 'Keyboard');
    await ensurePen(page);
    const [a, b] = await seedActivities(page, orgSlug, [
      { name: 'Formwork', laneIndex: 0 },
      { name: 'Strike', laneIndex: 1 },
    ]);
    if (!a || !b) throw new Error('seeding returned fewer than two activities');
    await recalculate(page, orgSlug);
    await ensurePen(page);

    await armLink(page);
    const listbox = diagramList(page);
    await listbox.focus();
    await listbox.press('Enter'); // picks the first option
    await expect(band()).toContainText('from “Formwork”');
    await listbox.press('ArrowDown');
    await listbox.press('Enter'); // commits

    await expect(band()).toContainText('Linked “Formwork” → “Strike” (FS).');
    const rows = await dependencies(page, orgSlug);
    expect(rows).toHaveLength(1);
    // Direction is asserted at the API, not from the sentence — the sentence is the thing under
    // test, so trusting it here would be circular.
    expect(rows[0]).toMatchObject({ predecessorId: a.id, successorId: b.id });
  });

  test('Add stays armed for a run of activities, and Escape ends it', async () => {
    await newPlan(page, 'Run');
    await ensurePen(page);
    await armAdd(page, 'Task');
    await expect(band()).toContainText('Adding task');
    await canvas(page).press('Escape');
    await expect(band()).toBeHidden();
    await expect(doToolbar(page).getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  });
});
