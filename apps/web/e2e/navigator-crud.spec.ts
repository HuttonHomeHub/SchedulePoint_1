import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Flag-on journeys for in-tree CRUD in the Project Explorer (ADR-0029 Phase 2,
 * `VITE_NAV_TREE_CRUD` — default on). A writer (the onboarding user is Org Admin)
 * shapes the whole Client → Project → Plan hierarchy from the rail: create the first
 * client from the header affordance, create a child from a row's context menu, rename
 * in place, and soft-delete with the cascade confirm — verifying the deleted node
 * lands in Recently Deleted. Requires the API (with a database) reachable via the dev
 * proxy. Default viewport is desktop (≥ lg), so the pinned rail is present.
 */

async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `nav-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Nav Tester');
  await page.getByLabel('Email').fill(`nav-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Nav Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** The pinned Project Explorer rail (scopes lookups away from page-level controls). */
function rail(page: Page) {
  return page.getByRole('navigation', { name: 'Project Explorer' });
}

/** Open a tree row's actions menu via its "⋯" button (revealed on hover). */
async function openRowMenu(page: Page, rowName: RegExp, actionsLabel: string): Promise<void> {
  const row = rail(page).getByRole('treeitem', { name: rowName });
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByRole('button', { name: actionsLabel }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('a writer builds client → project → plan entirely from the Project Explorer', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);

  // The empty org has no node to right-click: create the first client from the header.
  await rail(page).getByRole('button', { name: 'New client' }).click();
  const clientDialog = page.getByRole('dialog');
  await clientDialog.getByLabel('Name').fill('Northgate');
  await clientDialog.getByRole('button', { name: 'Create client' }).click();
  await expect(rail(page).getByRole('treeitem', { name: /Northgate/ })).toBeVisible();

  // New project from the client's row menu; the client auto-expands to reveal it.
  await openRowMenu(page, /Northgate/, 'Actions for Northgate');
  await page.getByRole('menuitem', { name: 'New project' }).click();
  const projectDialog = page.getByRole('dialog');
  await projectDialog.getByLabel('Name').fill('Riverside');
  await projectDialog.getByRole('button', { name: 'Create project' }).click();
  await expect(rail(page).getByRole('treeitem', { name: /Riverside/ })).toBeVisible();

  // New plan from the project's row menu → navigates to (and reveals) the new plan.
  await openRowMenu(page, /Riverside/, 'Actions for Riverside');
  await page.getByRole('menuitem', { name: 'New plan' }).click();
  const planDialog = page.getByRole('dialog');
  await planDialog.getByLabel('Name').fill('Logic');
  await planDialog.getByRole('button', { name: 'Create plan' }).click();
  await expect(page).toHaveURL(/\/plans\//);
  await expect(rail(page).getByRole('treeitem', { name: /Logic/ })).toBeVisible();

  // Accessibility check with the tree populated and row triggers present.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('a writer renames a client from the tree and the row relabels', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);

  await rail(page).getByRole('button', { name: 'New client' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Name').fill('Acme');
  await create.getByRole('button', { name: 'Create client' }).click();
  await expect(rail(page).getByRole('treeitem', { name: /Acme/ })).toBeVisible();

  await openRowMenu(page, /Acme/, 'Actions for Acme');
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('Name').fill('Acme Holdings');
  await edit.getByRole('button', { name: 'Save changes' }).click();

  await expect(rail(page).getByRole('treeitem', { name: /Acme Holdings/ })).toBeVisible();
});

test('a writer deletes a project from the tree (cascade) and it lands in Recently Deleted', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);

  // Seed a client + project from the tree.
  await rail(page).getByRole('button', { name: 'New client' }).click();
  const clientDialog = page.getByRole('dialog');
  await clientDialog.getByLabel('Name').fill('Northgate');
  await clientDialog.getByRole('button', { name: 'Create client' }).click();
  await openRowMenu(page, /Northgate/, 'Actions for Northgate');
  await page.getByRole('menuitem', { name: 'New project' }).click();
  const projectDialog = page.getByRole('dialog');
  await projectDialog.getByLabel('Name').fill('Riverside');
  await projectDialog.getByRole('button', { name: 'Create project' }).click();
  await expect(rail(page).getByRole('treeitem', { name: /Riverside/ })).toBeVisible();

  // Delete it via the row menu; the cascade confirm names the plans it will take.
  await openRowMenu(page, /Riverside/, 'Actions for Riverside');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete project' });
  await expect(confirm).toContainText('and all its plans');
  await confirm.getByRole('button', { name: 'Delete' }).click();

  // The project leaves the tree and appears in Recently Deleted, restorable there.
  await expect(rail(page).getByRole('treeitem', { name: /Riverside/ })).toHaveCount(0);
  await page.goto(`/orgs/${orgSlug}/recently-deleted`);
  await expect(page.getByText('Riverside')).toBeVisible();
});
