import { expect, test } from '@playwright/test';

import { onboard } from './support';

/**
 * **The defect the product owner reported, driven end to end.**
 *
 * They signed in, the landing said "1 invitation pending", they followed its own link to Members,
 * and found only themselves. Three separate causes, none of which a unit test could see:
 *
 *   1. `GET …/organizations/:slug/invitations` has shipped since ADR-0016 and **nothing in
 *      `apps/web` had ever called it** — a route with no entry point (ADR-0081, with the halves
 *      the other way round from the usual instance). Members had no way to show an invitation.
 *   2. The landing's count filtered on `status` alone while the list also filtered
 *      `deletedAt: null`, so the two could disagree about the same rows.
 *   3. Neither read `expiresAt`, so an invitation `accept()` refuses was counted as something to
 *      chase.
 *
 * **The round trip is the point, and it is why this lives in the overview suite rather than a
 * Members suite of its own**: the assertion worth making spans both screens — the landing says N,
 * you click its link, you act, you come back, and it says N−1. Split across two suites each could
 * assert only half, and the half that matters is the join.
 *
 * `apiFetch`'s prefix trap (`API_BASE_URL` is already `/api/v1`; the staff console once shipped a
 * doubled prefix whose own tests agreed with it) is visible to nothing but a run like this one.
 */
test.describe('invitations, from the landing to Members and back', () => {
  test('the landing count is true, and Members can answer it', async ({ page }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);

    // ---- Invite two people through the product's own dialog. -------------------------------
    await page.goto(`/orgs/${orgSlug}/members`);
    await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();

    // Locators taken from `e2e-audit/audit.spec.ts:80-85`, which drives this same dialog and is
    // known to work — rather than guessed at by reading the component.
    for (const email of [`first-${stamp}@example.com`, `second-${stamp}@example.com`]) {
      await page.getByRole('button', { name: 'Invite member' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Email').fill(email);
      await dialog.getByRole('button', { name: /send invitation/i }).click();
      // The dialog then shows the one-time accept URL; `Done` closes it.
      await expect(page.getByLabel('Invitation link')).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
    }

    // ---- Members can now SHOW them. This is the half that did not exist. --------------------
    const invitations = page.getByRole('table', { name: 'Pending invitations' });
    await expect(invitations).toBeVisible();
    await expect(invitations.getByText(`first-${stamp}@example.com`)).toBeVisible();
    await expect(invitations.getByText(`second-${stamp}@example.com`)).toBeVisible();

    // ---- The landing agrees with that list, in words a reader can act on. -------------------
    await page.goto(`/orgs/${orgSlug}`);
    const landingCount = page.getByRole('link', {
      name: '2 invitations are waiting to be accepted',
    });
    await expect(landingCount).toBeVisible();

    // Its own link is what the reader follows, so the journey follows it too rather than
    // navigating by URL — a link to the wrong place is exactly the kind of defect that survives
    // every unit test (`e2e-public`'s `signOut()` helper shipped matching nothing, ADR-0077 M8).
    await landingCount.click();
    await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}/members$`));
    await expect(page.getByRole('table', { name: 'Pending invitations' })).toBeVisible();

    // ---- Revoke one, and the landing must notice. --------------------------------------------
    await page
      .getByRole('button', { name: `Revoke the invitation to first-${stamp}@example.com` })
      .click();
    // **`alertdialog`, not `dialog`.** `ConfirmDialog` sets `role="alertdialog"` explicitly
    // (`confirm-dialog.tsx:46`), which OVERRIDES the native `<dialog>`'s implicit `dialog` role, and
    // ARIA role matching is exact rather than by inheritance. The invite dialog above uses the plain
    // `Dialog` and really is `dialog` — so this one journey spans two primitives with two roles, and
    // assuming one is how the first run failed here. The unit suite could not catch it: it asserts
    // the copy with an UNSCOPED `screen.getByText`, so it never says where the text lives.
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText(/will stop working/)).toBeVisible();
    await confirm.getByRole('button', { name: 'Revoke', exact: true }).click();

    await expect(
      page
        .getByRole('table', { name: 'Pending invitations' })
        .getByText(`first-${stamp}@example.com`),
    ).toBeHidden();

    // Focus is not on `<body>` — the revoked row unmounted with the button that was focused
    // inside it (WCAG 2.2 §2.4.3, the class recorded in ADR-0096 / ADR-0099 M10 / ADR-0143). A
    // real browser is the only place this can be asserted at all.
    await expect
      .poll(async () => page.evaluate(() => document.activeElement?.tagName ?? null))
      .not.toBe('BODY');

    await page.goto(`/orgs/${orgSlug}`);
    await expect(
      page.getByRole('link', { name: '1 invitation is waiting to be accepted' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /invitations are waiting/ })).toBeHidden();
  });

  /**
   * **The section is omitted for a Planner, not shaded and not empty.**
   *
   * `invitation:read` and `invitation:revoke` are one Org-Admin-only bundle
   * (`invitation-permissions.structural.spec.ts` pins that), so a Planner has no business being
   * shown a frame headed "Pending invitations" — it would assert there is an answer they may not
   * have. The roster above it is still theirs to read, which is what makes this an omission of a
   * section rather than of the screen.
   */
  test('a Planner sees the roster and no invitations section at all', async ({ browser }) => {
    const stamp = Date.now();
    const adminPage = await (await browser.newContext()).newPage();
    const orgSlug = await onboard(adminPage, stamp);

    await adminPage.goto(`/orgs/${orgSlug}/members`);
    await adminPage.getByRole('button', { name: 'Invite member' }).click();
    const dialog = adminPage.getByRole('dialog');
    await dialog.getByLabel('Email').fill(`planner-${stamp}@example.com`);
    await dialog.getByLabel('Role', { exact: true }).selectOption('PLANNER');
    await dialog.getByRole('button', { name: /send invitation/i }).click();
    const acceptUrl = await adminPage.getByLabel('Invitation link').inputValue();
    expect(acceptUrl).toContain('/accept-invite?token=');

    const plannerPage = await (await browser.newContext()).newPage();
    await plannerPage.goto('/sign-up');
    await plannerPage.getByLabel('Full name').fill('Pat Planner');
    await plannerPage.getByLabel('Email').fill(`planner-${stamp}@example.com`);
    await plannerPage.getByLabel('Password').fill('correct-horse-battery');
    await plannerPage.getByRole('button', { name: /create an account/i }).click();
    await expect(
      plannerPage.getByRole('heading', { name: /create your organisation/i }),
    ).toBeVisible();
    await plannerPage.goto(acceptUrl);
    await plannerPage.getByRole('button', { name: /accept and join/i }).click();
    await expect(plannerPage).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

    await plannerPage.goto(`/orgs/${orgSlug}/members`);
    await expect(plannerPage.getByRole('table', { name: 'Organisation members' })).toBeVisible();
    await expect(plannerPage.getByRole('table', { name: 'Pending invitations' })).toBeHidden();
    await expect(plannerPage.getByText('Pending invitations')).toBeHidden();
  });
});
