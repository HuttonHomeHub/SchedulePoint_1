import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { addActivity, createAndOpenPlan, onboard, openProject, recalculate } from './support';

/**
 * Flag-ON **live cross-plan / programme scheduling** journey (`VITE_PROGRAMME_SCHEDULING`,
 * inter-project M2, ADR-0045 F8). Proves the surface runs end-to-end in a real browser against the
 * real API:
 *
 * 1. Two interdependent plans in one project — an upstream **Procurement** (a long "Deliver steel")
 *    and a downstream **Construction** ("Erect frame").
 * 2. A **live cross-plan link** drawn from the downstream activity's Logic panel (the successor's
 *    home, CQ-2) to the upstream activity, via the org-scoped endpoint picker.
 * 3. A **programme recalculate** that solves the closure upstream-first, so the downstream date is
 *    driven by the upstream computed finish — the "External" driven badge lights up.
 * 4. **Staleness**: recalculating the upstream alone leaves the downstream stale (the banner appears);
 *    a programme recalculate clears it.
 *
 * Runs on the legacy stacked plan-detail page with the pen off (see the config), so it is pen-free.
 */
test('a planner links plans across projects and recalculates the programme', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);

  // Upstream plan: a long activity so its computed finish clearly gates the downstream.
  await createAndOpenPlan(page, 'Procurement');
  await addActivity(page, 'Deliver steel', 20);
  await recalculate(page);
  await expect(page.getByText('Project finish')).toBeVisible();

  // Downstream plan: back to the project, then a second plan with one activity.
  await page.getByRole('link', { name: 'Riverside' }).click();
  await createAndOpenPlan(page, 'Construction');
  await addActivity(page, 'Erect frame');
  await recalculate(page);

  // No cross-plan link yet → the programme surface is invisible (the summary omits `scheduleStale`).
  await expect(page.getByRole('region', { name: 'Programme scheduling' })).toBeHidden();

  // Draw the live cross-plan link from the downstream activity's Logic panel.
  await page.getByRole('button', { name: 'Actions for Erect frame' }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  const logic = page.getByRole('dialog', { name: /Logic for Erect frame/ });
  await expect(logic.getByRole('heading', { name: 'Cross-plan links' })).toBeVisible();
  await logic.getByRole('button', { name: 'Add cross-plan link' }).click();

  // The endpoint picker cascade: client → project → plan → activity (in the other plan).
  const add = page.getByRole('dialog', { name: 'Add cross-plan link' });
  await add.getByLabel('Client').selectOption({ label: 'Northgate' });
  await add.getByLabel('Project').selectOption({ label: 'Riverside' });
  await add.getByLabel('Plan').selectOption({ label: 'Procurement' });
  await add.getByLabel('Activity').selectOption({ label: 'Deliver steel' });
  await add.getByRole('button', { name: 'Add cross-plan link' }).click();

  // The add succeeds and the link is created. The durable, deterministic signal is the **programme
  // surface**, which appears only once the plan has a cross-plan edge — independent of the Logic panel,
  // which can close here when the create invalidates the schedule summary (a benign flag-off race,
  // TECH_DEBT #45). Assert on that, then re-open the panel fresh to confirm the edge lists.
  await expect(add).toBeHidden();
  const programme = page.getByRole('region', { name: 'Programme scheduling' });
  await expect(programme).toBeVisible();

  // Dismiss the Logic panel if it is still open, then re-open it and confirm the link lists as an
  // incoming ("Driven by") edge from the upstream activity. `exact` so the predecessor NAME cell wins —
  // the actions cell's "Remove cross-plan link to Deliver steel" button would otherwise also match this
  // (substring) role query and trip strict mode.
  await page.keyboard.press('Escape');
  await expect(logic).toBeHidden();
  await page.getByRole('button', { name: 'Actions for Erect frame' }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  await expect(logic.getByRole('cell', { name: 'Deliver steel', exact: true })).toBeVisible();
  await expect(logic.getByText('Driven by')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(logic).toBeHidden();

  // Recalculate the programme (upstream-first).
  await programme.getByRole('button', { name: 'Recalculate programme' }).click();

  // The result panel lists the closure upstream-first (the target last). `exact` on the target row so
  // it doesn't also match the section's intro copy ("This plan has live cross-plan links…").
  await expect(programme.getByText('Upstream plan 1')).toBeVisible();
  await expect(programme.getByText('This plan', { exact: true })).toBeVisible();

  // The downstream date is now driven by the upstream commitment → the "External" driven badge lights
  // up in the activities table (the M1 badge the programme surface reuses; matched by its sr-only text).
  await expect(page.getByText(/imported date from another project/i)).toBeVisible();

  // Staleness: recalculate the upstream alone, then the downstream shows the stale banner.
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('link', { name: 'Procurement', exact: true }).click();
  await recalculate(page);
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('link', { name: 'Construction', exact: true }).click();

  const staleBanner = page.getByText('Upstream plans changed');
  await expect(staleBanner).toBeVisible();

  // A programme recalculate clears the staleness.
  await page
    .getByRole('region', { name: 'Programme scheduling' })
    .getByRole('button', { name: 'Recalculate programme' })
    .click();
  await expect(page.getByText('Upstream plans changed')).toBeHidden();

  // The programme surface is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
