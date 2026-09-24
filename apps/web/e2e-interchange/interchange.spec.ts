import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { drawnSpanDays } from '@repo/layout';

import { layoutXerFile, onboard, openNewProject, validMspdiFile, validXerFile } from './support';

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

/**
 * **An imported P6 programme opens with no bar overlapping another in its row**
 * (layout-interchange M1, FC-5; `docs/specs/layout-interchange/`).
 *
 * The import packed rows on EARLY dates while the canvas draws the visual-effective ones, and broke
 * ties on ids minted during the import, so the 144-activity torture file opened with 37 to 39
 * activities overlapping others in their rows, and differently each time (m0-measurement.md). The
 * two-activity file above cannot show that, so this step imports the torture file through the same
 * dialog and reads the result back through the API, never the DOM (the ADR-0070 rule), counting
 * overlaps with the span the canvas draws by (`@repo/layout`'s `drawnSpanDays`).
 */
test('an imported P6 programme opens with no row overlap on the canvas (FC-5)', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewProject(page);

  await page.getByRole('button', { name: 'Import from file…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import schedule from file' });
  await dialog.getByLabel('Schedule file (.xer or .xml)').setInputFiles({
    name: 'p6_torture_test_v1.xer',
    mimeType: 'application/octet-stream',
    buffer: readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        'packages',
        'engine-conformance',
        'fixtures',
        'p6_torture_test_v1.xer',
      ),
    ),
  });
  const confirm = dialog.getByRole('button', { name: 'Confirm import' });
  await expect(confirm).toBeEnabled({ timeout: 20_000 });
  await confirm.click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/plans\/[^/]+$/, { timeout: 30_000 });
  const planId = new URL(page.url()).pathname.split('/').pop()!;

  interface Row {
    code: string;
    type: string;
    laneIndex: number;
    visualEffectiveStart: string | null;
    visualEffectiveFinish: string | null;
  }
  const rows: Row[] = [];
  let cursor: string | null = null;
  do {
    const query: string = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const res = await page.request.get(
      `/api/v1/organizations/${orgSlug}/plans/${planId}/activities?limit=100${query}`,
    );
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      data: Row[];
      meta: { hasMore: boolean; nextCursor: string | null };
    };
    rows.push(...body.data);
    cursor = body.meta.hasMore ? body.meta.nextCursor : null;
  } while (cursor !== null);
  // 126 tasks and 18 WBS summaries (the import report's own `mapped` counts). More than one page, so
  // the paging above is exercised: a single `limit=100` read is how M0-T4 first mis-measured this.
  expect(rows).toHaveLength(144);

  const dayOf = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  const byLane = new Map<number, { code: string; start: number; end: number }[]>();
  for (const r of rows) {
    const span = drawnSpanDays(
      { type: r.type, start: r.visualEffectiveStart, finish: r.visualEffectiveFinish },
      dayOf,
    );
    if (span === null) continue;
    byLane.set(r.laneIndex, [
      ...(byLane.get(r.laneIndex) ?? []),
      { code: r.code, start: span.startDay, end: span.endDay },
    ]);
  }
  const overlapping = [...byLane.values()].flatMap((lane) =>
    lane.flatMap((a, i) =>
      lane
        .slice(i + 1)
        .flatMap((b) => (a.start <= b.end && b.start <= a.end ? [`${a.code}/${b.code}`] : [])),
    ),
  );
  expect(overlapping).toEqual([]);
});

/**
 * **A SchedulePoint XER restores its layout** (layout-interchange M2; `docs/specs/layout-interchange/`).
 *
 * The file carries a hand-placed start and a row per activity in two user-defined fields. The dialog
 * offers the option only because the dry-run found them, and unticking it re-runs the dry-run without
 * them while the option stays offered — the one behaviour a unit test can only approximate, since it
 * depends on the real server returning no layout counts for the IGNORE report. The restored values are
 * read back through the API, never the DOM (the ADR-0070 rule).
 */
test('a SchedulePoint .xer restores its placed starts and rows, and the option can switch them off', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewProject(page);

  await page.getByRole('button', { name: 'Import from file…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import schedule from file' });
  await dialog.getByLabel('Schedule file (.xer or .xml)').setInputFiles(layoutXerFile());

  const mapped = dialog.locator('dl[aria-label="Mapped"]');
  const option = dialog.getByLabel('Restore the SchedulePoint layout');
  await expect(option).toBeChecked();
  await expect(mapped.getByText('Placed starts')).toBeVisible();
  await expect(mapped.getByText('Lanes')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // Off: the report re-runs without the layout, and says the file carried one it will not apply.
  await option.uncheck();
  await expect(mapped.getByText('Placed starts')).toBeHidden();
  await expect(
    dialog.getByText(/SchedulePoint layout for 2 activities; it was not applied/),
  ).toBeVisible();
  await expect(option).not.toBeChecked();

  // Back on, and import.
  await option.check();
  await expect(mapped.getByText('Placed starts')).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/plans\/[^/]+$/);
  const planId = new URL(page.url()).pathname.split('/').pop()!;

  const res = await page.request.get(
    `/api/v1/organizations/${orgSlug}/plans/${planId}/activities?limit=100`,
  );
  expect(res.ok()).toBe(true);
  const rows = (
    (await res.json()) as {
      data: { code: string; visualStart: string | null; laneIndex: number }[];
    }
  ).data;
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
  expect(byCode['A1000']).toMatchObject({ visualStart: '2026-01-12', laneIndex: 2 });
  expect(byCode['A1010']).toMatchObject({ visualStart: null, laneIndex: 0 });
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
  // ADR-0090 M2-T4 folded Export, Print and Share into one `Share & export` trigger — three Row-2
  // stops for one act. The formats inside are unchanged, so only the way in changes here.
  await page.getByRole('button', { name: /Share & export/ }).click();

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

/**
 * **The SchedulePoint → SchedulePoint round trip** (layout-interchange M3, FC-1 in a browser).
 *
 * A plan whose bars were placed is exported through **Share & export ▾ → Primavera P6 (XER)**, and
 * the downloaded bytes are imported into a second project through **Import from file…** — the two
 * entry points a planner uses, with nothing in between. The restored values are read back through
 * the API (the ADR-0070 rule), per activity code, because the two plans share no ids.
 */
test('an exported .xer re-imports with its placed starts and lanes', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewProject(page);
  const projectUrl = page.url();

  // Seed a placed plan: the layout fixture restores A1000's placement and both rows.
  await page.getByRole('button', { name: 'Import from file…' }).click();
  const seed = page.getByRole('dialog', { name: 'Import schedule from file' });
  await seed.getByLabel('Schedule file (.xer or .xml)').setInputFiles(layoutXerFile());
  await expect(seed.getByRole('button', { name: 'Confirm import' })).toBeEnabled();
  await seed.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/plans\/[^/]+$/);

  await page.getByRole('button', { name: /Share & export/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Primavera P6 (XER)' }).click(),
  ]);
  const bytes = readFileSync(await download.path());
  expect(bytes.toString('utf8')).toMatch(/^%T\tUDFVALUE$/m);

  // A second project, so the re-imported plan's name does not collide with the source's.
  await page.goto(projectUrl);
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Eastside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Eastside' }).click();

  await page.getByRole('button', { name: 'Import from file…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import schedule from file' });
  await dialog
    .getByLabel('Schedule file (.xer or .xml)')
    .setInputFiles({ name: 'exported.xer', mimeType: 'application/octet-stream', buffer: bytes });
  await expect(dialog.getByLabel('Restore the SchedulePoint layout')).toBeChecked();
  await dialog.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/plans\/[^/]+$/);
  const planId = new URL(page.url()).pathname.split('/').pop()!;

  const res = await page.request.get(
    `/api/v1/organizations/${orgSlug}/plans/${planId}/activities?limit=100`,
  );
  expect(res.ok()).toBe(true);
  const rows = (
    (await res.json()) as {
      data: { code: string; visualStart: string | null; laneIndex: number }[];
    }
  ).data;
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
  expect(byCode['A1000']).toMatchObject({ visualStart: '2026-01-12', laneIndex: 2 });
  expect(byCode['A1010']).toMatchObject({ visualStart: null, laneIndex: 0 });
});
