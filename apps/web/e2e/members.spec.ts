import { expect, test } from '@playwright/test';

/**
 * The team-onboarding journey: an admin creates an organisation, invites a
 * teammate, and the teammate accepts the invitation and lands in the org.
 * Uses two isolated browser contexts (two accounts). Requires the API + DB.
 */
test('an admin can invite a teammate who then accepts and joins', async ({ browser }) => {
  const stamp = Date.now();
  const adminEmail = `admin-${stamp}@example.com`;
  const inviteeEmail = `invitee-${stamp}@example.com`;
  const orgName = `Builders ${stamp}`;

  // --- Admin: create an org and invite the teammate --------------------------
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();

  await admin.goto('/sign-up');
  await admin.getByLabel('Full name').fill('Admin User');
  await admin.getByLabel('Email').fill(adminEmail);
  await admin.getByLabel('Password').fill('correct-horse-battery');
  await admin.getByRole('button', { name: /create account/i }).click();

  await expect(admin.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await admin.getByLabel('Organisation name').fill(orgName);
  await admin.getByRole('button', { name: /create organisation/i }).click();

  await expect(admin.getByRole('heading', { name: orgName })).toBeVisible();
  await admin.getByRole('link', { name: 'Members' }).click();

  await admin.getByRole('button', { name: 'Invite member' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Email').fill(inviteeEmail);
  await dialog.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await dialog.getByRole('button', { name: /send invitation/i }).click();

  const acceptUrl = await admin.getByLabel('Invitation link').inputValue();
  expect(acceptUrl).toContain('/accept-invite?token=');
  await adminContext.close();

  // --- Invitee: sign up and accept -------------------------------------------
  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();

  await invitee.goto('/sign-up');
  await invitee.getByLabel('Full name').fill('Invited Teammate');
  await invitee.getByLabel('Email').fill(inviteeEmail);
  await invitee.getByLabel('Password').fill('correct-horse-battery');
  await invitee.getByRole('button', { name: /create account/i }).click();
  await expect(invitee.getByRole('heading', { name: /create your organisation/i })).toBeVisible();

  await invitee.goto(acceptUrl);
  await expect(invitee.getByRole('heading', { name: new RegExp(`Join ${orgName}`) })).toBeVisible();
  await invitee.getByRole('button', { name: /accept and join/i }).click();

  // Landed in the organisation the admin created.
  await expect(invitee).toHaveURL(/\/orgs\//);
  await expect(invitee.getByRole('heading', { name: orgName })).toBeVisible();
  await inviteeContext.close();
});
