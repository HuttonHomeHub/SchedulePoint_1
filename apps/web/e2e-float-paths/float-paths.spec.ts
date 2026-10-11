import { expect, test } from '../e2e-support/test';

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
  // One working day on an eight-hour calendar — the figure the whole epic exists to get right, read
  // back from the API rather than off the screen. A day form would have rounded this to 0 against a
  // flat 1440; there is no longer one to round, and the envelope is asserted not to carry it.
  expect(analysis.paths[1]?.relativeFloatMinutes).toBe(480);
  expect(analysis.paths[1]).not.toHaveProperty('relativeFloat');
  // Fourteen chains, ten asked for.
  expect(analysis.hasMorePaths).toBe(true);

  // ── 2 · The command: on the selection bar, absent without a selection, live with one ──────────
  // **It moved off the deck** (toolbar-redesign M2-T4, ADR-0093): its subject is the selected
  // activity, and on the deck it spent most of its life shaded with "Select an activity first". The
  // object is now where the control is — present when there is a selection and absent when there is
  // not (ADR-0082's omit branch, because with no object the action does not apply).
  //
  // Located by `[data-toolbar-item]` and never by role or copy: the id is what the registry
  // guarantees and the words are not, which is the standing rule after three journeys broke on a
  // label change (ADR-0091 M7). It is asked of the whole page first, so a copy left on the deck
  // would be found — one control, two homes, is the defect this move removes.
  const anyFloatPaths = page.locator('[data-toolbar-item="float-paths"]');
  await expect(
    page
      .getByRole('toolbar', { name: 'Plan commands' })
      .locator('[data-toolbar-item="float-paths"]'),
    'Float paths is still on the command deck',
  ).toHaveCount(0);
  await expect(anyFloatPaths, 'Float paths is offered with nothing selected').toHaveCount(0);

  await selectOnCanvas(page, 'Target');
  const bar = page.getByRole('toolbar', { name: /^Actions for Target/ });
  const floatPaths = bar.locator('[data-toolbar-item="float-paths"]');
  await expect(floatPaths).toBeVisible();
  await expect(floatPaths).not.toHaveAttribute('aria-disabled', 'true');
  await expect(floatPaths).toHaveAttribute('aria-pressed', 'false');
  /**
   * What focus must return to after the panel closes: the control that opened it. It is still
   * mounted — the selection bar stays while the activity is selected — so there is one answer and
   * it needs no lookup.
   */
  const restoreTarget = anyFloatPaths;

  // ── 3 · The panel: Driving named, the branch measured on the target's calendar ────────────
  await floatPaths.click();
  await expect(floatPaths).toHaveAttribute('aria-pressed', 'true');
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
  // Scoped to the MODE row, not the command deck: ADR-0091 D1 moved the view switch (and the scheduling
  // mode) off Row 1 and onto the identity line beside the pen, because neither is a command — they
  // set how everything below behaves. The old row-scoped locator matched nothing and timed out,
  // which no unit suite could have caught: the items still exist, still carry the same names, and
  // only their host toolbar changed.
  await page
    .getByRole('toolbar', { name: 'Plan view' })
    .getByRole('button', { name: 'Gantt', exact: true })
    .click();
  await expect(page.getByRole('treegrid', { name: 'Schedule as a bar chart' })).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: /\+1d/ })).toBeVisible();

  // Scoped to the row's NAME CELL, not the row's text. ADR-0095 gave every Gantt row the arrows'
  // textual equivalent — an `sr-only` "Follows <predecessors>." rendered as a direct child of the
  // row — so a successor's row now contains its predecessors' names. Here every activity feeds
  // Target, Target sits at `laneIndex: 0`, and the default sort is `wbs` ascending: Target is the
  // FIRST row and its text reads "Follows Driving, Branch, Spare 01, …". A `hasText` filter
  // therefore collapsed BOTH locators below onto that one row, which is why the assertion above
  // passed and the one below it failed against the same element. The sentence is correct and
  // deliberate; the locator was relying on a row's text mentioning only its own activity.
  // Anchored, NOT exact: the de-emphasis marker is rendered inside the name cell itself, so a
  // dimmed row's cell is named "Driving (off the float path)" — and `exact` would miss precisely
  // the row these assertions are about.
  const rowFor = (name: string) =>
    page
      .getByRole('row')
      .filter({ has: page.getByRole('gridcell', { name: new RegExp(`^${name}\\b`) }) })
      .first();

  const drivingRow = rowFor('Driving');
  await expect(drivingRow).toContainText('(off the float path)');
  // De-emphasis is visual, never structural: the row keeps its tab stop and its activation.
  await expect(drivingRow).toHaveAttribute('tabindex', /-?\d+/);
  await expect(drivingRow).not.toHaveAttribute('aria-disabled', 'true');
  const branchRow = rowFor('Branch');
  await expect(branchRow).not.toContainText('(off the float path)');

  // ── 7 · Closing the panel clears the emphasis, and returns focus to the item ──────────────
  await panel.getByRole('button', { name: 'Close float paths' }).click();
  await expect(panel).toHaveCount(0);
  await expect(drivingRow).not.toContainText('(off the float path)');
  // Focus returns to the control the planner opened this from. Returning to a detached node dropped
  // focus to `<body>` once; this journey is what found that, and it is why the control's own Close
  // goes through `closeFloatPathsAndFocus`.
  await expect(restoreTarget).toBeFocused();
  await expect(anyFloatPaths).toHaveAttribute('aria-pressed', 'false');

  // ── 8 · By keyboard, in the Gantt, and the route's focus comes back there too ──────────────────
  // The Gantt renders the same bar, so the item is in reach with no pointer. Enter opens, Escape
  // closes the panel (its own handler), and focus returns to the item.
  // Asked of the page, not of the Target bar: the selection is Branch since step 5, and the Gantt's
  // bar is named for it. There is exactly one such control wherever the selection is.
  await expect(anyFloatPaths).toHaveCount(1);
  await anyFloatPaths.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await expect(anyFloatPaths).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Close float paths' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(anyFloatPaths).toBeFocused();

  // ── 9 · …and back in the diagram, by keyboard ─────────────────────────────────────────────────
  await page
    .getByRole('toolbar', { name: 'Plan view' })
    .getByRole('button', { name: 'Diagram', exact: true })
    .click();
  await selectOnCanvas(page, 'Target');
  const diagramFloatPaths = page
    .getByRole('toolbar', { name: /^Actions for Target/ })
    .locator('[data-toolbar-item="float-paths"]');
  await diagramFloatPaths.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close float paths' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(diagramFloatPaths).toBeFocused();
});
