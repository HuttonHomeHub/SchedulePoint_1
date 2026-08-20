import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { activityEditor } from '../e2e-support/activity-editor';

import {
  addActivity,
  createAndOpenPlan,
  createEightHourCalendar,
  ensurePen,
  onboard,
  showActivities,
  openEdit,
  openProject,
  planIdOf,
} from './support';

/**
 * Flag-ON **sub-day durations and lags** journey (`VITE_SUB_DAY_DURATIONS`, ADR-0070).
 *
 * It proves the claims that only a real API and a real database can settle — a mocked fetch accepts
 * any body, echoes back whatever it was handed, and honours any optimistic `version`:
 *
 * 1. **A four-hour duration is stored as four hours.** Typed, saved, reloaded, read back — on a
 *    calendar whose day is 480 minutes, not 1440. A wrong factor would not error anywhere; it would
 *    store three times the work and look right on screen, which is the trap the epic is about.
 * 2. **A bare number still means days.** The property that makes this not a migration. It has to
 *    hold against the real conversion, not against a parser test.
 * 3. **The value survives an edit that does not touch it.** Renaming an activity re-sends the whole
 *    definition (the full-definition PATCH), so a duration the form had rounded on seed would be
 *    flattened by an unrelated save — silently.
 * 4. **A sub-day lag round-trips too**, and reads back in the Lag column rather than as `0d`.
 * 5. **The 24-hour lag calendar measures elapsed time.** `1d` there is 1,440 minutes even though
 *    the plan's own day is 480 — the one factor that is pinned rather than resolved.
 *
 * Serial (one org's plan mutates throughout); Chromium only (TECH_DEBT #25a).
 */
test('a sub-day duration and lag round-trip through the real API', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  const calendarId = await createEightHourCalendar(page, orgSlug);
  await openProject(page);
  await createAndOpenPlan(page, 'Fit-out', orgSlug, calendarId);
  await ensurePen(page);

  // ------------------------------------------------- 1. Four hours is four hours, not four days
  await addActivity(page, 'Lift plant', '4h');
  await addActivity(page, 'Commission', '90m');
  // 2. A bare number is still days — 480 minutes here, which is what it has always meant.
  await addActivity(page, 'Snagging', '2');

  // Reload, so nothing below can be served from the client's own cache. The pen is a server-side
  // lease that survives the reload, but the client re-derives its write gate from scratch — so
  // re-assert it before touching a writer surface. `ensurePen` returns immediately if it is held.
  await page.reload();
  await ensurePen(page);
  // The panel's collapsed default comes back with the reload, so the table below is not in the DOM
  // until this runs. On the legacy stacked page the table was simply always there.
  await showActivities(page);

  // The table reads back what was typed (M4). `0 d` here would be the pre-epic defect, and is also
  // what the same column prints for a milestone.
  await expect(rowCell(page, 'Lift plant')).toContainText('4h');
  await expect(rowCell(page, 'Commission')).toContainText('1h 30m');
  await expect(rowCell(page, 'Snagging')).toContainText('2 d');

  // And the stored minutes are the ones the engine will schedule — read from the API, not the DOM,
  // because the DOM is the thing under test.
  const stored = await page.evaluate(
    async ({ slug, planId }) => {
      const res = await fetch(`/api/v1/organizations/${slug}/plans/${planId}/activities`);
      const body = (await res.json()) as {
        data: { name: string; durationMinutes: number; durationDays: number }[];
      };
      return Object.fromEntries(body.data.map((a) => [a.name, a.durationMinutes]));
    },
    { slug: orgSlug, planId: planIdOf(page.url()) },
  );
  expect(stored['Lift plant']).toBe(240);
  expect(stored['Commission']).toBe(90);
  expect(stored['Snagging']).toBe(960); // two EIGHT-hour days, not two 24-hour ones

  // ------------------------------------- 3. An unrelated edit must not flatten the sub-day value
  await openEdit(page, 'Lift plant');
  const editDialog = activityEditor(page);
  // The field is seeded with the exact value, in the grammar it was typed in.
  await expect(editDialog.getByLabel('Duration', { exact: true })).toHaveValue('4h');
  await editDialog.getByLabel('Name').fill('Lift plant (revised)');
  // **Per scope, not per dialog** (ADR-0060 §3): the editor's Save commits the General scope and
  // leaves the editor open, because the scopes it spans do not share a permission. So the close is
  // explicit here where the legacy dialog closed itself — the same edit, one more click.
  await editDialog.getByRole('button', { name: 'Save general' }).click();
  await expect(editDialog.getByText('Saved.')).toBeVisible();
  await editDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editDialog).toBeHidden();

  await page.reload();
  // Second reload, second collapse — the panel default is per-load, not per-session.
  await showActivities(page);
  await expect(rowCell(page, 'Lift plant (revised)')).toContainText('4h');

  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

test('a sub-day lag round-trips, and the 24-hour calendar measures elapsed time', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  const calendarId = await createEightHourCalendar(page, orgSlug);
  await openProject(page);
  await createAndOpenPlan(page, 'Fit-out', orgSlug, calendarId);
  await ensurePen(page);
  await addActivity(page, 'Pour slab', '2');
  await addActivity(page, 'Strike formwork', '1');

  // ------------------------------------------------------------------ 4. A four-hour cure lag
  await openLogic(page, 'Strike formwork');
  const logic = activityEditor(page);
  await logic.getByLabel('Predecessor activity').selectOption({ label: 'Pour slab' });
  await logic.getByLabel(/^Lag \(/).fill('4h');
  await logic.getByRole('button', { name: 'Add link' }).click();
  // The new row IS the feedback, and it carries the lag rather than "0d". Scoped to the
  // Predecessors table: the row's own action buttons ("Edit link to Pour slab") name it too.
  const predecessors = logic.getByRole('region', { name: 'Predecessors' });
  await expect(predecessors.getByRole('cell', { name: 'Pour slab', exact: true })).toBeVisible();
  await expect(predecessors.getByText('+4h')).toBeVisible();

  const lagOf = async (): Promise<number[]> =>
    page.evaluate(
      async ({ slug, planId }) => {
        const res = await fetch(`/api/v1/organizations/${slug}/plans/${planId}/dependencies`);
        const body = (await res.json()) as { data: { lagMinutes: number }[] };
        return body.data.map((d) => d.lagMinutes);
      },
      { slug: orgSlug, planId: planIdOf(page.url()) },
    );
  expect(await lagOf()).toEqual([240]);

  // ------------------------------------------- 5. Switching to 24-hour re-measures the same text
  await logic
    .getByRole('button', { name: /^Edit link/ })
    .first()
    .click();
  const edit = page.getByRole('dialog', { name: 'Edit dependency' });
  await edit.getByLabel('Lag calendar').selectOption('TWENTY_FOUR_HOUR');
  await edit.getByLabel(/^Lag \(/).fill('1d');
  await edit.getByRole('button', { name: 'Save changes' }).click();

  // 1,440 — elapsed — NOT the plan calendar's 480. A seven-day concrete cure is seven calendar
  // days, which is the entire reason that option exists and the trap ADR-0070 §5 names.
  await expect.poll(lagOf).toEqual([1440]);
});

/**
 * A named activity's row **in the activities table**.
 *
 * Scoped by the table's own caption, because the earned-value table below repeats every activity
 * name — an unscoped `getByRole('row')` matches both and fails strict mode.
 */
function rowCell(page: Page, name: string) {
  return page
    .getByRole('table', { name: /Activities/ })
    .getByRole('row')
    .filter({ hasText: name });
}

/** Open the Logic surface for an activity from its row actions menu. */
async function openLogic(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  await expect(activityEditor(page)).toBeVisible();
}
