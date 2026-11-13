import { expect, test } from '../e2e-support/test';

import { createClient, createPlan, createProject, onboard } from './support';

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
      // Focus follows the swap from the form to the link, and the one-time warning is on screen.
      await expect(page.getByLabel('Invitation link')).toBeFocused();
      await expect(dialog.getByText(/it is shown only once/)).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
    }

    // ---- Members can now SHOW them. This is the half that did not exist. --------------------
    /**
     * **The TABLE is `Invited people`; the SECTION is `Pending invitations`.**
     *
     * They were both `Pending invitations` until `docs/TECH_DEBT.md` #344, which is a real defect
     * — `DataTable` renders a focusable scroll region labelled by its caption, so an AT user heard
     * one name twice and could not tell which box they were in. Renaming the caption fixed it and
     * broke these four locators, in a suite this branch never touched: the exact class ADR-0091 M7
     * and ADR-0114 record as "run every journey after a label or layout change", found by a
     * specialist review rather than by CI.
     */
    const invitations = page.getByRole('table', { name: 'Invited people' });
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
    await expect(page.getByRole('table', { name: 'Invited people' })).toBeVisible();

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
      page.getByRole('table', { name: 'Invited people' }).getByText(`first-${stamp}@example.com`),
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
    // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
    await expect(
      plannerPage.getByRole('heading', { name: /create your organisation/i }),
    ).toBeVisible({ timeout: 15_000 });
    await plannerPage.goto(acceptUrl);
    await plannerPage.getByRole('button', { name: /accept and join/i }).click();
    await expect(plannerPage).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

    await plannerPage.goto(`/orgs/${orgSlug}/members`);
    /**
     * **The roster line is the positive control and is asserted FIRST**, because the two below it
     * are absence assertions and a locator matching nothing is "hidden". When #344 renamed the
     * table's caption `Pending invitations` → `Invited people`, this file's three POSITIVE
     * assertions failed loudly and this one would have kept passing for the wrong reason — which
     * is the more dangerous half of the same change and the reason the control is named here.
     */
    await expect(plannerPage.getByRole('table', { name: 'Organisation members' })).toBeVisible();
    await expect(plannerPage.getByRole('table', { name: 'Invited people' })).toBeHidden();
    await expect(plannerPage.getByText('Pending invitations')).toBeHidden();
    // Invite, role change and Remove are an Org-Admin-only bundle, so a Planner is not offered them
    // (the roster above is the positive control for these absences).
    await expect(plannerPage.getByRole('button', { name: 'Invite member' })).toBeHidden();
    await expect(plannerPage.getByRole('button', { name: /^Remove / })).toBeHidden();
    await expect(plannerPage.getByLabel(/^Role for /)).toBeHidden();
  });
});

/**
 * **Remove was cut to "Rem" at the design floor.** The Actions column declared no width, so its
 * neighbours shrank it below its button. Asserted as a fact about the box rather than a pixel: the
 * button's text fits inside the button, and the page does not scroll sideways.
 */
test('the Remove button is not clipped at 1024 wide', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  const orgSlug = await onboard(page, Date.now());
  await page.goto(`/orgs/${orgSlug}/members`);

  const remove = page.getByRole('button', { name: /^Remove / });
  await expect(remove).toBeVisible();
  const clipped = await remove.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(false);
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(sideways).toBe(false);
});

/**
 * **"Add your first client" used to end at an empty list with no button of its own.** The link still
 * goes to Clients (opening the dialog from the link would need a new route search param, a decision
 * of its own), but the empty list now holds the action, so the first client is two presses.
 */
test('the empty Clients list holds a button that opens New client', async ({ page }) => {
  const orgSlug = await onboard(page, Date.now());
  await page.getByRole('link', { name: 'Add your first client' }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}/clients$`));

  await page.getByRole('button', { name: 'Create your first client' }).click();
  await expect(page.getByRole('dialog', { name: 'New client' })).toBeVisible();
});

/**
 * **Creating an account from an invitation used to lose the invitation.** Sign in carried the
 * destination and Create an account did not, so a new account landed on "Create your organisation".
 */
test('an invitee who creates an account comes back to the invitation', async ({ browser }) => {
  const stamp = Date.now();
  const adminPage = await (await browser.newContext()).newPage();
  const orgSlug = await onboard(adminPage, stamp);
  await adminPage.goto(`/orgs/${orgSlug}/members`);
  await adminPage.getByRole('button', { name: 'Invite member' }).click();
  await adminPage.getByRole('dialog').getByLabel('Email').fill(`newbie-${stamp}@example.com`);
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: /send invitation/i })
    .click();
  const acceptUrl = await adminPage.getByLabel('Invitation link').inputValue();

  const inviteePage = await (await browser.newContext()).newPage();
  await inviteePage.goto(acceptUrl);
  await inviteePage.getByRole('link', { name: 'Create an account' }).click();
  // The invitation token is captured and taken out of the address bar and history.
  await expect(inviteePage).toHaveURL(/\/sign-up$/);
  await inviteePage.getByLabel('Full name').fill('Nia Newbie');
  await inviteePage.getByLabel('Email').fill(`newbie-${stamp}@example.com`);
  await inviteePage.getByLabel('Password').fill('correct-horse-battery');
  await inviteePage.getByRole('button', { name: /create an account/i }).click();

  await expect(inviteePage.getByRole('button', { name: /accept and join/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(inviteePage).toHaveURL(/\/accept-invite/);
});

/**
 * **A Contributor sees three home-page sections, not four**, and the last used to sit alone beside
 * an empty half-row. Asserted as geometry that holds on any machine: in every row of the grid the
 * cells run edge to edge, so no row has a hole.
 */
test("a Contributor's home page has no empty half-row", async ({ browser }) => {
  const stamp = Date.now();
  const adminPage = await (await browser.newContext()).newPage();
  const orgSlug = await onboard(adminPage, stamp);
  await createClient(adminPage, 'Bellway');
  await createProject(adminPage, 'Northgate');
  await createPlan(adminPage, 'Northgate Phase 1');
  // Taken here, while the admin is on the plan; the invitation below navigates away.
  const planUrl = adminPage.url();
  expect(planUrl).toContain('/plans/');

  await adminPage.goto(`/orgs/${orgSlug}/members`);
  await adminPage.getByRole('button', { name: 'Invite member' }).click();
  const dialog = adminPage.getByRole('dialog');
  await dialog.getByLabel('Email').fill(`contrib-${stamp}@example.com`);
  await dialog.getByLabel('Role', { exact: true }).selectOption('CONTRIBUTOR');
  await dialog.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await adminPage.getByLabel('Invitation link').inputValue();

  const page = await (await browser.newContext()).newPage();
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Cleo Contributor');
  await page.getByLabel('Email').fill(`contrib-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(acceptUrl);
  await page.getByRole('button', { name: /accept and join/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  /** Every row of the overview grid runs edge to edge and no cell is empty. */
  const expectNoHole = async (expectJumpBackIn: boolean): Promise<void> => {
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/orgs/${orgSlug}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Recently changed' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeHidden();
      await expect(page.getByRole('heading', { level: 2, name: 'Jump back in' })).toBeVisible({
        visible: expectJumpBackIn,
      });

      const rows = await page.evaluate(() => {
        // The grid whose cells hold "Recently changed", not the first `.grid` in `<main>`.
        const heading = [...document.querySelectorAll('h2')].find(
          (h) => h.textContent?.trim() === 'Recently changed',
        );
        const grid = heading?.closest('.grid > div')?.parentElement;
        if (!grid) return null;
        const box = grid.getBoundingClientRect();
        const cells = [...grid.children].map((c) => c.getBoundingClientRect());
        const byTop = new Map<number, DOMRect[]>();
        for (const cell of cells) {
          const key = Math.round(cell.top);
          byTop.set(key, [...(byTop.get(key) ?? []), cell]);
        }
        return {
          count: cells.length,
          rows: [...byTop.values()].map((row) => ({
            left: Math.min(...row.map((c) => c.left)) - box.left,
            right: box.right - Math.max(...row.map((c) => c.right)),
            empty: row.some((c) => c.height === 0 || c.width === 0),
          })),
        };
      });
      expect(rows, `no grid at ${width}`).not.toBeNull();
      expect(rows!.count).toBeGreaterThanOrEqual(expectJumpBackIn ? 2 : 1);
      for (const row of rows!.rows) {
        expect(row.empty).toBe(false);
        expect(row.left).toBeLessThanOrEqual(1);
        expect(row.right).toBeLessThanOrEqual(1);
      }
    }
  };

  // No plan opened in this browser yet: Jump back in is omitted, not left as an empty cell.
  await expectNoHole(false);

  // Open the plan, so this browser remembers it, and Jump back in joins the grid without a hole.
  await page.goto(planUrl);
  // The plan is remembered once its query succeeds, so wait for the page to have loaded it.
  await expect(page.getByText('Northgate Phase 1').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await expectNoHole(true);
});

/**
 * **Creating the first client removes the empty-state button that opened the dialog**, so focus has
 * nowhere to return to. It must not fall to `<body>` (ADR-0135).
 */
test('focus is not lost when the first client is created', async ({ page }) => {
  const orgSlug = await onboard(page, Date.now());
  await page.goto(`/orgs/${orgSlug}/clients`);
  await page.getByRole('button', { name: 'Create your first client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('First client');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByRole('link', { name: 'First client' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect
    .poll(async () => page.evaluate(() => document.activeElement?.tagName ?? null))
    .not.toBe('BODY');
});

/**
 * **The destination is spent only if it is a path on this site.** `?redirect=//evil.test` reached
 * the sign-up screen unvalidated (a non-strict `useSearch` merges the raw query in) and sent a new
 * user to `/evil.test`. A hostile value must fall back to the ordinary first-run screen.
 */
test('sign-up ignores a redirect that points off this site', async ({ page }) => {
  const stamp = Date.now();
  await page.goto(`/sign-up?redirect=${encodeURIComponent('//evil.test')}`);
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
  await page.getByLabel('Full name').fill('Eve Hostile');
  await page.getByLabel('Email').fill(`hostile-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  expect(new URL(page.url()).pathname).not.toContain('evil');
});
