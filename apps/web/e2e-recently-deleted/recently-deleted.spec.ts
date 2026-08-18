import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * **Recently deleted** journey (ADR-0096).
 *
 * Three things are testable only here, against a real API and a real database:
 *
 * 1. **A cascade is ONE deletion.** Deleting a client soft-deletes its projects and plans under a
 *    single `delete_batch_id`, and the restore is keyed on that column — so the screen must show
 *    one row, not three, and one press must bring all three back. Every part of that is the
 *    server's; a mocked fetch hands the client whatever batch ids the test invented.
 * 2. **The cross-batch blocker is real.** A plan deleted on its own keeps its own batch; deleting
 *    its client afterwards does not re-stamp it. That is the one case grouping cannot dissolve, it
 *    is computed in a raw `UNION ALL`, and the two-press restore is the product's answer to "the
 *    system should handle that dependency automatically".
 * 3. **The countdown is the SERVER's number.** This suite's API runs with a 3,650-day period, so
 *    the sentence on screen has to say 3,650 — a client-side constant would say 90 and look right.
 *
 * Chromium only (TECH_DEBT #25a).
 */

/** The organisation nav in the header — scoped so its links don't clash with breadcrumbs. */
function navLink(page: Page, name: string): Locator {
  return page
    .getByRole('navigation', { name: 'Organisation' })
    .getByRole('link', { name, exact: true });
}

/** A row of the recycle-bin table, found by the deleted thing's name. */
function binRow(page: Page, name: string): Locator {
  return page
    .getByRole('table', { name: /recently deleted/i })
    .getByRole('row')
    .filter({ hasText: name });
}

async function signUpAndCreateOrg(page: Page, email: string, orgName: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Bin Admin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
}

test('a cascade is one deletion, and a cross-batch block is two presses', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = `bin-co-${stamp}`;
  await signUpAndCreateOrg(page, `bin-admin-${stamp}@example.com`, `Bin Co ${stamp}`);
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  // ------------------------------------------------------------------ A real client → project → plan
  await navLink(page, 'Clients').click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate', exact: true }).click();

  await page.getByRole('main').getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside', exact: true }).click();

  await page.getByRole('main').getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Programme A');
  // The plan's data date (ADR-0033), which `planFormSchema` requires. This journey's first run
  // could not get past this dialog, because the label read "Planned start (optional)" over a
  // required field — fixed in the same commit rather than worked around here.
  await page.getByRole('dialog').getByLabel('Planned start').fill('2026-01-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByRole('link', { name: 'Programme A', exact: true })).toBeVisible();

  // ------------------------------------------------------------------ Delete the client
  await navLink(page, 'Clients').click();
  await deleteFromTable(page, 'Northgate');

  await navLink(page, 'Recently deleted').click();

  // **One row, not three.** The whole premise: the project and the plan are in the same batch, are
  // not independently restorable, and listing them separately put a Restore button on rows that
  // were never actionable.
  await expect(binRow(page, 'Northgate')).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: 'Riverside' })).toHaveCount(0);

  // What it took is disclosed rather than hidden — and named by kind, because "+ 2 items" does not
  // tell a reader whether a one-press restore is welcome.
  // The name is prefixed with the deletion's subject: read alone, "and 1 project, 1 plan" has no
  // antecedent, and it is a strict substring of the Restore button's name one cell along. This
  // query resolving to two controls is how that was found.
  const disclosure = page.getByRole('button', {
    name: 'Northgate: and 1 project, 1 plan',
    exact: true,
  });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listitem').filter({ hasText: 'Riverside' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Programme A' })).toBeVisible();

  // **The countdown is the server's number.** This suite's API is configured with 3,650 days; a
  // constant in the client would render 90 here and read as correct.
  await expect(
    page.getByText('Deleted items are kept for 3650 days, then permanently removed.'),
  ).toBeVisible();

  // ------------------------------------------------------------------ One press brings all three back
  await page
    .getByRole('button', { name: 'Restore client Northgate and 1 project, 1 plan' })
    .click();
  await expect(binRow(page, 'Northgate')).toHaveCount(0);

  await navLink(page, 'Clients').click();
  await page.getByRole('link', { name: 'Northgate', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Riverside', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Riverside', exact: true }).click();
  // The plan came back too — the restore is keyed on the batch, so it either brings the whole
  // subtree or the grouping was a lie.
  await expect(page.getByRole('link', { name: 'Programme A', exact: true })).toBeVisible();

  // ------------------------------------------------------------------ The cross-batch case
  // The plan goes on its own, so it holds its OWN batch id. Deleting the client afterwards does
  // not re-stamp an already-deleted row — which is precisely what makes this case exist.
  await deleteFromTable(page, 'Programme A');
  await navLink(page, 'Clients').click();
  await deleteFromTable(page, 'Northgate');

  await navLink(page, 'Recently deleted').click();
  await expect(binRow(page, 'Northgate')).toHaveCount(1);
  const blocked = binRow(page, 'Programme A');
  await expect(blocked).toHaveCount(1);

  // The old screen said "Restore its parent first" and left the reader to find it. It now names
  // the blocker and offers to act.
  //
  // The blocker is **Riverside**, the plan's immediate parent — not Northgate, the root of the
  // deletion Riverside came back in. That distinction is the point of the two-press flow and this
  // assertion had it wrong: the button names the row that must exist, the dialog then names the
  // whole deletion that restoring it brings back, which is more than the reader asked for and is
  // exactly why it is a confirmation rather than a one-press action.
  const ancestorButton = blocked.getByRole('button', { name: /Restore Riverside first/ });
  await expect(ancestorButton).toHaveAttribute('aria-haspopup', 'dialog');
  await ancestorButton.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The deletion that has to come back is Northgate's, which took Riverside with it.
  await expect(dialog).toContainText('Northgate');
  await expect(dialog).toContainText('Riverside');
  await dialog.getByRole('button', { name: /restore/i }).click();

  // The blocker went; the plan is now restorable on its own, which is the state the two presses
  // were for. Its restore label names only itself — it is a batch of one.
  await expect(binRow(page, 'Northgate')).toHaveCount(0);
  await expect(
    binRow(page, 'Programme A').getByRole('button', { name: /^Restore plan/ }),
  ).toBeVisible();
});

/**
 * Delete a hierarchy row from its table and confirm.
 *
 * Located by the control's accessible name on purpose: this is the path a planner takes, and a
 * shortcut through the API would prove nothing about whether the screen still offers the action.
 * The tables render Edit/Delete buttons directly rather than a row menu — the Project Explorer's
 * "Actions for X" menu is a different surface, and the first draft of this helper assumed they
 * were the same.
 */
async function deleteFromTable(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirm).toBeHidden();
}
