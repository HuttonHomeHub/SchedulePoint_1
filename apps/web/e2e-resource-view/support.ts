import { expect, type Page } from '@playwright/test';

import { chooseComboboxOption } from '../e2e/combobox';
import { activityEditor } from '../e2e-support/activity-editor';

/**
 * Journey helpers for the flag-ON **canvas-axis-aligned resource strip** suite
 * (`VITE_CANVAS_RESOURCE_VIEW`, Stage E, `docs/specs/canvas-resource-view/`). Mirrors the on-canvas
 * advanced activity types helpers (`e2e-loe/support.ts`) verbatim for onboarding + drawing — this surface
 * layers directly on top of that one — and adds the resource-library + assignment helpers this suite
 * needs to seed real histogram data (created through the real UI flows, not an API short-cut).
 */

/** Sign up + create an organisation; returns the org slug (name "Resource View Co" → "…-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `resource-view-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Resource View Tester');
  await page.getByLabel('Email').fill(`resource-view-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`Resource View Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/**
 * Create an organisation resource through the real library screen (`/orgs/$orgSlug/resources`),
 * reached from the persistent top nav. Kind defaults to Labour, which is enough to be assignable and to
 * drive the resource histogram. Done BEFORE opening a plan so the journey never has to navigate away
 * from — and back into — the plan workspace.
 */
export async function createResource(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Resources', exact: true }).click();
  await page.getByRole('button', { name: 'New resource' }).click();
  const dialog = page.getByRole('dialog', { name: 'New resource' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create resource' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

/** Create a client → project → plan and open it (mounts the canvas-first authoring workspace). */
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

/** Take the pen so the authoring affordances (Add, drawing) go live. */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/**
 * Draw a task on the canvas via the Add split-button (ADR-0032 M4): open the `Add▾` menu, pick Task
 * (which arms add mode), click the canvas at `pos`, then name + commit in the drop popover.
 */
export async function drawTask(
  page: Page,
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  // The Add control is a true split button (ADR-0064 T3): its primary region arms the tool, and the
  // caret — located here by its `Activity type: <kind>` label — opens the kind menu.
  await page.getByRole('button', { name: /^Activity type:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Task' }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Add to plan' }).click();
  await expect(form).toBeHidden();
}

/**
 * Assign an already-created library resource to a drawn activity through the real "Resources" row
 * action — expanding the collapsed-by-default activities panel first, like the toolbar suite's
 * `addActivity` helper. With the activity-editor convergence flag default-on (ADR-0062), this opens
 * the tabbed activity editor on its Resources tab (titled with the activity's own name) rather than
 * the standalone `ActivityResourcesDialog`, which is now the flag-off fallback. Budgeted units seed
 * the resource histogram this suite reads.
 */
export async function assignResource(
  page: Page,
  activityName: string,
  resourceName: string,
  budgetedUnits: number,
): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: `Actions for ${activityName}` }).click();
  await page.getByRole('menuitem', { name: 'Resources' }).click();

  const dialog = activityEditor(page);
  await expect(dialog).toBeVisible();
  // The assign form's resource picker lists each unassigned library resource as "<name> (<kind>)"; a
  // freshly created resource defaults to Labour. Behind `VITE_LIBRARY_SCOPING` it is the shared APG
  // combobox rather than a native `<select>` (ADR-0053 §4), so it is driven by role + exact label —
  // the dialog's "Driving resource" checkbox and the combobox's own "Show resources" toggle both
  // carry "Resource" in their names and would make a substring label match ambiguous.
  await chooseComboboxOption(dialog, 'Resource', `${resourceName} (Labour)`);
  await dialog.getByLabel('Budgeted units').fill(String(budgetedUnits));
  await dialog.getByRole('button', { name: 'Assign resource' }).click();
  await expect(dialog.locator('li').filter({ hasText: resourceName })).toBeVisible();
  // Exact match: the dialog also carries an unrelated "Close dialog" icon button (the `Dialog` chrome's
  // own ✕), whose accessible name would otherwise also satisfy a substring "Close" match.
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Place a drawn activity on a day and recalculate, through the public REST API, then reload so the
 * workspace reads the new schedule. The gesture that persists a placement is a canvas drag, which
 * `e2e-workspace-chrome/placement.spec.ts` already drives; what this suite asks is what the resource
 * histogram does with the stored placement, so the input is set exactly rather than approximated by
 * pixels.
 */
export async function placeAndRecalculate(
  page: Page,
  orgSlug: string,
  activityName: string,
  day: string,
): Promise<void> {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  const error = await page.evaluate(
    async ({
      org,
      planId,
      name,
      visualStart,
    }: {
      org: string;
      planId: string;
      name: string;
      visualStart: string;
    }) => {
      const list = await fetch(
        `/api/v1/organizations/${org}/plans/${planId}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!list.ok) return `list ${String(list.status)} ${await list.text()}`;
      const { data } = (await list.json()) as {
        data: { id: string; name: string; version: number }[];
      };
      const row = data.find((a) => a.name === name);
      if (!row) return `no activity named ${name}`;
      const patch = await fetch(`/api/v1/organizations/${org}/activities/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visualStart, version: row.version }),
      });
      if (!patch.ok) return `placement ${String(patch.status)} ${await patch.text()}`;
      const recalc = await fetch(
        `/api/v1/organizations/${org}/plans/${planId}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      return recalc.ok ? null : `recalculate ${String(recalc.status)} ${await recalc.text()}`;
    },
    { org: orgSlug, planId: match[1], name: activityName, visualStart: day },
  );
  if (error !== null) throw new Error(error);
  await page.reload();
}

/**
 * The bucket starts whose row of the open loading table carries units, read off the accessible
 * table's cells (the strip canvas is `aria-hidden`). The Total column is a row's first `td`.
 */
export async function loadedBuckets(page: Page): Promise<string[]> {
  const table = page.getByRole('region', { name: 'Resource loading' }).getByRole('table');
  await expect(table).toBeVisible();
  return table
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows
        .filter((row) => Number(row.querySelector('td')?.textContent ?? '0') > 0)
        .map((row) => (row.querySelector('th')?.textContent ?? '').trim()),
    );
}
