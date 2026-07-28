import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  drawActivity,
  ganttGrid,
  onboard,
  seedActivities,
  showGantt,
  startEditing,
} from './support';

/**
 * Flag-ON **Gantt view** journey (`VITE_GANTT_VIEW`, ADR-0059). It proves the claims the epic rests
 * on, end to end against a real API and database — the ones a unit test can only assert against a
 * mock:
 *
 * 1. **The two views are the same schedule.** An activity drawn on the diagram appears as a row in
 *    the Gantt with the dates the engine actually computed. This is what "a peer view of one model"
 *    has to mean.
 * 2. **The view choice is in the URL.** `?view=gantt` survives a reload and is shareable — proven by
 *    a real reload rather than by a router mock.
 * 3. **The grid is readable without sight of it.** The bars are decoration; the dates live in cells.
 *    A real axe pass over the rendered treegrid is the only way to know that survived.
 *
 * **One** activity is drawn on the canvas, which is what every other flag-on suite does; the second
 * row (needed to prove arrow-key movement) is seeded through the API. Drawing twice in a row is a
 * canvas-authoring behaviour no suite exercises, and a Gantt journey is the wrong place to discover
 * it — a failure there would say nothing about the Gantt.
 *
 * Serial (one org and plan mutate throughout); Chromium only (TECH_DEBT #25a).
 */
test('the Gantt is a peer view of the same schedule, deep-linkable and readable as a grid', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Substructure');

  // ------------------------------------------------------------------ 1. Author on the diagram
  await startEditing(page);
  await drawActivity(page, 'Excavate', { x: 220, y: 120 });

  // A second row, so arrow-key movement has somewhere to go.
  await seedActivities(page, orgSlug, 1);
  await page.reload();

  // The diagram is the default view: the switch exists and Diagram is the pressed half.
  const ganttButton = page.getByRole('button', { name: 'Gantt', exact: true });
  await expect(page.getByRole('button', { name: 'Diagram', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(ganttButton).toHaveAttribute('aria-pressed', 'false');
  await expect(ganttGrid(page)).toBeHidden();

  // ------------------------------------------------------------------ 2. Switch to the Gantt
  await showGantt(page);
  const grid = ganttGrid(page);

  // One view at a time — the diagram's canvas region is gone, not merely covered.
  await expect(page.locator('section[aria-label="Time-scaled logic diagram"]')).toBeHidden();

  // The drawn activity is a row, and its dates are TEXT in cells — not encoded only in a bar. The
  // plan starts 2026-01-05, so the computed start is a January date.
  const excavate = grid.getByRole('row', { name: /Excavate/ });
  await expect(excavate).toBeVisible();
  await expect(excavate).toContainText(/Jan 2026/);
  await expect(grid.getByRole('row', { name: /Seeded 0/ })).toBeVisible();

  // ------------------------------------------------------------------ 3. The URL carries the view
  await expect(page).toHaveURL(/[?&]view=gantt/);
  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gantt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // ------------------------------------------------------------------ 4. Keyboard + a11y
  // The grid carries a roving tab stop: one Tab reaches a row, arrows move between rows. A bar
  // chart that can only be read with a mouse is not a view of the schedule for everyone.
  const rows = ganttGrid(page).getByRole('row');
  await rows.nth(1).focus();
  const focusedBefore = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-rowindex') ?? '',
  );
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex') ?? ''))
    .not.toBe(focusedBefore);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // ------------------------------------------------------------------ 5. Back to the diagram
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  await expect(page.locator('section[aria-label="Time-scaled logic diagram"]')).toBeVisible();
  await expect(ganttGrid(page)).toBeHidden();
  await expect(page).toHaveURL(/[?&]view=tsld/);
});
