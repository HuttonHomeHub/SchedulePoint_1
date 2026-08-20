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
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  // Share is a row inside the `Share & export` menu since ADR-0090 M2-T4.
  await toolbar.getByRole('button', { name: /Share & export/ }).click();
  await page.getByRole('menuitem', { name: 'Share…' }).click();
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
  await dialog.getByLabel('Label').fill('Client review');
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

  // The canvas has REAL HEIGHT. Every other assertion in this file reads the parallel focusable DOM
  // layer ADR-0026 D7 builds for assistive tech — `getByRole('option')` finds a bar there whether or
  // not a single pixel was painted. This view shipped with a canvas measured at **1886 × 1**: the
  // header, toolbar and legend all rendered, the listbox held every activity, and a reader saw an
  // empty box. `TsldPanel fill` is `h-full` over a `flex-1` container, and the guest view's
  // `min-h-dvh` column gave that percentage nothing definite to resolve against.
  //
  // So this asserts the one thing the a11y layer cannot stand in for. The floor is deliberately well
  // below the ~807 px measured here and well above the 240 px `min-h-[240px]` fallback the collapsed
  // container lands on, so it catches the collapse without pinning an exact viewport-dependent size.
  const canvasHeight = await guestPage.evaluate(
    () => document.querySelector('canvas')?.getBoundingClientRect().height ?? 0,
  );
  expect(canvasHeight).toBeGreaterThan(400);

  // …and the canvas still has height at 320 px. `h-dvh` is what makes it fill, and a DEFINITE
  // viewport height is exactly what can start clipping once the header wraps on a narrow screen —
  // so the fix's own mechanism is the thing to re-check at the small end, not assume.
  //
  // **The assertion this comment used to withhold** (`docs/TECH_DEBT.md` #98, now closed).
  //
  // The history is worth keeping, because it is a case of reasoning losing to measurement. The
  // accessibility review reasoned from the CSS that nothing on this chain sets `overflow-hidden`,
  // so the page would simply scroll and pass WCAG 1.4.10. The assertion written from that reasoning
  // **failed**: `documentElement.scrollWidth` was 436 at a 320 px viewport, because the TSLD
  // zoom-preset group (`flex items-center gap-1`, no `flex-wrap`) is 420 px wide and cannot shrink.
  // Pre-existing rather than caused by the height fix — simply unobservable while the canvas was
  // 1 px and nobody had measured.
  //
  // It was recorded rather than fixed at the time because a shared canvas control cuts across
  // ADR-0031's overflow tiers and needed the member workspace re-checked at the same widths. That
  // re-check is done; `TsldViewControls` wraps the group, on both surfaces, from one change.
  await guestPage.setViewportSize({ width: 320, height: 720 });
  const narrowCanvas = await guestPage.evaluate(
    () => document.querySelector('canvas')?.getBoundingClientRect().height ?? 0,
  );
  expect(narrowCanvas, 'the canvas must not collapse when the header wraps').toBeGreaterThan(100);

  // WCAG 1.4.10 Reflow: no horizontal scroll at 320 px. Measured, not reasoned — a 4 px tolerance
  // absorbs sub-pixel layout rounding without admitting a 116 px overflow, which is what this
  // caught. Asserted at 320 and 360, because 320 is the criterion's own floor and 360 is the
  // commonest real phone width, and a fix that only satisfies the narrower one is a coincidence.
  for (const width of [320, 360]) {
    await guestPage.setViewportSize({ width, height: 720 });
    const scrollWidth = await guestPage.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `no horizontal overflow at ${String(width)} px`).toBeLessThanOrEqual(
      width + 4,
    );
  }
  await guestPage.setViewportSize({ width: 1280, height: 800 });

  // A refresh of a LIVE link still shows the plan. This is not padding: step (4) below reloads this
  // same page and asserts the "no longer available" copy — which is exactly what a token lost on
  // reload would also produce. Without this assertion, a regression that dropped the fragment would
  // make that check pass for the wrong reason, and the suite would go on reporting green while the
  // guest surface was broken for everyone who pressed F5.
  await guestPage.reload();
  await expect(guestPage.getByRole('heading', { name: 'Guest Plan', level: 1 })).toBeVisible();
  await expect(guestDiagram.getByRole('option', { name: /Excavate/ })).toBeVisible();
  expect(new URL(guestPage.url()).hash).toBe(`#${token}`);

  // The guest view itself is accessible.
  expect(
    (await new AxeBuilder({ page: guestPage }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  // (4) Back in the member context, revoke the link. Confirming the nested `ConfirmDialog` leaves the
  // `Share links` dialog standing — the `Dialog` primitive ignores a `close` event whose target is a
  // descendant dialog (TECH_DEBT #50, fixed) — so the revoked state is visible without reopening.
  await dialog.getByRole('button', { name: 'Revoke Client review' }).click();
  const confirmDialog = page.getByRole('alertdialog', { name: 'Revoke share link' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Revoke' }).click();
  await expect(confirmDialog).toBeHidden();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Revoked').first()).toBeVisible();

  // Revocation is immediate: reloading the guest context's exact same URL now shows the uniform
  // "no longer available" message (no existence oracle for a dead token).
  await guestPage.reload();
  await expect(guestPage.getByText('This share link is no longer available.')).toBeVisible();
  await expect(guestPage.getByRole('heading', { name: 'Guest Plan', level: 1 })).toHaveCount(0);

  await guestContext.close();
});
