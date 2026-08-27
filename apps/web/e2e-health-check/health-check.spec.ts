import { expect, test } from '@playwright/test';

import { revealToolbarCommand } from '../e2e-support/toolbar';

import { canvasListbox, createAndOpenPlan, onboard, openProject, seedDefects } from './support';

/**
 * **The Health check journey** (health M2-T4) — against a real API and a real database, landing
 * with the FIRST user-facing milestone and not at the gate pass (ADR-0081 §2).
 *
 * ONE test, deliberately: every claim reads one seeded plan, and a fresh context per claim would
 * drop the session and re-seed four times. What only this suite can prove is the seam the register
 * keeps recording as the shipped defect (ADR-0080's `bulk`, ADR-0099's drawer): that the menu item
 * exists IN THE SHIPPED LAYOUT, opens a panel that really renders the API's report, and that
 * pressing an offender reaches the workspace selection — unit tests mount the panel, and the
 * defect lives in the seam between the panel and the shell.
 */

test('a planner opens the health check, reads the verdicts and jumps to an offender', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  // Not named after the feature: a plan called "Health plan" would make every
  // `getByRole(… /health/i)` ambiguous with its own row menu (the float-paths lesson).
  const planId = await createAndOpenPlan(page, 'Riverside programme');
  const { danglerName } = await seedDefects(page, orgSlug, planId);
  await page.reload();

  // ── 1 · The entry point, in the shipped layout ─────────────────────────────────────────────
  await revealToolbarCommand(page, 'analysis');
  await page
    .getByRole('toolbar', { name: 'Plan commands' })
    .locator('[data-toolbar-item="analysis"]')
    .click();
  await page.getByRole('menuitem', { name: 'Health check…' }).click();

  // ── 2 · Fourteen rows, always — and the seeded defects' verdicts ───────────────────────────
  const panel = page.getByRole('region', { name: 'Health check' });
  await expect(panel).toBeVisible();
  // The summary line settles once the report arrives.
  await expect(panel.getByText(/\d+ failed · \d+ passed/)).toBeVisible();
  const rows = panel.getByRole('listitem');
  await expect(rows).toHaveCount(14);

  // Metric 2 (Leads): the seeded −1 d SS lead must read Fail with its count.
  const leadsRow = rows.filter({ hasText: 'Leads' }).first();
  await expect(leadsRow).toContainText('Fail');

  // Metric 1 (Missing logic): the dangler is an offender; the typed exclusion rule means the
  // linked chain's open ends count too (no terminal milestones were seeded).
  const missingRow = rows.filter({ hasText: 'Missing logic' }).first();
  await expect(missingRow).toContainText('Fail');

  // Metric 12's honest placeholder — present, explained, never omitted.
  const cptRow = rows.filter({ hasText: 'Critical Path Test' }).first();
  await expect(cptRow).toContainText('Not assessed');

  // Metrics 11/14: no baseline exists, and the row says so rather than failing or vanishing.
  await expect(rows.filter({ hasText: 'Baseline Execution Index' }).first()).toContainText(
    'Not assessed',
  );

  // ── 3 · Jump to an offender: press it, and the workspace selection lifts it ────────────────
  await missingRow.getByRole('button', { name: /missing logic/i }).click();
  await missingRow.getByRole('button', { name: new RegExp(danglerName) }).click();
  // The canvas's parallel listbox is the a11y surface the selection must reach (ADR-0026 D7).
  const selected = canvasListbox(page).locator('[aria-selected="true"]');
  await expect(selected).toContainText(danglerName);

  // ── 4 · Close restores focus to the trigger, never `<body>` (WCAG 2.4.3) ───────────────────
  await panel.getByRole('button', { name: 'Close health check' }).click();
  await expect(panel).not.toBeVisible();
  const focusedItem = await page.evaluate(() =>
    document.activeElement?.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item'),
  );
  expect(focusedItem).toBe('analysis');

  // ── 5 · One dock at a time: opening Health check closes Float paths ────────────────────────
  // (The three-way exclusivity is pinned at the unit tier; the journey proves ONE real pair in
  // the shipped layout so the wiring — not just the helper — is exercised.)
  await canvasListbox(page).focus(); // select an activity so Float paths has a target
  await page
    .getByRole('toolbar', { name: 'Plan commands' })
    .locator('[data-toolbar-item="float-paths"]')
    .click();
  await expect(page.getByRole('region', { name: 'Float paths' })).toBeVisible();
  await page
    .getByRole('toolbar', { name: 'Plan commands' })
    .locator('[data-toolbar-item="analysis"]')
    .click();
  await page.getByRole('menuitem', { name: 'Health check…' }).click();
  await expect(page.getByRole('region', { name: 'Health check' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Float paths' })).not.toBeVisible();

  // ── 6 · The Gantt reveal (M3-T2, the UX review's blocker): selection alone scrolls nothing ──
  // Switch views with the panel still open (a dock is workspace-level, so it survives the switch),
  // collapse the offender's WBS parent, and prove the jump expands the ancestor and reveals the
  // row. jsdom has no virtualizer and no scrolling, so ONLY this suite can see either half fail.
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  const grid = page.getByRole('treegrid');
  await expect(grid).toBeVisible();
  const phaseRow = grid.getByRole('row').filter({ hasText: 'Phase 2' }).first();
  await phaseRow.click();
  // Bare ArrowLeft is treegrid disclosure (ADR-0095 D4) — collapse the parent.
  await page.keyboard.press('ArrowLeft');
  await expect(phaseRow).toHaveAttribute('aria-expanded', 'false');
  await expect(grid.getByRole('row').filter({ hasText: danglerName })).toHaveCount(0);

  const healthPanel = page.getByRole('region', { name: 'Health check' });
  await healthPanel.getByRole('button', { name: /missing logic/i, expanded: false }).click();
  await healthPanel.getByRole('button', { name: new RegExp(danglerName) }).click();
  // The ancestor was expanded by the activation, and the revealed row is scrolled into view.
  await expect(phaseRow).toHaveAttribute('aria-expanded', 'true');
  const revealedRow = grid.getByRole('row').filter({ hasText: danglerName }).first();
  await expect(revealedRow).toBeVisible();
  await expect(revealedRow).toBeInViewport();

  // ── 7 · The printed report (M4): all fourteen rows, sentences not codes, offenders + the cap ──
  // `window.print` stubbed; the detached container stays mounted (teardown waits on `afterprint`,
  // which a stub never fires), so its DOM can be read even though the screen stylesheet hides it.
  await page.evaluate(() => {
    window.print = () => {};
  });
  await healthPanel.getByRole('button', { name: 'Print report' }).click();
  const printed = await page.evaluate(() => {
    const doc = document.querySelector('.tsld-print-container .health-print');
    return {
      rows: doc?.querySelectorAll('tbody tr').length ?? 0,
      text: doc?.textContent ?? '',
    };
  });
  expect(printed.rows).toBe(14);
  // The dangler's offender line reached paper, with its note.
  expect(printed.text).toContain('Loose end');
  // A reason prints as a sentence, never a code (the M4-T1 grep, run against the REAL document).
  expect(printed.text).toContain('No active baseline exists to compare against.');
  expect(printed.text).not.toMatch(/NO_ACTIVE_BASELINE|PLAN_NOT_SCHEDULED/);
});
