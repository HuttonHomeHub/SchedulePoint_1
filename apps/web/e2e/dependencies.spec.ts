import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The Logic panel journey (read): onboard, create a plan with an activity, open
 * the activity's Logic panel from the activities table, and see the (empty)
 * predecessors/successors sections — with an accessibility check on the open
 * panel. Adding links end-to-end is covered once the editor lands (C2). Requires
 * the API (with a database) running and reachable via the dev proxy.
 */
test('a user can open an activity’s Logic panel (accessible)', async ({ page }) => {
  const stamp = Date.now();
  const email = `logic-${stamp}@example.com`;
  const orgName = `Logic Co ${stamp}`;
  const orgSlug = `logic-co-${stamp}`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Logic Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

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
  await page.getByRole('dialog').getByLabel('Name').fill('Baseline');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Baseline' }).click();

  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Excavate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();

  // Open the Logic panel for the activity — row actions live behind an overflow
  // "Actions for …" menu (TECH_DEBT #38): open it, then choose Logic.
  await page.getByRole('button', { name: 'Actions for Excavate' }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Logic for Excavate/ })).toBeVisible();
  await expect(dialog.getByText(/No predecessors/)).toBeVisible();
  await expect(dialog.getByText(/No successors/)).toBeVisible();

  // The open Logic panel is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

test('a planner adds a dependency, is stopped from making a loop, and removes it', async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `logic2-${stamp}@example.com`;
  const orgSlug = `logic-two-${stamp}`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Planner Two');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Logic Two ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

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
  await page.getByRole('dialog').getByLabel('Name').fill('Baseline');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Baseline' }).click();

  for (const name of ['Excavate', 'Pour slab']) {
    await page.getByRole('button', { name: 'New activity' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }

  const dialog = page.getByRole('dialog');

  // Add Excavate as a predecessor of Pour slab (Excavate → Pour slab).
  await page.getByRole('button', { name: 'Actions for Pour slab' }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  await dialog.getByRole('button', { name: 'Add predecessor' }).click();
  await dialog.getByLabel('Predecessor activity').selectOption({ label: 'Excavate' });
  await dialog.getByRole('button', { name: 'Add dependency' }).click();
  await expect(dialog.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();

  // Adding Excavate as a SUCCESSOR too would close a loop — the API stops it, shown inline.
  await dialog.getByRole('button', { name: 'Add successor' }).click();
  await dialog.getByLabel('Successor activity').selectOption({ label: 'Excavate' });
  await dialog.getByRole('button', { name: 'Add dependency' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/cycle/i);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Removing the predecessor link takes it away again.
  await dialog.getByRole('button', { name: 'Remove link to Excavate' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(dialog.getByText(/No predecessors/)).toBeVisible();
});
