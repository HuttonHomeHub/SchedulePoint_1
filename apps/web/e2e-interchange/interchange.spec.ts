import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { onboard, openNewProject, validMspdiFile, validXerFile } from './support';

/**
 * Flag-ON **schedule interchange (XER import)** journey (`VITE_SCHEDULE_INTERCHANGE`, Stage C2 M1,
 * ADR-0050, `docs/specs/schedule-interchange/`). Proves the whole M1 import loop runs in a real browser:
 *
 * 1. A Planner/Org Admin creates a client + project, then opens the project's plan-create surface, where
 *    the "Import from file…" entry now sits beside "New plan" (self-gated on `interchange:import`, which
 *    the org-creating actor already holds).
 * 2. Clicking it opens the review `ImportScheduleDialog`; picking a valid `.xer` dry-runs it and renders
 *    the `InterchangeReportTable` with the mapped counts (2 activities, 1 relationship, 0 calendars —
 *    mirroring the API suite's `validXer()`), enabling **Confirm import**.
 * 3. An axe pass over the open dialog confirms it stays WCAG 2.2 AA before anything is committed.
 * 4. Clicking **Confirm import** commits the same file, creating the plan server-side and navigating to
 *    it (`/orgs/$orgSlug/plans/$planId`) — the loop's payoff, landing on the canvas-first plan workspace
 *    with the imported plan's name as its heading.
 *
 * Serial (the suite creates and navigates to one plan); Chromium only (TECH_DEBT #25a).
 */
test('a planner imports a schedule from a .xer file and lands on the new plan', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewProject(page);

  // (1) The entry sits beside "New plan" on the project's plan-create surface.
  const importButton = page.getByRole('button', { name: 'Import from file…' });
  await expect(importButton).toBeVisible();
  await importButton.click();

  const dialog = page.getByRole('dialog', { name: 'Import schedule from file' });
  await expect(dialog).toBeVisible();

  const confirmButton = dialog.getByRole('button', { name: 'Confirm import' });
  await expect(confirmButton).toBeDisabled();

  // (2) Picking the valid .xer dry-runs it; the report renders the mapped counts and enables Confirm.
  await dialog.getByLabel('Schedule file (.xer or .xml)').setInputFiles(validXerFile());

  const mappedCounts = dialog.locator('dl[aria-label="Mapped"]');
  await expect(mappedCounts).toBeVisible();
  await expect(mappedCounts.getByText('Activities')).toBeVisible();
  await expect(mappedCounts.getByText('Relationships')).toBeVisible();
  await expect(mappedCounts.getByText('Calendars')).toBeVisible();
  await expect(mappedCounts.locator('dd')).toHaveText(['2', '1', '0']);

  await expect(confirmButton).toBeEnabled();

  // (3) The open dialog stays WCAG 2.2 AA before anything is committed.
  const results = await new AxeBuilder({ page })
    // The review UI uses the native <dialog> primitive (implicit dialog role, no role attribute),
    // so scope the scan to the open modal element itself rather than a [role="dialog"] selector.
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // (4) Confirming commits the same file and opens the new plan.
  await confirmButton.click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/plans\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Sample', level: 1 })).toBeVisible();
});

// The same review→commit loop for a Microsoft Project MSPDI .xml file, proving the format-agnostic
// importSchedule router (ADR-0050 M3) drives the `.xml` path through the identical UI + pipeline.
test('a planner imports a schedule from a .xml (MSPDI) file and lands on the new plan', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewProject(page);

  await page.getByRole('button', { name: 'Import from file…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import schedule from file' });
  await expect(dialog).toBeVisible();

  const confirmButton = dialog.getByRole('button', { name: 'Confirm import' });
  await dialog.getByLabel('Schedule file (.xer or .xml)').setInputFiles(validMspdiFile());

  const mappedCounts = dialog.locator('dl[aria-label="Mapped"]');
  await expect(mappedCounts).toBeVisible();
  await expect(mappedCounts.locator('dd')).toHaveText(['2', '1', '0']);
  await expect(confirmButton).toBeEnabled();

  await confirmButton.click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/plans\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Sample MSP', level: 1 })).toBeVisible();
});

/**
 * The **web export surface** (ADR-0050 M4d): import a `.xer` to seed a plan with activities, open the
 * plan's canvas Export ▾ menu, and export it back out as `.xer` — asserting the new "Primavera P6 (XER)"
 * item triggers a real browser download named from the plan. An axe pass over the open menu keeps it
 * WCAG 2.2 AA. Seeds via the import-commit path (rather than hand-building a plan) so the export has a
 * populated network to serialise. The export→re-import round trip itself is proven at the pure-package
 * and API-e2e layers (see the closing comment). Chromium only (TECH_DEBT #25a).
 */
test('a planner exports a plan to .xer from the canvas Export menu', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewProject(page);

  // Seed: import the fixture .xer to create a plan (the export needs a populated network to serialise).
  await page.getByRole('button', { name: 'Import from file…' }).click();
  const seedDialog = page.getByRole('dialog', { name: 'Import schedule from file' });
  await seedDialog.getByLabel('Schedule file (.xer or .xml)').setInputFiles(validXerFile());
  await expect(seedDialog.getByRole('button', { name: 'Confirm import' })).toBeEnabled();
  await seedDialog.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/plans\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Sample', level: 1 })).toBeVisible();

  // Export: open the canvas Export ▾ menu and pick Primavera P6 (XER); assert a download is triggered
  // and its suggested filename ends `.xer`.
  await page.getByRole('button', { name: /Export/ }).click();

  // The open Export menu (incl. the new Interchange group) stays WCAG 2.2 AA — mirrors the import
  // dialog's axe check above.
  await expect(page.getByRole('menuitem', { name: 'Primavera P6 (XER)' })).toBeVisible();
  const menuAxe = await new AxeBuilder({ page })
    .include('[role="menu"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(menuAxe.violations).toEqual([]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Primavera P6 (XER)' }).click(),
  ]);
  // The download is a real browser download named from the plan, with the .xer extension — the M4d
  // deliverable. The round trip itself (these exported bytes re-import to an equivalent plan) is proven
  // exhaustively at the pure-package layer (@repo/interchange export round-trip specs) and the API e2e
  // (apps/api/test/interchange-export.e2e-spec.ts imports → exports → re-imports against a real Postgres),
  // so this browser journey deliberately stops at the download rather than re-driving a second project
  // through the UI.
  expect(download.suggestedFilename()).toMatch(/\.xer$/);
  expect(download.suggestedFilename()).toMatch(/sample/i);
});
