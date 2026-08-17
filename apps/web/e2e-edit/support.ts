import { expect, type Page } from '@playwright/test';

/**
 * Shared journey helpers for the flag-ON editing suite. These drive the plan
 * hierarchy the same way a planner would (no API short-cuts), so the journeys
 * exercise the real UI end to end.
 */

/** Sign up + create an organisation; returns the org slug. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `edit-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Edit Tester');
  await page.getByLabel('Email').fill(`edit-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Edit Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project → plan and open the plan detail. */
export async function openNewPlan(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
}

/** Set the plan's planned start (needed before the schedule can compute). */
export async function setPlannedStart(page: Page, isoDate: string): Promise<void> {
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill(isoDate);
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
}

/** Take the pen so the pen-gated editing affordances are live (flag-on). */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** Add an activity through the activities-table dialog (requires the pen when enforced). */
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

export async function addActivity(page: Page, name: string): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
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
