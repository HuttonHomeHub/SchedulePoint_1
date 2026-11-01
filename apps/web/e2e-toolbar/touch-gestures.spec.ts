import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../e2e-support/test';

import { onboard, openNewPlan, startEditing } from './support';

/**
 * **The help sheet lists the finger gestures** (`docs/specs/long-press-hint/` M1).
 *
 * The sheet is opened from the **account menu**, not with `?`: the seam between the entry point and
 * the surface is what a unit suite cannot see (ADR-0081). The diagram lists the two gestures that
 * work everywhere; the Gantt adds its row gesture, and — only where editing is live — tap-then-drag
 * and double-tap. The diagram canvas lists none, because nothing in it behaves differently for a
 * finger (spec §2.5).
 */
test('the help sheet lists the touch gestures, in the diagram and in the Gantt', async ({
  page,
}) => {
  // The 1024 × 600 design floor (ADR-0179): a gesture phrase must wrap, not scroll sideways.
  await page.setViewportSize({ width: 1024, height: 600 });
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  const openSheet = async (name: string) => {
    await page.getByRole('button', { name: /Account:/ }).click();
    await page.getByRole('menuitem', { name: 'Diagram shortcuts and gestures' }).click();
    const sheet = page.getByRole('dialog', { name });
    await expect(sheet).toBeVisible();
    return sheet;
  };

  // ---------------------------------------------------------------- the diagram, read-only
  const diagramSheet = await openSheet('Diagram shortcuts and gestures');
  await expect(diagramSheet.getByRole('heading', { name: 'Touch' })).toBeVisible();
  await expect(diagramSheet.getByText('Press and hold a button')).toBeVisible();
  await expect(diagramSheet.getByText('Press and hold an Explorer row')).toBeVisible();
  await expect(diagramSheet.getByText('Tap a bar, then drag it')).toBeHidden();

  const overflow = await diagramSheet.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const results = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(diagramSheet).toBeHidden();

  // ---------------------------------------------------------------- the Gantt, with the pen
  await startEditing(page);
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gantt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const ganttSheet = await openSheet('Gantt shortcuts and gestures');
  await expect(ganttSheet.getByRole('heading', { name: 'Touch' })).toBeVisible();
  await expect(ganttSheet.getByText('Press and hold a button')).toBeVisible();
  await expect(ganttSheet.getByText('Press and hold an Explorer row')).toBeVisible();
  await expect(ganttSheet.getByText('Press and hold a row', { exact: true })).toBeVisible();
  await expect(ganttSheet.getByText('Tap a bar, then drag it')).toBeVisible();
  await expect(ganttSheet.getByText('Double-tap a cell')).toBeVisible();

  const ganttOverflow = await ganttSheet.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(ganttOverflow).toBeLessThanOrEqual(0);

  const ganttResults = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(ganttResults.violations).toEqual([]);
});
