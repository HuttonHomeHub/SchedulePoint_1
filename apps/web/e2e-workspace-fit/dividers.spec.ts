import AxeBuilder from '@axe-core/playwright';
import { type Browser, type BrowserContext, type Page } from '@playwright/test';

import { showActivities } from '../e2e/workspace';
import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **Pressing a divider opens a box to type its size** (`docs/TECH_DEBT.md` #442, ADR-0188 D1).
 *
 * A drag is the only pointer route to a panel's size, and WCAG 2.2 SC 2.5.7 asks for a single-pointer
 * alternative that is not a keyboard one. This drives the real product with a real mouse and a real
 * finger: a press that does not move opens a labelled box at the divider, a drag still resizes and opens
 * nothing, a typed size applies and a limited one says so, Escape closes it with focus back on the
 * line, and Reset to standard puts the size back.
 *
 * Both pointers, and the two cells the sweep uses for width (the Surface and the floor). The Gantt grid
 * divider is the same box with the same field as `View ▾` › Columns › `Table width`
 * (`e2e-gantt/column-widths.spec.ts` drives that one).
 */

const SURFACE = { width: 1646, height: 1097 };
const FLOOR = { width: 1024, height: 600 };

let browserRef: Browser;
let seed: Awaited<ReturnType<BrowserContext['storageState']>>;
let planUrl = '';

test.describe('A divider is pressed to type a size', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    browserRef = browser;
    const context = await browser.newContext({ viewport: SURFACE });
    await acknowledgeViewportNotice(context);
    const page = await context.newPage();
    const orgSlug = await onboard(page, Date.now() + 29);
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Dividers');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    ]);
    await recalculate(page, orgSlug);
    planUrl = page.url();
    seed = await context.storageState();
    await context.close();
  });

  async function openPlan(
    viewport: { width: number; height: number },
    coarse: boolean,
  ): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browserRef.newContext({
      storageState: seed,
      viewport,
      hasTouch: coarse,
    });
    await acknowledgeViewportNotice(context);
    const page = await context.newPage();
    await page.goto(planUrl);
    await expect(page.getByRole('separator', { name: 'Resize Project Explorer' })).toBeVisible({
      timeout: 30_000,
    });
    // The instrument: a coarse context has to report a coarse pointer, or every touch assertion below
    // is about the fine path.
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarse);
    return { context, page };
  }

  const boxFor = (page: Page, subject: string) =>
    page.getByRole('dialog', { name: `Set ${subject}` });
  const fieldFor = (page: Page, subject: string) => page.getByRole('spinbutton', { name: subject });
  const valueOf = async (separator: ReturnType<Page['getByRole']>): Promise<number> =>
    Number(await separator.getAttribute('aria-valuenow'));

  for (const viewport of [SURFACE, FLOOR]) {
    test(`a mouse press types a size, ${viewport.width} x ${viewport.height}`, async () => {
      test.setTimeout(180_000);
      const { context, page } = await openPlan(viewport, false);
      const explorer = page.getByRole('separator', { name: 'Resize Project Explorer' });
      const panel = page.locator('[data-panel-border]').first();
      const standard = await valueOf(explorer);

      // A press that does not move opens the box, with the size in it and focus in the field.
      await explorer.click();
      await expect(boxFor(page, 'Project Explorer width')).toBeVisible();
      const field = fieldFor(page, 'Project Explorer width');
      await expect(field).toBeFocused();
      await expect(field).toHaveValue(String(standard));

      // axe over the open box: the field, its label, its range and the buttons.
      const axe = await new AxeBuilder({ page })
        .include('[role="dialog"][aria-label^="Set "]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations).toEqual([]);

      // A typed size applies on Enter and the panel follows it.
      const min = Number(await explorer.getAttribute('aria-valuemin'));
      const typed = min + 32;
      await field.fill(String(typed));
      await page.keyboard.press('Enter');
      await expect(explorer).toHaveAttribute('aria-valuenow', String(typed));
      expect(Math.round((await panel.boundingBox())?.width ?? 0)).toBe(typed);
      await expect(page.getByRole('status').filter({ hasText: 'width' })).toHaveCount(0);

      // A size outside the range is limited and SAYS so: never changed silently.
      await field.fill('5000');
      await page.keyboard.press('Enter');
      const max = Number(await explorer.getAttribute('aria-valuemax'));
      await expect(explorer).toHaveAttribute('aria-valuenow', String(max));
      await expect(page.getByRole('status').filter({ hasText: 'limited to' })).toContainText(
        `Project Explorer width limited to ${max} px. Allowed range is ${min} to ${max} pixels.`,
      );

      // Reset to standard puts it back, and says so.
      await page.getByRole('button', { name: 'Reset to standard' }).click();
      await expect(explorer).toHaveAttribute('aria-valuenow', String(standard));
      await expect(page.getByRole('status').filter({ hasText: 'reset to standard' })).toContainText(
        'Project Explorer width reset to standard.',
      );

      // Escape closes it, a typed draft is discarded, and focus is back on the line.
      await field.fill(String(typed));
      await page.keyboard.press('Escape');
      await expect(boxFor(page, 'Project Explorer width')).toHaveCount(0);
      await expect(explorer).toBeFocused();
      await expect(explorer).toHaveAttribute('aria-valuenow', String(standard));

      // A drag still resizes and opens nothing.
      const box = await explorer.boundingBox();
      if (!box) throw new Error('the Explorer separator has no box');
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + 0.5, y);
      await page.mouse.down();
      await page.mouse.move(box.x + 0.5 + 40, y, { steps: 5 });
      await page.mouse.up();
      await expect(boxFor(page, 'Project Explorer width')).toHaveCount(0);
      expect(await valueOf(explorer)).toBeGreaterThan(standard);

      // The keyboard is untouched: arrows move it, and no key opens the box.
      await explorer.focus();
      const before = await valueOf(explorer);
      await page.keyboard.press('ArrowLeft');
      await expect(explorer).toHaveAttribute('aria-valuenow', String(before - 16));
      await page.keyboard.press('Enter');
      await expect(boxFor(page, 'Project Explorer width')).toHaveCount(0);

      await context.close();
    });
  }

  test('a right dock and the activities panel have the same box, at the Surface', async () => {
    test.setTimeout(180_000);
    const { context, page } = await openPlan(SURFACE, false);

    // The notes dock: a right dock, whose width grows as the line moves left.
    await page.locator('[data-toolbar-item="comments"]').first().click();
    const notes = page.getByRole('separator', { name: 'Resize notes panel' });
    await expect(notes).toBeVisible();
    await notes.click();
    await expect(boxFor(page, 'Notes panel width')).toBeVisible();
    const target = Number(await notes.getAttribute('aria-valuemin')) + 48;
    await fieldFor(page, 'Notes panel width').fill(String(target));
    await page.keyboard.press('Enter');
    await expect(notes).toHaveAttribute('aria-valuenow', String(target));
    expect(
      Math.round((await page.locator('[data-right-dock="notes"]').boundingBox())?.width ?? 0),
    ).toBe(target);
    await page.keyboard.press('Escape');
    await expect(notes).toBeFocused();
    await page.getByRole('button', { name: 'Close plan notes' }).click();

    // The activities panel: a horizontal divider, a height.
    await showActivities(page);
    const activities = page.getByRole('separator', { name: 'Resize activities panel' });
    await activities.click();
    await expect(boxFor(page, 'Activities panel height')).toBeVisible();
    await fieldFor(page, 'Activities panel height').fill('300');
    await page.keyboard.press('Enter');
    await expect(activities).toHaveAttribute('aria-valuenow', '300');
    await page.keyboard.press('Escape');
    await expect(activities).toBeFocused();

    await context.close();
  });

  for (const viewport of [SURFACE, FLOOR]) {
    test(`a finger finds the line and presses it, ${viewport.width} x ${viewport.height}`, async () => {
      test.setTimeout(180_000);
      const { context, page } = await openPlan(viewport, true);
      const explorer = page.getByRole('separator', { name: 'Resize Project Explorer' });
      const box = await explorer.boundingBox();
      if (!box) throw new Error('the Explorer separator has no box');
      const y = box.y + box.height / 2;

      // 18 px to the stage side of the line is inside the 44 px strip (22 each way) and outside the old 25 px one (12).
      await page.touchscreen.tap(box.x + 0.5 + 18, y);
      await expect(boxFor(page, 'Project Explorer width')).toBeVisible();
      await expect(fieldFor(page, 'Project Explorer width')).toBeFocused();
      const field = fieldFor(page, 'Project Explorer width');
      const min = Number(await explorer.getAttribute('aria-valuemin'));
      await field.fill(String(min + 16));
      await page.keyboard.press('Enter');
      await expect(explorer).toHaveAttribute('aria-valuenow', String(min + 16));
      await page.keyboard.press('Escape');
      await expect(explorer).toBeFocused();

      // And the box's own controls are finger-sized.
      await explorer.tap();
      for (const control of [
        page.getByRole('spinbutton', { name: 'Project Explorer width' }),
        page.getByRole('button', { name: 'Reset to standard' }),
      ]) {
        const size = await control.boundingBox();
        expect(size?.height ?? 0).toBeGreaterThanOrEqual(43.5);
      }
      await context.close();
    });
  }
});
