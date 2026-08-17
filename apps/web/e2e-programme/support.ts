import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **programme scheduling** suite (`VITE_PROGRAMME_SCHEDULING`,
 * inter-project M2, ADR-0045 F8) on the plan workspace. Same hierarchy-driving approach as the
 * other flag-on suites. The canvas and pen stay pinned off in the config — deliberately, this
 * journey is about cross-plan links and not about authoring — so activities are added through the
 * activities panel, which is collapsed by default (see `showActivities`).
 */

export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `programme-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Programme Tester');
  await page.getByLabel('Email').fill(`programme-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Programme Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create the shared client + project and land on the project page (where plans are created). */
export async function openProject(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
}

/** Create a plan under the current project and open it. */
export async function createAndOpenPlan(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/**
 * Make the activities table visible.
 *
 * The panel is **collapsed by default** on the plan workspace (ADR-0030), and it returns to that
 * default on every reload — which is what this suite does mid-test to defeat the client cache. So
 * this is needed in two places, not one: before the New-activity button can be clicked, and again
 * after any `page.reload()` before the table can be read. Idempotent, so calling it when the panel
 * is already open costs nothing.
 */
export async function showActivities(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  // **Wait on the TOGGLE, not on the table.** Two traps, both paid for:
  //
  // 1. `DataTable` returns its empty state instead of a `<table>` when there are no rows
  //    (`data-table.tsx:86`), so an empty plan has no table to wait for — and this helper runs
  //    before the first activity exists.
  // 2. `isVisible()` is a snapshot, not a wait. Called straight after `page.reload()` it answers
  //    "no" because the app has not painted, the expand is skipped, and the missing table then
  //    reads exactly like the edit under test having failed to persist.
  //
  // The toggle is present in one state or the other whenever the workspace has rendered, which is
  // the invariant worth waiting on. Idempotent.
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

/** Add an activity (optionally with a longer duration) to the open plan's activities table. */
export async function addActivity(page: Page, name: string, durationDays?: number): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  if (durationDays !== undefined) {
    // Either label — see the note in `e2e-activity-editor/support.ts`. A bare number still means
    // days on both paths (ADR-0070), so the value written is the same either way.
    await dialog.getByLabel(/^Duration( \(working days\))?$/).fill(String(durationDays));
  }
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

/** Recalculate the open plan's own schedule (the header Recalculate control). */
export async function recalculate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
}

/**
 * Wait until the open plan actually has a computed schedule.
 *
 * `recalculate` only presses the button; the sequencing checkpoint that followed it used to be
 * `getByText('Project finish')`, the legacy stacked page's `ScheduleSummaryStrip` label. The
 * workspace shows that fact as the toolbar's finish chip instead — which renders the DATE, carries
 * the words only as an accessible name, and **withholds itself below the `compact` density band**
 * (ADR-0092: a `render` item cannot demote, so its only way to yield width is to disappear). At
 * this suite's viewport it is legitimately absent, so no locator for it can work.
 *
 * Asserting the computed dates at the API is both width-independent and a stronger claim than the
 * label ever made: it proves the schedule computed rather than that a word rendered.
 */
export async function awaitComputedSchedule(page: Page, orgSlug: string): Promise<void> {
  const planId = new URL(page.url()).pathname.split('/plans/')[1]?.split('/')[0];
  if (!planId) throw new Error(`no plan id in ${page.url()}`);
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ({ slug, id }: { slug: string; id: string }) => {
            const res = await fetch(`/api/v1/organizations/${slug}/plans/${id}/activities`, {
              credentials: 'include',
            });
            if (!res.ok) return 0;
            const body = (await res.json()) as { data: { earlyFinish: string | null }[] };
            return body.data.filter((a) => a.earlyFinish !== null).length;
          },
          { slug: orgSlug, id: planId },
        ),
      { message: 'the recalculation never produced computed dates', timeout: 20_000 },
    )
    .toBeGreaterThan(0);
}
