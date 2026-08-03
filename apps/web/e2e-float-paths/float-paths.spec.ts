import { expect, test } from '@playwright/test';

import {
  canvasListbox,
  canvasOptionText,
  createAndOpenPlan,
  createEightHourCalendar,
  onboard,
  openProject,
  readFloatPaths,
  seedNetwork,
  selectOnCanvas,
} from './support';

/**
 * **The Float paths journey** (audit F4, M4) — flag ON, against a real API and a real database.
 *
 * ONE test, deliberately. Playwright gives each test its own browser context, which drops the
 * session; and every claim here builds on the same seeded network, so splitting them would mean
 * re-onboarding five times to prove five things about one plan.
 *
 * The claim that would have caught the epic's founding defect is the second one: on an **eight-hour**
 * calendar, a branch carrying one working day of float must read `+1d`. Dividing the engine's 480
 * minutes by a flat 1440 gives `0` — indistinguishable from the driving path, which is a wrong
 * answer presented as a finding. No unit test can prove the number survives the real API, the real
 * engine and the real calendar; this one does, and asserts the API's own figure beside the DOM's so
 * a passing render cannot hide a broken value.
 */

test('a planner reads the float paths into an activity, in both views', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  const calendarId = await createEightHourCalendar(page, orgSlug);
  await openProject(page);
  // Deliberately NOT named after the feature: a plan called "Float paths plan" makes every
  // `getByRole('button', { name: /float paths/i })` ambiguous with its own row-actions menu.
  const planId = await createAndOpenPlan(page, 'Riverside programme', orgSlug, calendarId);
  const { targetId } = await seedNetwork(page, orgSlug, planId);
  await page.reload();

  // ── 1 · The API's own answer, before any of it reaches a pixel ────────────────────────────
  const analysis = await readFloatPaths(page, orgSlug, planId, targetId);
  expect(analysis.paths[0]?.relativeFloatMinutes).toBe(0);
  // One working day on an eight-hour calendar. `relativeFloat` (days) is the deprecated field and
  // rounds this to 0 — asserted so the deprecation stays honest rather than quietly correct.
  expect(analysis.paths[1]?.relativeFloatMinutes).toBe(480);
  expect(analysis.paths[1]?.relativeFloat).toBe(0);
  // Fourteen chains, ten asked for.
  expect(analysis.hasMorePaths).toBe(true);

  // ── 2 · The toolbar item: shaded without a selection, live with one ───────────────────────
  // Scoped to the toolbar: the item is what is under test, not any button whose name contains it.
  const lookRow = page.getByRole('toolbar', { name: 'View and navigate' });
  const floatPaths = lookRow.getByRole('button', { name: 'Float paths', exact: true });
  await expect(floatPaths).toBeVisible();
  await expect(floatPaths).toHaveAttribute('aria-disabled', 'true');
  await expect(floatPaths).toHaveAttribute('title', /select an activity first/i);

  await selectOnCanvas(page, 'Target');
  await expect(floatPaths).not.toHaveAttribute('aria-disabled', 'true');

  // ── 3 · The panel: Driving named, the branch measured on the target's calendar ────────────
  await floatPaths.click();
  const panel = page.getByRole('region', { name: 'Float paths' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Target');

  const driving = panel.getByRole('button', { name: /Driving/ });
  await expect(driving).toBeVisible();
  // `+1d`, NOT `0d`. This is the assertion the epic exists for.
  const branch = panel.getByRole('button', { name: /\+1d/ });
  await expect(branch).toBeVisible();
  await expect(panel.getByText('+0d')).toHaveCount(0);

  // Truncation is stated, not implied.
  await expect(panel).toContainText(/showing the first 10 paths/i);
  await expect(panel.getByRole('button', { name: 'Show more' })).toBeVisible();

  // ── 4 · Selecting a path emphasises it on the canvas ──────────────────────────────────────
  await branch.click();
  expect(await canvasOptionText(page, 'Driving')).toContain('(off the float path)');
  expect(await canvasOptionText(page, 'Branch')).not.toContain('off the float path');

  // ── 5 · Activating a chain member lifts the workspace selection ───────────────────────────
  // The chain ROW, not the disclosure above it: the disclosure's name is "+1d Branch", so anchor
  // the match at the start of the name.
  await panel.getByRole('button', { name: /^Branch\b/ }).click();
  await expect(canvasListbox(page).locator('[aria-selected="true"]')).toContainText('Branch');

  // ── 6 · The same analysis, the same emphasis, in the Gantt ────────────────────────────────
  // It is an analysis, not a canvas viewport command, so it is live in both views (the ADR-0059 M6
  // lesson inverted). The panel is workspace-hosted and must survive the switch.
  await lookRow.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.getByRole('treegrid', { name: 'Schedule as a bar chart' })).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: /\+1d/ })).toBeVisible();

  const drivingRow = page.getByRole('row').filter({ hasText: 'Driving' }).first();
  await expect(drivingRow).toContainText('(off the float path)');
  // De-emphasis is visual, never structural: the row keeps its tab stop and its activation.
  await expect(drivingRow).toHaveAttribute('tabindex', /-?\d+/);
  await expect(drivingRow).not.toHaveAttribute('aria-disabled', 'true');
  const branchRow = page.getByRole('row').filter({ hasText: 'Branch' }).first();
  await expect(branchRow).not.toContainText('(off the float path)');

  // ── 7 · Closing the panel clears the emphasis, and returns focus to the item ──────────────
  await panel.getByRole('button', { name: 'Close float paths' }).click();
  await expect(panel).toHaveCount(0);
  await expect(drivingRow).not.toContainText('(off the float path)');
  await expect(floatPaths).toBeFocused();
});
