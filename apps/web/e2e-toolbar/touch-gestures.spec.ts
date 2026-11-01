import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../e2e-support/test';

import { onboard, openNewPlan, startEditing } from './support';

/**
 * **The help sheet lists the finger gestures** (`docs/specs/long-press-hint/` M1).
 *
 * The sheet is opened from the **account menu**, not with `?`: the seam between the entry point and
 * the surface is what a unit suite cannot see (ADR-0081). The diagram lists the two gestures that
 * work everywhere; the Gantt adds its row gesture and, only where editing is live, tap-then-drag.
 * The diagram canvas lists none, because nothing in it behaves differently for a finger (spec §2.5).
 */
test('the help sheet lists the touch gestures, in the diagram and in the Gantt', async ({
  page,
}) => {
  // The 1024 × 600 design floor (ADR-0179): a gesture phrase must wrap, not scroll sideways.
  await page.setViewportSize({ width: 1024, height: 600 });
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  const accountChip = page.getByRole('button', { name: /Account:/ });
  const openSheet = async (name: string) => {
    await accountChip.click();
    await page.getByRole('menuitem', { name: 'Shortcuts and gestures' }).click();
    const sheet = page.getByRole('dialog', { name });
    await expect(sheet).toBeVisible();
    return sheet;
  };
  // The dialog and every list inside it: a wrapped phrase must not widen any of them.
  const noSidewaysScroll = async (sheet: ReturnType<typeof page.getByRole>) => {
    const widths = await sheet.evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll('dl'))].map((n) => n.scrollWidth - n.clientWidth),
    );
    expect(widths.length).toBeGreaterThan(1);
    for (const w of widths) expect(w).toBeLessThanOrEqual(0);
  };
  const touchTerms = (sheet: ReturnType<typeof page.getByRole>) =>
    sheet
      .getByRole('heading', { name: 'Touch' })
      .locator('xpath=following-sibling::dl[1]')
      .locator('dt');

  // ---------------------------------------------------------------- the diagram, read-only
  const diagramSheet = await openSheet('Diagram shortcuts and gestures');
  await expect(diagramSheet.getByRole('heading', { name: 'Touch' })).toBeVisible();
  await expect(touchTerms(diagramSheet)).toHaveText([
    'Press and hold an icon button',
    'Press and hold an Explorer row',
  ]);
  await expect(diagramSheet.getByText('Tap a bar, then drag it')).toBeHidden();
  await noSidewaysScroll(diagramSheet);

  const results = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(diagramSheet).toBeHidden();
  await expect(accountChip).toBeFocused();

  // ---------------------------------------------------------------- the Gantt, with the pen
  await startEditing(page);
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gantt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const ganttSheet = await openSheet('Gantt shortcuts and gestures');
  await expect(touchTerms(ganttSheet)).toHaveText([
    'Press and hold an icon button',
    'Press and hold an Explorer row',
    'Press and hold a row or bar',
    'Tap a bar, then drag it',
  ]);
  await noSidewaysScroll(ganttSheet);

  const ganttResults = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(ganttResults.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(ganttSheet).toBeHidden();
  await expect(accountChip).toBeFocused();
});
