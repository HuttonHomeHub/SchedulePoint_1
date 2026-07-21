import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { drawActivity, onboard, openNewPlan, startEditing } from './support';

/**
 * Flag-ON **External-Guest per-plan share links** journey (`VITE_GUEST_SHARE_LINKS`, ADR-0051 F-M4).
 * Proves the whole share loop runs across TWO real browser contexts — the member's authenticated
 * session and a completely session-less "outsider with a link" context:
 *
 * 1. A Planner/Org Admin authors a plan on the canvas (one activity, so the guest view has something
 *    to show) and opens the **Share…** toolbar item, which opens the member `ShareLinksDialog`.
 * 2. Creating a link shows its one-time guest URL (read from the DOM, never the clipboard).
 * 3. A brand-new browser context — no cookies, no session — navigates to that `/share#<token>` URL and
 *    sees the plan's name, status and read-only diagram, with NONE of the member app-shell chrome
 *    (no top bar / Project Explorer navigator, no authoring toolbar). The token only ever rides in the
 *    URL fragment, never the query string.
 * 4. Back in the member context, revoking the link is immediate: reloading the guest context's exact
 *    same URL now shows the uniform "no longer available" message.
 *
 * Serial (the suite mutates one shared plan and drives a second context against it); Chromium only
 * (TECH_DEBT #25a).
 */
test('an outsider with a share link views a plan read-only, and revoking it is immediate', async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // Author one activity on the canvas so the guest view has a non-empty diagram to render.
  await startEditing(page);
  await drawActivity(page, 'Task', 'Excavate', { x: 220, y: 120 });
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });

  // (1) Open the Share… toolbar item (Row 2 · Do deliverables cluster) — the member management dialog.
  const toolbar = page.getByRole('toolbar', { name: 'Build and manage' });
  await toolbar.getByRole('button', { name: 'Share…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share links' });
  await expect(dialog).toBeVisible();

  // The open dialog stays WCAG 2.2 AA before anything is created.
  const dialogAxe = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(dialogAxe.violations).toEqual([]);

  // (2) Create a labelled link; its one-time guest URL surfaces in a read-only field (never rely on
  // clipboard permissions — read the value straight out of the DOM).
  await dialog.getByLabel('Label (optional)').fill('Client review');
  await dialog.getByRole('button', { name: 'Create link' }).click();
  const urlField = dialog.getByLabel('Guest link');
  await expect(urlField).toBeVisible();
  const shareUrl = await urlField.inputValue();
  expect(shareUrl).toMatch(/\/share#\S+/);
  const token = new URL(shareUrl).hash.replace(/^#/, '');
  expect(token.length).toBeGreaterThan(0);

  // The list refreshes to show the just-created link (react-query invalidates on create success).
  await expect(dialog.getByText('Client review')).toBeVisible();

  // (3) A completely session-less context — no cookies, no auth state — opens the guest URL.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(shareUrl);

  // The plan's header renders (name/status), and the read-only diagram shows the one authored activity.
  await expect(guestPage.getByRole('heading', { name: 'Guest Plan', level: 1 })).toBeVisible();
  await expect(guestPage.getByText('Read-only shared view')).toBeVisible();
  const guestDiagram = guestPage.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(guestDiagram).toBeVisible();
  await expect(guestDiagram.getByRole('option', { name: /Excavate/ })).toBeVisible();

  // NO member chrome at all: the guest view's own slim `<header>` is expected (it's the plan header
  // above), but none of the authenticated app-shell's landmarks/controls are present — no Project
  // Explorer navigator, no org-switcher nav, no authoring toolbar, no pen control.
  await expect(guestPage.getByRole('navigation', { name: 'Project Explorer' })).toHaveCount(0);
  await expect(guestPage.getByRole('navigation', { name: 'Organisation' })).toHaveCount(0);
  await expect(guestPage.getByRole('toolbar')).toHaveCount(0);
  await expect(guestPage.getByRole('button', { name: 'Start editing' })).toHaveCount(0);

  // The token rides ONLY in the URL fragment — never the query string — and the page URL still carries
  // the literal `#`.
  const guestUrl = new URL(guestPage.url());
  expect(guestUrl.search).toBe('');
  expect(guestUrl.hash).toBe(`#${token}`);
  expect(guestPage.url()).toContain('#');

  // The guest view itself is accessible.
  expect(
    (await new AxeBuilder({ page: guestPage }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  // (4) Back in the member context, revoke the link. NOTE: confirming the nested `ConfirmDialog` closes
  // the whole `Share links` dialog too (both are native `<dialog>` elements, and the inner one's
  // non-bubbling "close" event is still observed by the outer dialog's `onClose` during the capture
  // phase — a pre-existing pattern shared with `BaselinesPanel`'s own nested delete-confirm, not
  // something specific to this suite) — so reopen Share… afterwards to see the row's revoked state.
  await dialog.getByRole('button', { name: 'Revoke Client review' }).click();
  const confirmDialog = page.getByRole('alertdialog', { name: 'Revoke share link' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByRole('dialog', { name: 'Share links' })).toBeHidden();

  await toolbar.getByRole('button', { name: 'Share…' }).click();
  const reopenedDialog = page.getByRole('dialog', { name: 'Share links' });
  await expect(reopenedDialog.getByText('Revoked').first()).toBeVisible();

  // Revocation is immediate: reloading the guest context's exact same URL now shows the uniform
  // "no longer available" message (no existence oracle for a dead token).
  await guestPage.reload();
  await expect(guestPage.getByText('This share link is no longer available.')).toBeVisible();
  await expect(guestPage.getByRole('heading', { name: 'Guest Plan', level: 1 })).toHaveCount(0);

  await guestContext.close();
});
