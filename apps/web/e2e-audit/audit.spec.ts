import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Flag-ON **audit log** journey (`VITE_AUDIT_LOG`, ADR-0072).
 *
 * The audit log is a claim about writes that happened somewhere else, so almost nothing about it is
 * testable against a mocked fetch: a mock cannot be wrong about a row it invented. What needs a
 * real API and a real database is:
 *
 * 1. **The producers fire inside the transactions that succeeded.** Six real actions — create an
 *    organisation, invite, accept, join, change a role, delete a client — and six rows that a
 *    reader can find afterwards. A producer wired outside the transaction, or onto a code path the
 *    UI does not take, is green in every unit test in the repository.
 * 2. **The `before` on a role change is the row's real prior value.** The detail line reads
 *    "Planner → Contributor" only if the service read the membership under its lock; a version
 *    that echoed the request DTO would render "Contributor → Contributor" and look plausible.
 * 3. **`audit:read` is enforced at the API, not by the hidden nav link.** The teammate's request is
 *    made from their own browser session and must come back **403** — not an empty list, which is
 *    the log's own worst failure mode: absence a reader cannot tell from nothing having happened.
 * 4. **`/me` is scoped by ACTOR, not by subject.** The teammate is the subject of the role change
 *    and did not perform it, so it must be absent from their own feed while the admin's sign-up —
 *    an event carrying no organisation at all — is present in the admin's.
 *
 * 5. **The filter narrows the SERVER's result set** (ADR-0073 C1), survives a reload from the URL,
 *    and distinguishes "no events match this filter" from "nothing recorded yet" — the distinction
 *    this milestone exists to make, and the one a mocked fetch cannot be wrong about.
 *
 * Two isolated browser contexts (two accounts). Chromium only (TECH_DEBT #25a).
 */

/** The organisation nav in the header — scoped so its links don't clash with breadcrumbs. */
function navLink(page: Page, name: string): Locator {
  return page
    .getByRole('navigation', { name: 'Organisation' })
    .getByRole('link', { name, exact: true });
}

/** A row of the audit table, found by the event title in its Event column. */
function auditRow(page: Page, title: string): Locator {
  return page.getByRole('row').filter({ has: page.getByText(title, { exact: true }) });
}

test('the audit log records real actions and only an Org Admin can read them', async ({
  browser,
}) => {
  const stamp = Date.now();
  const adminEmail = `audit-admin-${stamp}@example.com`;
  const mateEmail = `audit-mate-${stamp}@example.com`;
  const orgName = `Audit Co ${stamp}`;
  const orgSlug = `audit-co-${stamp}`;

  // ------------------------------------------------------------------ The admin's real actions
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();

  await admin.goto('/sign-up');
  await admin.getByLabel('Full name').fill('Audit Admin');
  await admin.getByLabel('Email').fill(adminEmail);
  await admin.getByLabel('Password').fill('correct-horse-battery');
  await admin.getByRole('button', { name: /create account/i }).click();

  await expect(admin.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await admin.getByLabel('Organisation name').fill(orgName);
  await admin.getByRole('button', { name: /create organisation/i }).click();
  await expect(admin).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  await navLink(admin, 'Members').click();
  await admin.getByRole('button', { name: 'Invite member' }).click();
  const invite = admin.getByRole('dialog');
  await invite.getByLabel('Email').fill(mateEmail);
  await invite.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await invite.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await admin.getByLabel('Invitation link').inputValue();
  expect(acceptUrl).toContain('/accept-invite?token=');

  // ------------------------------------------------------------------ The teammate joins for real
  const mateContext = await browser.newContext();
  const mate = await mateContext.newPage();
  await mate.goto('/sign-up');
  await mate.getByLabel('Full name').fill('Audit Mate');
  await mate.getByLabel('Email').fill(mateEmail);
  await mate.getByLabel('Password').fill('correct-horse-battery');
  await mate.getByRole('button', { name: /create account/i }).click();
  await expect(mate.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await mate.goto(acceptUrl);
  await mate.getByRole('button', { name: /accept and join/i }).click();
  await expect(mate).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  // The admin changes that membership's role — the event whose `before` is the point.
  await admin.reload();
  await admin.getByLabel('Role for Audit Mate').selectOption('CONTRIBUTOR');
  await expect(admin.getByLabel('Role for Audit Mate')).toHaveValue('CONTRIBUTOR');

  // And deletes a client, so the hierarchy family is exercised too.
  await navLink(admin, 'Clients').click();
  await admin.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await admin.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await admin.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await expect(admin.getByRole('link', { name: 'Northgate' })).toBeVisible();
  await admin.getByRole('button', { name: 'Delete Northgate' }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(admin.getByText(/No clients yet/)).toBeVisible();

  // ------------------------------------------------------- 1. Every one of them is on the screen
  await navLink(admin, 'Audit log').click();
  await expect(admin.getByRole('heading', { name: 'Audit log', level: 1 })).toBeVisible();

  await expect(auditRow(admin, 'Organisation created')).toBeVisible();
  await expect(auditRow(admin, 'Invitation sent')).toBeVisible();
  await expect(auditRow(admin, 'Invitation accepted')).toBeVisible();
  await expect(auditRow(admin, 'Client deleted')).toBeVisible();
  // A join is recorded per membership, so the admin's own and the teammate's are both here. Two
  // rows rather than one is the design (invitations.service.ts): "how did this person get access"
  // is a different question from "what happened to this invitation".
  await expect(admin.getByText('Member joined', { exact: true })).toHaveCount(2);

  // 2. The `before` came from the row, not the request. A service that echoed the DTO would render
  // "Contributor → Contributor" here and look entirely reasonable.
  await expect(auditRow(admin, 'Role changed')).toContainText('Planner → Contributor');
  await expect(auditRow(admin, 'Role changed')).toContainText(adminEmail);
  await expect(auditRow(admin, 'Role changed')).toContainText(mateEmail);

  // The screen is accessible (WCAG 2.2 AA, the rules axe can decide).
  const results = await new AxeBuilder({ page: admin }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // ------------------------------------------------- 5. The filter (ADR-0073 C1), against real rows
  // Three things here need a real API and real history. A category chip has to narrow the SERVER's
  // result set rather than hide rows the client already had; the filter has to survive a reload,
  // because deep-linking a narrowed view is the reason it lives in the URL; and a filter matching
  // nothing has to say so in different words from a log with nothing in it — the distinction this
  // whole milestone exists to make, and the one a mocked fetch cannot be wrong about.
  await expect(admin.getByRole('button', { name: 'Deletions' })).toBeVisible();
  // Sign-ins carries no organisation, so the organisation screen must not offer it — and the API
  // refuses the action outright if anything ever sends it.
  await expect(admin.getByRole('button', { name: 'Sign-ins' })).toHaveCount(0);

  await admin.getByRole('button', { name: 'Deletions' }).click();
  await expect(auditRow(admin, 'Client deleted')).toBeVisible();
  await expect(admin.getByText('Role changed', { exact: true })).toHaveCount(0);
  await expect(admin.getByText('Organisation created', { exact: true })).toHaveCount(0);

  // Deep-linkable: the choice is in the URL and a reload reproduces the same narrowed view.
  expect(new URL(admin.url()).searchParams.get('categories')).toBe('deletions');
  await admin.reload();
  await expect(admin.getByRole('button', { name: 'Deletions' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(auditRow(admin, 'Client deleted')).toBeVisible();
  await expect(admin.getByText('Role changed', { exact: true })).toHaveCount(0);

  // A range that predates the organisation matches nothing — and says THAT, not "nothing recorded
  // yet", which would tell an Org Admin their log was empty when it is full.
  await admin.getByLabel('From').fill('2020-01-01');
  await admin.getByLabel('To').fill('2020-01-02');

  // The sentence appears TWICE by design — once on screen and once in the live region — so both
  // are asserted rather than disambiguated away. The announcement is the half that regressed: it
  // said "Showing 0 events" for this state and for a genuinely empty log alike, which is the one
  // distinction this milestone exists to make.
  await expect(
    admin.locator('p:not([aria-live])', { hasText: /No events match this filter/ }),
  ).toBeVisible();
  await expect(admin.locator('p[aria-live="polite"]')).toHaveText(/No events match this filter/);
  await expect(admin.getByText(/Nothing here yet/)).toHaveCount(0);

  // The way out is INSIDE the empty state, not only in the bar above it — an empty state that
  // describes a dead end without offering the exit is prose, not a way out.
  await expect(admin.getByRole('button', { name: /Clear filters/ })).toHaveCount(2);

  // Clearing restores everything, in one action.
  await admin
    .getByRole('button', { name: /Clear filters/ })
    .last()
    .click();
  await expect(auditRow(admin, 'Role changed')).toBeVisible();
  await expect(auditRow(admin, 'Organisation created')).toBeVisible();
  expect(new URL(admin.url()).searchParams.get('categories')).toBeNull();

  // 4a. The admin's OWN feed carries the org-less authentication row — the one no organisation
  // log can ever show, because signing up happens before an organisation is known.
  await admin.getByRole('button', { name: /Account:/ }).click();
  await admin.getByRole('menuitem', { name: 'My activity' }).click();
  await expect(admin.getByRole('heading', { name: 'My activity', level: 1 })).toBeVisible();
  await expect(auditRow(admin, 'Account created')).toBeVisible();
  await expect(auditRow(admin, 'Role changed')).toBeVisible();
  await adminContext.close();

  // ---------------------------------------------- 3. The teammate is refused, by the API not the UI
  await mate.goto(`/orgs/${orgSlug}/audit-log`);
  await expect(mate.getByText(/Only an Org Admin can read/)).toBeVisible();
  // No table at all — an empty one would read as "nothing has happened here", which is exactly the
  // wrong answer to give someone who is not allowed to know.
  await expect(mate.getByRole('table')).toHaveCount(0);
  // The nav link is a courtesy, never the control.
  await expect(navLink(mate, 'Audit log')).toHaveCount(0);

  // And the endpoint itself refuses, in their own session with their own cookies.
  const status = await mate.evaluate(async (slug) => {
    const res = await fetch(`/api/v1/organizations/${slug}/audit-events?limit=5`);
    return res.status;
  }, orgSlug);
  expect(status).toBe(403);

  // 4b. Their own feed is scoped by ACTOR: they are the SUBJECT of the role change and did not
  // perform it, so it must not appear — the one assertion that separates "my history" from
  // "everything about me".
  await mate.getByRole('button', { name: /Account:/ }).click();
  await mate.getByRole('menuitem', { name: 'My activity' }).click();
  await expect(auditRow(mate, 'Invitation accepted')).toBeVisible();
  await expect(mate.getByText('Role changed', { exact: true })).toHaveCount(0);
  await mateContext.close();
});
