import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  diagramActivityList,
  ensurePen,
  ganttGrid,
  onboard,
  seedActivities,
  showGantt,
} from './support';

/**
 * Flag-ON **Gantt view** journey (`VITE_GANTT_VIEW`, ADR-0059). It proves the claims the epic rests
 * on, end to end against a real API and database — the ones a unit test can only assert against a
 * mock:
 *
 * 1. **The two views are the same schedule.** The activities the *diagram* says it contains are the
 *    rows the *Gantt* shows, carrying the dates the engine actually computed. That is what "a peer
 *    view of one model" has to mean.
 * 2. **The view choice is in the URL.** `?view=gantt` survives a reload and is shareable — proven by
 *    a real reload rather than by a router mock.
 * 3. **The grid is readable without sight of it.** The bars are decoration; the dates live in cells.
 *    A real axe pass over the rendered treegrid is the only way to know that survived.
 *
 * **No canvas drawing.** Claim 1 is asserted against the diagram's own parallel listbox (the
 * accessible representation ADR-0026 built by hand) rather than by authoring bars with the mouse.
 * That is both a stronger statement — two views agreeing on the model, not on a click — and free of
 * a dependency on canvas authoring, which is the TSLD's contract to test, not the Gantt's.
 *
 * Serial (one org and plan mutate throughout); Chromium only (TECH_DEBT #25a).
 */
test('the Gantt is a peer view of the same schedule, deep-linkable and readable as a grid', async ({
  page,
}) => {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Substructure');

  // Three activities, so arrow-key movement has somewhere to go. Writes are pen-gated (ADR-0028).
  await ensurePen(page);
  await seedActivities(page, orgSlug, 3);
  await page.reload();

  // ------------------------------------------------------------------ 1. The diagram is default
  const ganttButton = page.getByRole('button', { name: 'Gantt', exact: true });
  await expect(page.getByRole('button', { name: 'Diagram', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(ganttButton).toHaveAttribute('aria-pressed', 'false');
  await expect(ganttGrid(page)).toBeHidden();

  // What the diagram says it contains — its own accessible account of the model.
  const diagramNames = await diagramActivityList(page).getByRole('option').allInnerTexts();
  expect(diagramNames.join(' ')).toContain('Seeded 0');

  // ------------------------------------------------------------------ 2. Switch to the Gantt
  await showGantt(page);
  const grid = ganttGrid(page);

  // One view at a time — the diagram's canvas region is gone, not merely covered.
  await expect(page.locator('section[aria-label="Time-scaled logic diagram"]')).toBeHidden();

  // Every activity the diagram listed is a Gantt row, and the dates are TEXT in cells — not encoded
  // only in a bar. The plan starts 2026-01-05, so the computed start is a January date.
  for (const name of ['Seeded 0', 'Seeded 1', 'Seeded 2']) {
    await expect(grid.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  }
  await expect(grid.getByRole('row', { name: /Seeded 0/ })).toContainText(/Jan 2026/);

  // ------------------------------------------------------------------ 3. The URL carries the view
  await expect(page).toHaveURL(/[?&]view=gantt/);
  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gantt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // ------------------------------------------------------------------ 4. Keyboard + a11y
  // The grid carries a roving tab stop: arrows move between rows. A bar chart that can only be read
  // with a mouse is not a view of the schedule for everyone.
  await ganttGrid(page).getByRole('row').nth(1).focus();
  const before = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-rowindex') ?? '',
  );
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex') ?? ''))
    .not.toBe(before);

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
