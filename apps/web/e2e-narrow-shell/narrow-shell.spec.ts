import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';

import { activityEditor } from '../e2e-support/activity-editor';
import { expect, test } from '../e2e-support/test';
import { recalculate } from '../e2e-support/toolbar';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

/**
 * **The narrow shell** (`docs/specs/narrow-shell-journey/`, closes `docs/TECH_DEBT.md` #172).
 *
 * The first authenticated journey ever to run below `lg` (1024 px). It runs at 640 × 480 — a 1280
 * window at 200 % zoom — because below the 1024 floor is the zoom band, not a phone (ADR-0179). Its subjects are the branches
 * no browser had opened: the off-canvas `Sheet` that IS the Project Explorer on a narrow screen,
 * the header hamburger that opens it, the `matchMedia` transition effect that closes it on
 * crossing `lg`, and the below-`md` workspace that ADR-0114 M7's gate pass found broken — by a
 * specialist review, because this suite did not exist to find it. That workspace was a separate
 * single-pane layout until ADR-0181 retired it; the last block here drives the one layout that
 * replaced it, at the widths the old branch served.
 *
 * **Seeding happens at a WIDE viewport, deliberately.** The subject is the narrow SHELL, not
 * every creation dialog at 640 px; seeding through the proven wide path keeps a dialog-layout
 * failure from reading as a shell failure. The viewport then narrows and stays narrow for the
 * assertions.
 *
 * Reachability is asserted with `elementFromPoint`, not visibility: ADR-0114 M1 measured that a
 * control clipped by an ancestor's `overflow-hidden` moves by zero pixels when focused, so
 * "visible" and "keyboard-reachable" can both hold while a pointer can never touch it — a control
 * that is not painted looks exactly like a control that does not exist.
 */

/** The centre of a locator's box is the topmost element at that point (pointer-reachable). */
async function pointerReachable(page: Page, name: string, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, `${name} has a layout box`).not.toBeNull();
  if (!box) return;
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x!, y!);
      return el ? { tag: el.tagName, text: (el.textContent ?? '').slice(0, 40) } : null;
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit, `${name} is under the pointer at its own centre`).not.toBeNull();
  const target = locator;
  const contains = await target.evaluate(
    (el, point) => {
      const found = document.elementFromPoint(point[0], point[1]);
      return found !== null && (el === found || el.contains(found) || found.contains(el));
    },
    [box.x + box.width / 2, box.y + box.height / 2] as [number, number],
  );
  expect(contains, `${name}'s centre point resolves to itself, not a covering element`).toBe(true);
}

/**
 * Everything this suite's journeys share: an organisation with one client, project and plan, built
 * at a wide viewport through the proven path. The plan's name is `Baseline`.
 */
async function seedOrganisation(page: Page): Promise<string> {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const orgSlug = `narrow-co-${stamp}`;

  // ── Seed at a wide viewport (the proven base-journey path, verbatim steps).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Narrow Tester');
  await page.getByLabel('Email').fill(`narrow-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`Narrow Co ${stamp}`);
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
  return orgSlug;
}

/** One activity in the open plan, through the API: the editor and the table need something to open. */
async function seedActivity(page: Page, orgSlug: string, name: string): Promise<void> {
  const planId = /\/plans\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!planId) throw new Error(`no plan id in ${page.url()}`);
  const status = await page.evaluate(
    async ({ org, id, label }) =>
      (
        await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: label, type: 'TASK', durationDays: 3, laneIndex: 0 }),
        })
      ).status,
    { org: orgSlug, id: planId, label: name },
  );
  expect(status, 'seeding the activity').toBe(201);
}

/** Hold the pen (ADR-0028); the row menu's Edit is shaded without it. Idempotent. */
async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/** WCAG 2.2 AA with `target-size` on: axe ships it disabled and tags it `wcag22aa`. */
async function expectAxeClean(page: Page, label: string): Promise<void> {
  expect(
    (
      await new AxeBuilder({ page })
        .options({
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
          },
          rules: { 'target-size': { enabled: true } },
        })
        .analyze()
    ).violations,
    `${label}: axe`,
  ).toEqual([]);
}

const NOTICE_HEADING = 'SchedulePoint is designed for larger screens';

/** The page's own box: the dialog is the scroller, so its scroll size is the page's overflow. */
async function pageOverflow(page: Page): Promise<{ x: number; document: number }> {
  return page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    return {
      x: dialog ? dialog.scrollWidth - dialog.clientWidth : 0,
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test.describe('after "Continue anyway" the shell is the narrow layout', () => {
  // The reader has pressed Continue anyway before this test starts (ADR-0179): this journey's
  // subject is the shell's narrow branches, not the page that precedes them.
  test.use({ acknowledgeViewportNotice: true });

  test('the narrow shell: sheet navigation, header reachability, breakpoint crossing, plan facts', async ({
    page,
  }) => {
    const orgSlug = await seedOrganisation(page);

    // Back to the organisation landing, then narrow. The shell's pinned rail should give way to
    // the hamburger.
    await page.goto(`/orgs/${orgSlug}`);
    await page.setViewportSize({ width: 640, height: 480 });

    // ── FR-2: the below-`lg` header's controls exist and are pointer-reachable.
    const hamburger = page.getByRole('button', { name: 'Show Project Explorer' });
    await expect(hamburger).toBeVisible();
    await pointerReachable(page, 'the Explorer trigger', hamburger);
    await pointerReachable(
      page,
      'the brand link',
      page.getByRole('link', { name: /SchedulePoint/i }).first(),
    );

    // ── FR-1: open the sheet, walk the hierarchy, navigate to the plan by its NAME.
    await hamburger.click();
    const sheet = page.getByRole('dialog', { name: 'Project Explorer' });
    await expect(sheet).toBeVisible();
    // **Read `aria-expanded` before clicking a container — never click blind.** Creating the plan
    // at the wide viewport auto-expanded the path to it (the shell reveals freshly-created nodes),
    // and expansion persists per organisation — so a blind click COLLAPSES an already-open branch.
    // This spec's first run did exactly that and spent its timeout waiting for a child it had just
    // hidden; the probe that diagnosed it also proved expansion itself works.
    for (const name of [/Northgate/, /Riverside/]) {
      const row = sheet.getByRole('treeitem', { name });
      await expect(row).toBeVisible();
      if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
    }
    // The plan is a leaf: clicking anywhere on it navigates, and `onNavigate` closes the sheet.
    await sheet.getByRole('treeitem', { name: /Baseline/ }).click();
    await expect(page).toHaveURL(/\/plans\//);
    await expect(sheet).not.toBeVisible();

    // ── FR-4: the plan's facts render in the workspace's foot row, which is on screen at 640 x 480
    // (a ~117 px body, retire-single-pane m0-measurement.md §2) — the ADR-0114 M7 regression, where
    // they went missing in a hidden pane, asserted in a real layout for the first time. The pane is
    // gone with ADR-0181; the facts' visibility is what is kept.
    /**
     * **Named by its label, not matched by its text** (`docs/TECH_DEBT.md` #347).
     *
     * This read `getByText('Data date', { exact: true })`, which is ambiguous by construction: since
     * ADR-0106 moved the persistent date labels out of the canvas and into the ruler band as DOM,
     * `Data date` is ALSO the text of the axis-marker pill
     * (`TsldCanvas.tsx:2240`, `data-axis-marker="dataDate"`). Both are on this page whenever the
     * diagram has painted, so the assertion was a **race** — green when it ran before the canvas
     * painted its markers, a strict-mode violation when it did not. It lost that race exactly once,
     * inside a full `scripts/e2e-sweep.sh` on a loaded machine, and passed three times standing
     * alone, which is what made it look flaky rather than under-specified.
     *
     * Reproduced deterministically before it was changed: inserting a 2.5 s settle ahead of the old
     * locator fails every run, naming both elements. `Stat` gives the pair one `aria-label`
     * (`plan-facts.tsx:257`, `${label}: ${value}`), so the label names the FACT and cannot match the
     * pill, which carries no such label. No wait is needed once the locator is unambiguous.
     */
    await expect(page.getByLabel(/^Data date: /)).toBeVisible();

    // ── FR-3: the breakpoint-crossing effect. Open the sheet, widen across `lg`: the effect must
    // close it (a modal drawer lingering behind the pinned rail is a stuck focus trap), and the
    // pinned rail takes over. Narrowing again restores the trigger.
    await page.goto(`/orgs/${orgSlug}`);
    await page.getByRole('button', { name: 'Show Project Explorer' }).click();
    await expect(page.getByRole('dialog', { name: 'Project Explorer' })).toBeVisible();
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(page.getByRole('dialog', { name: 'Project Explorer' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Show Project Explorer' })).not.toBeVisible();
    await page.setViewportSize({ width: 640, height: 480 });
    await expect(page.getByRole('button', { name: 'Show Project Explorer' })).toBeVisible();

    // ── FR-5: the narrow shell with the sheet open is accessible. ONE `options()` carrying BOTH
    // runOnly and rules — the #170 shape this same PR fixes elsewhere, and this spec's first draft
    // shipped the superseded `.withTags(['wcag2a','wcag2aa'])` in the same diff (caught by the
    // phase gate: the "one correct pattern applied to a control and not its neighbour" class,
    // committed by the neighbour's own author). `target-size` is opted in because axe ships it
    // disabled and tags it wcag22aa — and below the floor, after a Continue, this check is where WCAG 2.5.8 is held (ADR-0179).
    await page.getByRole('button', { name: 'Show Project Explorer' }).click();
    await expect(page.getByRole('dialog', { name: 'Project Explorer' })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .options({
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
            },
            rules: { 'target-size': { enabled: true } },
          })
          .analyze()
      ).violations,
    ).toEqual([]);
  });
});

/**
 * **The page itself** (ADR-0179, `docs/specs/minimum-viewport` §4.6) — and what follows pressing its
 * button. Not acknowledged up front: this journey must meet the notice.
 */
test('the larger-screens page: opens, fits, answers, and leads to the narrow layout', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const orgSlug = await seedOrganisation(page);
  await page.getByRole('link', { name: 'Baseline', exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
  await seedActivity(page, orgSlug, 'Dig footings');
  const planUrl = page.url();

  const dialog = page.getByRole('dialog', { name: NOTICE_HEADING });
  const heading = dialog.getByRole('heading', { level: 1, name: NOTICE_HEADING });
  const proceed = dialog.getByRole('button', { name: 'Continue anyway' });

  // ── 1. A narrow load opens the page, the heading holds focus, and it is accessible.
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto(planUrl);
  await expect(dialog).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(dialog).toContainText('at least 1024 pixels wide. Your window is 640 pixels wide.');
  await expect(dialog).toContainText('Signed in as Narrow Tester');
  await expectAxeClean(page, 'the page');

  // Forced colours: an opaque card, and a visible ring on the one control a keyboard reader needs.
  await page.emulateMedia({ forcedColors: 'active' });
  await page.keyboard.press('Tab');
  await expect(proceed, 'Continue anyway is the first tab stop').toBeFocused();
  const ring = await proceed.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style, 'a focus ring under forced colours').not.toBe('none');
  expect(ring.width).toBeGreaterThan(0);
  const card = await dialog.locator('[data-surface="auth"]').evaluate((el) => {
    return getComputedStyle(el).backgroundColor;
  });
  expect(card, 'the card is opaque under forced colours').not.toBe('rgba(0, 0, 0, 0)');
  await page.emulateMedia({ forcedColors: 'none' });

  // ── 2. The heading and the button are on screen without scrolling, and nothing overflows.
  for (const [width, height] of [
    [640, 480],
    [667, 375],
    [911, 424],
    [320, 256],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(heading, `${width}x${height}: heading`).toBeInViewport({ ratio: 1 });
    await expect(proceed, `${width}x${height}: Continue anyway`).toBeInViewport({ ratio: 1 });
    const over = await pageOverflow(page);
    expect(over.x, `${width}x${height}: the page overflows sideways`).toBeLessThanOrEqual(0);
    expect(over.document, `${width}x${height}: the document overflows`).toBeLessThanOrEqual(0);
  }
  await expectAxeClean(page, 'the page at 320 x 256');

  // ── 3. Widening closes it and stores nothing.
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), VIEWPORT_NOTICE_ACK_KEY),
  ).toBeNull();

  // ── 4. Escape is for the visit: a fresh browser (same account, empty storage) meets it again.
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto(planUrl);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), VIEWPORT_NOTICE_ACK_KEY),
  ).toBeNull();
  const fresh = await browser.newContext({
    viewport: { width: 640, height: 480 },
    storageState: await page.context().storageState(),
  });
  const freshPage = await fresh.newPage();
  await freshPage.goto(planUrl);
  await expect(freshPage.getByRole('dialog', { name: NOTICE_HEADING })).toBeVisible();
  await fresh.close();

  // ── 4b. "Not now" is Escape for a finger: it sits after Continue, before Sign out, and is
  // visit-only too.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(planUrl);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(proceed).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Not now' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Not now' }).click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), VIEWPORT_NOTICE_ACK_KEY),
  ).toBeNull();

  // ── 5. Continue anyway closes it, puts focus somewhere real, and a reload does not bring it back.
  // Escape was this tab's visit-only answer, so a new visit is a tab with no session storage.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(planUrl);
  await expect(dialog).toBeVisible();
  await proceed.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#main'), 'focus lands on the main region').toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), VIEWPORT_NOTICE_ACK_KEY)).toBe(
    '1',
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(dialog).toBeHidden();

  // ── 6. At 320 x 256, after Continue: the narrow shell still works.
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto(`/orgs/${orgSlug}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoSidewaysScroll(page, 'the landing at 320 x 256');
  await expectAxeClean(page, 'the landing at 320 x 256');

  // The Explorer is a sheet.
  await page.getByRole('button', { name: 'Show Project Explorer' }).click();
  const sheet = page.getByRole('dialog', { name: 'Project Explorer' });
  await expect(sheet).toBeVisible();
  await expectAxeClean(page, 'the Explorer sheet at 320 x 256');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // A Menu.
  await page.getByRole('button', { name: /^Account/ }).click();
  const menu = page.getByRole('menu', { name: 'Account' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // A settings/list page.
  await page.goto(`/orgs/${orgSlug}/calendars`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoSidewaysScroll(page, 'calendars at 320 x 256');
  await expectAxeClean(page, 'calendars at 320 x 256');

  // A dialog: the activity editor, reached from the Activities panel's row menu. It is opened at
  // 700 x 900 and the window is then narrowed to the 1.4.10 width, because at 320 x 720 the shell's
  // chrome leaves the workspace a ~109 px body (retire-single-pane m0-measurement.md §2): Expand is
  // under it for a pointer and the table shows no rows, a limit below the design floor that
  // `docs/TECH_DEBT.md` #471 owns. 1.4.10 is a width obligation and the dialog is what it covers.
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto(planUrl);
  await ensurePen(page);
  await page.getByRole('button', { name: 'Expand activities panel' }).click();
  await page.getByRole('button', { name: 'Actions for Dig footings' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(activityEditor(page)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(activityEditor(page)).toBeVisible();
  await expectAxeClean(page, 'the activity editor at 320 x 720');
});

/**
 * **Resize survival and the banner** (spec §2.3, SC-4): narrowing mid-task never opens the modal,
 * never moves focus, never loses work.
 */
test('a live narrowing gets a banner: focus, typed text and the editor survive', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const orgSlug = await seedOrganisation(page);
  await page.getByRole('link', { name: 'Baseline', exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
  await seedActivity(page, orgSlug, 'Dig footings');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await ensurePen(page);
  await page.getByRole('button', { name: 'Expand activities panel' }).click();
  await page.getByRole('button', { name: 'Actions for Dig footings' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const editor = activityEditor(page);
  await expect(editor).toBeVisible();
  const name = editor.getByLabel('Name', { exact: true }).first();
  await name.fill('Dig footings, revised');
  await name.focus();
  await expect(name).toBeFocused();
  const banner = page.getByTestId('viewport-banner');
  const dirty = async (): Promise<boolean> =>
    editor.getByRole('button', { name: /^Save/ }).first().isEnabled();
  const dirtyBefore = await dirty();

  // Dragging across the floor must not flicker: record any banner that is ever added.
  await page.evaluate(() => {
    const w = window as unknown as { bannerSeen: number };
    w.bannerSeen = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.querySelector('[data-testid="viewport-banner"]')) {
            w.bannerSeen += 1;
          } else if (node instanceof Element && node.matches('[data-testid="viewport-banner"]')) {
            w.bannerSeen += 1;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  for (const width of [1000, 1100, 1000, 1100, 1000, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
  }
  expect(
    await page.evaluate(() => (window as unknown as { bannerSeen: number }).bannerSeen),
    'the banner never flickered in while the width was dragged',
  ).toBe(0);

  // Settle narrow: no modal, focus where it was, the banner in a polite region.
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(banner).toBeAttached({ timeout: 5_000 });
  await expect(page.getByRole('dialog', { name: NOTICE_HEADING })).toBeHidden();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Dig footings, revised');
  await expect(
    page.locator('[aria-live="polite"]', {
      hasText: 'This window is narrower than SchedulePoint is designed for',
    }),
  ).toBeAttached();

  // Widen back: the banner goes, and the work is intact.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(banner).toBeHidden();
  await expect(name).toHaveValue('Dig footings, revised');
  await expect(name).toBeFocused();
  expect(await dirty(), 'the editor stays as dirty as it was').toBe(dirtyBefore);

  // The banner at 320 x 256 keeps both buttons reachable and does not cover the controls below it.
  await editor
    .getByRole('button', { name: 'Close', exact: true })
    .click()
    .catch(() => undefined);
  await page.keyboard.press('Escape');
  await page.goto(`/orgs/${orgSlug}`);
  // Settled first: a pathname change that lands after the narrowing (a redirect still in flight)
  // is a navigation, and a navigation while narrow is the full page, not the banner.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 256 });
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await pointerReachable(
    page,
    'Continue anyway',
    banner.getByRole('button', { name: 'Continue anyway' }),
  );
  await pointerReachable(page, 'Dismiss', banner.getByRole('button', { name: 'Dismiss' }));
  const trigger = page.getByRole('button', { name: 'Show Project Explorer' });
  await trigger.focus();
  await pointerReachable(page, 'the focused Explorer trigger', trigger);
  const bannerBox = await banner.boundingBox();
  const triggerBox = await trigger.boundingBox();
  expect((triggerBox?.y ?? 0) >= (bannerBox?.y ?? 0) + (bannerBox?.height ?? 0) - 1).toBe(true);
  await banner.getByRole('button', { name: 'Continue anyway' }).click();
  await expect(banner).toBeHidden();
});

async function expectNoSidewaysScroll(page: Page, label: string): Promise<void> {
  const over = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    main:
      (document.querySelector('main')?.scrollWidth ?? 0) -
      (document.querySelector('main')?.clientWidth ?? 0),
  }));
  expect(over.document, `${label}: the document does not scroll sideways`).toBeLessThanOrEqual(0);
  expect(over.main, `${label}: main does not scroll sideways`).toBeLessThanOrEqual(0);
}

/**
 * **One workspace layout at every width** (ADR-0181, `docs/specs/retire-single-pane-workspace/`).
 *
 * Below 768 px the plan workspace used to be a separate single-pane layout with a Workspace-view
 * toggle; it is the same stack as at 1024 now — canvas row, then the foot row — and this block drives
 * it at the widths the old branch served. The readings it holds the layout to are
 * `m0-measurement.md`'s, taken before the command band became one scrolling line (toolbar-redesign
 * M3): 700 × 900 and 640 × 844 had a body tall enough for rows and the foot row, and 320 × 720 a
 * ~109 px body (the shell's wrapped chrome was 603 px). The band is 143-239 px now, so those windows
 * have 700-757 px and 481-529 px of body, and the cases that assert the SWAP read the heights where
 * the body is short (740 px). The table at 640 × 480 and below is asserted by the M3 block at the end
 * of this file (SC-5, SC-6): `docs/TECH_DEBT.md` #471's band half.
 *
 * **The dock rule, stated as the arithmetic the journey can check from the outside.** A right dock
 * that would leave the diagram under 360 px (`CANVAS_MIN_WIDTH`) takes the whole row and the stage
 * beside it is `inert`; otherwise the stage keeps at least 360 px and nothing is inert. The dock's own
 * minimum is declared here rather than read from the app, so a minimum that moves has to be moved in
 * two places on purpose.
 */
const DOCKS = [
  {
    key: 'health',
    region: 'Health check',
    close: 'Close health check',
    min: 340,
    trigger: 'analysis',
    menuItem: 'Health check…',
  },
  {
    key: 'revisions',
    region: 'Compare revisions',
    close: 'Close revision comparison',
    min: 380,
    trigger: 'analysis',
    menuItem: 'Compare revisions…',
  },
  {
    key: 'float paths',
    region: 'Float paths',
    close: 'Close float paths',
    min: 300,
    trigger: 'float-paths',
    menuItem: null,
  },
  {
    key: 'notes',
    region: 'Plan notes panel',
    close: 'Close plan notes',
    min: 280,
    trigger: 'comments',
    menuItem: null,
  },
] as const;
type DockSpec = (typeof DOCKS)[number];

/** Diagram floor and splitter, `use-notes-panel-prefs.ts` and `panel-resizer.tsx`. */
const CANVAS_FLOOR = 360;
const SPLITTER = 1;

const NARROW_DOCK_SIZES = [
  { width: 700, height: 900 },
  { width: 640, height: 844 },
  { width: 320, height: 1000 },
] as const;

const commandBand = (page: Page) => page.getByRole('toolbar', { name: 'Plan commands' });
/** The selection bar, which holds Float paths since toolbar-redesign M2-T4 (it left the deck). */
const selectionBar = (page: Page) => page.getByRole('toolbar', { name: /^Actions for/ });
/** The control that opens a dock, on whichever surface holds it. */
const dockTrigger = (page: Page, dock: DockSpec) =>
  (dock.key === 'float paths' ? selectionBar(page) : commandBand(page)).locator(
    `[data-toolbar-item="${dock.trigger}"]`,
  );
const expandPanel = (page: Page) => page.getByRole('button', { name: 'Expand activities panel' });
const collapsePanel = (page: Page) =>
  page.getByRole('button', { name: 'Collapse activities panel' });
const footRow = (page: Page) => page.locator('[data-activities-bar]');
const dockRegion = (page: Page, dock: DockSpec) =>
  page.getByRole('region', { name: dock.region, exact: true });
const dockSurface = (page: Page, dock: DockSpec) =>
  dockRegion(page, dock).locator('xpath=ancestor::*[@data-surface="panel"][1]');

/** Open a dock the way a pointer does. */
async function openDock(page: Page, dock: DockSpec): Promise<void> {
  const trigger = dockTrigger(page, dock);
  await trigger.click();
  if (dock.menuItem !== null) await page.getByRole('menuitem', { name: dock.menuItem }).click();
  await expect(dockRegion(page, dock)).toBeVisible();
  // A press focuses the trigger, and an icon-only trigger's tooltip opens on focus and stays until
  // the pointer leaves (ADR-0117); the tip hangs below the trigger, which on a line this narrow is
  // over the dock's own header. A planner's pointer moves on to the Close button, and the tip leaves
  // with it. Playwright checks the target BEFORE it moves the mouse, so say where the mouse goes.
  await page.mouse.move(0, 0);
}

/** Open a dock from the keyboard alone: focus the trigger, Enter, and Enter on the menu item if any. */
async function openDockByKeyboard(page: Page, dock: DockSpec): Promise<void> {
  const trigger = dockTrigger(page, dock);
  await trigger.focus();
  await page.keyboard.press('Enter');
  if (dock.menuItem !== null) {
    const item = page.getByRole('menuitem', { name: dock.menuItem });
    await item.focus();
    await page.keyboard.press('Enter');
  }
  await expect(dockRegion(page, dock)).toBeVisible();
}

/**
 * Wait until a dock has finished loading its content, read as its controls standing still across two
 * reads a quarter of a second apart. The Float paths and Compare revisions panels fetch on open, and a
 * Tab walk that starts while they show a spinner finds only the Close button — a race this journey
 * lost in one run in three before it waited.
 */
async function dockSettled(page: Page, dock: DockSpec): Promise<void> {
  const controls = () => dockRegion(page, dock).locator('button, [href], input, select').count();
  let last = -1;
  for (let i = 0; i < 20; i += 1) {
    const now = await controls();
    if (now === last && now > 0) return;
    last = now;
    await page.waitForTimeout(250);
  }
  throw new Error(`${dock.key} dock never settled`);
}

/** Whether the diagram's stage is `inert` — read from its canvas, which is what a reader would reach. */
function stageInert(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document
        .querySelector('section[aria-label="Time-scaled logic diagram"] canvas')
        ?.closest('[inert]') != null,
  );
}

async function boxOf(locator: ReturnType<Page['locator']>, what: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} has no layout box`);
  return box;
}

/** Everything a dock sitting in the workspace body has to satisfy at the current width. */
async function expectDockRule(page: Page, dock: DockSpec, label: string): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const body = await boxOf(page.getByTestId('workspace-body'), 'the workspace body');
  const surface = await boxOf(dockSurface(page, dock), `${dock.key} dock`);
  const squeezed = body.width - dock.min - SPLITTER < CANVAS_FLOOR;
  const inert = await stageInert(page);
  const resizers = await page.getByRole('separator', { name: /^Resize / }).count();

  expect(surface.width, `${label}: the dock has width`).toBeGreaterThan(0);
  expect(surface.x, `${label}: the dock starts on screen`).toBeGreaterThanOrEqual(-0.5);
  expect(surface.x + surface.width, `${label}: the dock ends on screen`).toBeLessThanOrEqual(
    viewport.width + 0.5,
  );
  expect(inert, `${label}: the stage is inert exactly when the dock is squeezed`).toBe(squeezed);
  if (squeezed) {
    expect(
      Math.abs(surface.width - (body.width - SPLITTER)),
      `${label}: a squeezed dock takes the whole row, with no dead strip beside it`,
    ).toBeLessThanOrEqual(1);
    expect(resizers, `${label}: a pinned dock has no resize handle`).toBe(0);
  } else {
    const stage = await boxOf(
      page.locator('section[aria-label="Time-scaled logic diagram"]'),
      'the stage',
    );
    expect(stage.width, `${label}: the diagram keeps its floor`).toBeGreaterThanOrEqual(
      CANVAS_FLOOR - 0.5,
    );
  }
}

/** Neither the document, `main`, nor the foot row scrolls sideways. */
async function expectNoSidewaysOverflow(page: Page, label: string): Promise<void> {
  await expectNoSidewaysScroll(page, label);
  const foot = await footRow(page).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(foot, `${label}: the foot row does not scroll sideways`).toBeLessThanOrEqual(0);
}

/** Rows a pointer can hit below the pinned header inside the Activities region (the swap's reading). */
async function hittableRows(page: Page): Promise<number> {
  return page.getByRole('region', { name: 'Activities', exact: true }).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const head = el.querySelector('thead')?.getBoundingClientRect();
    const top = Math.max(box.top, head ? head.bottom : box.top);
    let rows = 0;
    for (const tr of el.querySelectorAll('tbody tr')) {
      const r = tr.getBoundingClientRect();
      if (r.height === 0 || r.top < top - 1 || r.bottom > box.bottom + 1) continue;
      const hit = document.elementFromPoint(r.left + 8, (r.top + r.bottom) / 2);
      if (hit && tr.contains(hit)) rows += 1;
    }
    return rows;
  });
}

interface RowReach {
  row: string;
  /** What `elementFromPoint` returns at the centre and the four corners of the `⋯`, summarised. */
  hits: string[];
  reachable: boolean;
}

/**
 * The first and last activity rows a pointer can hit in the open panel, and for each whether its
 * `⋯` is the topmost element at its centre and four corners (`docs/TECH_DEBT.md` #466: the bar was
 * said to sit over it). The corners are taken 30 % in from the box's edges so a round button's cut-off corner is not read as a covering element.
 */
async function rowMenuReach(page: Page): Promise<RowReach[]> {
  return page.getByRole('region', { name: 'Activities', exact: true }).evaluate((region) => {
    const box = region.getBoundingClientRect();
    const head = region.querySelector('thead')?.getBoundingClientRect();
    const top = Math.max(box.top, head ? head.bottom : box.top);
    const seen: HTMLButtonElement[] = [];
    for (const tr of region.querySelectorAll('tbody tr')) {
      const r = tr.getBoundingClientRect();
      if (r.height === 0 || r.top < top - 1 || r.bottom > box.bottom + 1) continue;
      const button = tr.querySelector<HTMLButtonElement>('button[aria-label^="Actions for "]');
      if (button) seen.push(button);
    }
    const ends = seen.length > 1 ? [seen[0]!, seen[seen.length - 1]!] : seen;
    return ends.map((button) => {
      const r = button.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = r.width * 0.3;
      const dy = r.height * 0.3;
      const points: Array<[number, number]> = [
        [cx, cy],
        [cx - dx, cy - dy],
        [cx + dx, cy - dy],
        [cx - dx, cy + dy],
        [cx + dx, cy + dy],
      ];
      const hits = points.map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el
          ? el === button || button.contains(el)
            ? 'self'
            : el.tagName +
              ':' +
              (el.getAttribute('aria-label') ?? el.getAttribute('data-testid') ?? '')
          : 'none';
      });
      return {
        row: button.getAttribute('aria-label') ?? '',
        hits,
        reachable: hits.every((hit) => hit === 'self'),
      };
    });
  });
}

interface TabStop {
  name: string;
  width: number;
  height: number;
  /** Where in the workspace body the stop is: a dock, the foot row, or anything else (the stage). */
  zone: 'dock' | 'foot' | 'stage';
}

/**
 * Walk the Tab order `steps` times in `direction` and report each stop inside the workspace body.
 * Stops outside it (the skip link, the breadcrumb) are the shell's and are not this block's subject.
 */
async function tabStopsInBody(
  page: Page,
  direction: 'Tab' | 'Shift+Tab',
  steps: number,
): Promise<TabStop[]> {
  const stops: TabStop[] = [];
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press(direction);
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      const body = document.querySelector('[data-testid="workspace-body"]');
      if (!el || !body || !body.contains(el)) return null;
      const r = el.getBoundingClientRect();
      return {
        name:
          el.getAttribute('aria-label') ??
          el.getAttribute('title') ??
          (el.textContent ?? '').trim().slice(0, 30) ??
          el.tagName,
        width: r.width,
        height: r.height,
        zone: el.closest('[data-surface="panel"]')
          ? ('dock' as const)
          : el.closest('[data-activities-bar]')
            ? ('foot' as const)
            : ('stage' as const),
      };
    });
    if (stop) stops.push(stop);
  }
  return stops;
}

/** A plan with twelve activities, opened at 700 x 900 with the pen held and the first one selected. */
async function seedWorkspace(page: Page): Promise<{ orgSlug: string; planUrl: string }> {
  const orgSlug = await seedOrganisation(page);
  await page.getByRole('link', { name: 'Baseline', exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
  for (let i = 1; i <= 12; i += 1) await seedActivity(page, orgSlug, `Task ${String(i)}`);
  return { orgSlug, planUrl: page.url() };
}

test.describe('one workspace layout at every width (ADR-0181)', () => {
  test.use({ acknowledgeViewportNotice: true });

  test('every dock opens, on screen and obeying the squeeze rule, at 700, 640 and 320 wide', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);

    // One page load at the widest size, with an activity selected so Float paths has a target, then
    // narrowed live: a selection is client state, and below 700 px there is no canvas to select in.
    // 320 is read at 320 x 1000 because the shell's chrome is 603 px tall at that width, so the
    // 320 x 720 window has a 109 px body that no dock can show in (`docs/TECH_DEBT.md` #471).
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto(planUrl);
    await page.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);

    for (const size of NARROW_DOCK_SIZES) {
      const tag = `${String(size.width)} x ${String(size.height)}`;
      await page.setViewportSize(size);
      await expect(footRow(page)).toBeVisible();
      await expectNoSidewaysOverflow(page, `${tag}: collapsed`);

      // Every dock opens, is on screen, obeys the squeeze rule and closes.
      for (const dock of DOCKS) {
        const label = `${tag}, ${dock.key} dock`;
        await openDock(page, dock);
        await expectDockRule(page, dock, label);
        await expectNoSidewaysOverflow(page, label);
        if (size.width === 320) await expectAxeClean(page, label);
        await dockRegion(page, dock).getByRole('button', { name: dock.close }).click();
        await expect(dockRegion(page, dock)).toBeHidden();
        expect(await stageInert(page), `${label}: closing the dock frees the stage`).toBe(false);
      }
    }
  });

  test('the foot row wraps instead of leaving the screen, and the panel swaps for rows', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);

    // No selection here: a selected activity docks its action bar in the foot row and grows it to
    // most of a narrow body (m0-measurement.md §5, pre-existing), which is a different reading.
    // The heights are the ones where the body is SHORT, so the swap is what is under test: the
    // band is one scrolling line now (toolbar-redesign M3), so a 900 px window leaves a 757 px body
    // that holds the panel beside the diagram and never swaps (the body must be under 611 px:
    // `isShortBody`). 740 px leaves 597 (fine) and 577 (coarse). 320 x 720 has a 529 px body and
    // swaps too, where it used to have 109.
    for (const size of [
      { width: 700, height: 740, minRows: 5 },
      { width: 640, height: 740, minRows: 5 },
      // The foot row wraps taller at 320, so the same body shows fewer rows.
      { width: 320, height: 720, minRows: 3 },
    ] as const) {
      const tag = `${String(size.width)} x ${String(size.height)}`;
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(planUrl);
      await expect(footRow(page)).toBeVisible();

      // The facts wrap inside the row rather than pushing Recalculate and Expand out of the body.
      await expectNoSidewaysOverflow(page, tag);
      const expand = expandPanel(page);
      const recalculate = page.getByRole('button', { name: 'Recalculate' });
      await expect(expand).toBeVisible();
      await expect(recalculate).toBeVisible();
      for (const [name, control] of [
        ['Expand activities panel', expand],
        ['Recalculate', recalculate],
      ] as const) {
        const box = await boxOf(control, name);
        expect(box.x, `${tag}: ${name} starts on screen`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${tag}: ${name} ends on screen`).toBeLessThanOrEqual(
          size.width + 0.5,
        );
        await pointerReachable(page, `${tag}: ${name}`, control);
      }
      expect(
        (await boxOf(expand, 'Expand activities panel')).width,
        `${tag}: Expand keeps its touch width`,
      ).toBeGreaterThanOrEqual(24);

      // The panel, where the body has the height for it: ADR-0180's swap shows rows, the table's
      // region keeps its floor, and the way back is there.
      await expand.click();
      await expect(collapsePanel(page)).toBeVisible();
      await expectNoSidewaysOverflow(page, `${tag}: expanded`);
      await expect
        .poll(() => hittableRows(page), { message: `${tag}: rows under the swap` })
        .toBeGreaterThanOrEqual(size.minRows);
      const region = await boxOf(
        page.getByRole('region', { name: 'Activities', exact: true }),
        'the Activities region',
      );
      expect(region.height, `${tag}: the table region keeps its floor`).toBeGreaterThanOrEqual(128);
      await collapsePanel(page).click();
      await expect(expand).toBeVisible();
    }
  });

  for (const pointer of ['fine', 'coarse'] as const) {
    test.describe(`the row menu is reachable by a ${pointer} pointer with the panel expanded`, () => {
      test.use({ hasTouch: pointer === 'coarse' });

      // `docs/TECH_DEBT.md` #466: the pane bar said to cover the row's `⋯` went with the single-pane
      // layout (ADR-0181), and nothing sits over a row now. 320 is read at 320 x 1200 because the
      // shell's chrome is 603 px tall there and a shorter window leaves the table too little height
      // for a row to be hit (#471).
      test('first and last visible rows: the ⋯ is the topmost element and opens its menu', async ({
        page,
      }) => {
        test.setTimeout(300_000);
        page.setDefaultTimeout(20_000);
        const { planUrl } = await seedWorkspace(page);

        for (const size of [
          { width: 700, height: 900 },
          { width: 320, height: 1200 },
        ]) {
          const tag = `${pointer} ${String(size.width)} x ${String(size.height)}`;
          await page.setViewportSize(size);
          await page.goto(planUrl);
          expect(
            await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
            `${tag}: the pointer is the one this block names`,
          ).toBe(pointer === 'coarse');
          await expandPanel(page).click();
          await expect(collapsePanel(page)).toBeVisible();
          await expect
            .poll(() => hittableRows(page), { message: `${tag}: rows` })
            .toBeGreaterThan(0);

          // At 320 the table is wider than its 288 px region (447 px of columns), so the `⋯` at its
          // right end is reached by scrolling the region sideways, which any pointer can do.
          await page
            .getByRole('region', { name: 'Activities', exact: true })
            .evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
          const reach = await rowMenuReach(page);
          expect(reach.length, `${tag}: a first and a last row`).toBeGreaterThanOrEqual(1);
          for (const row of reach) {
            expect(row.hits, `${tag}: ${row.row} centre and corners`).toEqual(
              Array(5).fill('self'),
            );
          }
          for (const row of reach) {
            const button = page.getByRole('button', { name: row.row, exact: true });
            const box = await boxOf(button, row.row);
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            if (pointer === 'coarse') await page.touchscreen.tap(x, y);
            else await page.mouse.click(x, y);
            const menu = page.getByRole('menu');
            await expect(menu, `${tag}: ${row.row} opens its menu`).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(menu).toBeHidden();
          }
        }
      });
    });
  }

  test('a squeezed dock gives way to a viewport command, and the panel and a dock never coexist', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    // 740 px high, not the 844 this read before the band became one line: a 844 px window now has a
    // body tall enough (701 px) to hold a dock and the panel's minimum, so nothing is squeezed.
    await page.setViewportSize({ width: 640, height: 740 });
    await page.goto(planUrl);
    const health = DOCKS[0];

    // A viewport command acts on the diagram, so a dock that has taken the row closes first and the
    // stage is back. It is Go to today, not Fit: Fit moved into the cluster inside the stage
    // (toolbar-redesign M4), which is inert in exactly this state (`docs/TECH_DEBT.md` #480). Go to
    // today is shaded until the schedule is calculated, and calculating needs the pen.
    await ensurePen(page);
    await recalculate(page);
    await openDock(page, health);
    expect(await stageInert(page), 'the squeezed dock made the stage inert').toBe(true);
    await commandBand(page).getByRole('button', { name: 'Go to today' }).click();
    await expect(dockRegion(page, health)).toBeHidden();
    expect(await stageInert(page), 'the viewport command freed the stage').toBe(false);

    // Fit to plan is in View ▾ as well (`docs/TECH_DEBT.md` #480): the same wrapped command, so with
    // a dock squeezing the stage it closes the dock and fits, from the deck, by keyboard or pointer.
    await openDock(page, health);
    expect(await stageInert(page), 'the squeezed dock made the stage inert again').toBe(true);
    await commandBand(page).getByRole('button', { name: /^View/ }).click();
    await page
      .getByRole('dialog', { name: 'View' })
      .getByRole('button', { name: 'Fit to plan' })
      .click();
    await expect(dockRegion(page, health)).toBeHidden();
    expect(await stageInert(page), 'View ▾ Fit to plan freed the stage').toBe(false);

    // ADR-0180's exclusivity, now at this width: Expand closes an open dock, and opening a dock over
    // the swapped panel collapses the panel.
    await openDock(page, health);
    await expandPanel(page).click();
    await expect(collapsePanel(page)).toBeVisible();
    await expect(dockRegion(page, health)).toBeHidden();
    await openDock(page, health);
    await expect(expandPanel(page)).toBeVisible();
    await expect(dockRegion(page, health)).toBeVisible();
  });

  test('keyboard and focus per dock at 320 and 640: no zero-size stop, and focus is handed back', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto(planUrl);
    await page.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);

    for (const size of NARROW_DOCK_SIZES.slice(1)) {
      const width = size.width;
      await page.setViewportSize(size);
      for (const dock of DOCKS) {
        const label = `${String(width)} wide, ${dock.key} dock`;
        await openDockByKeyboard(page, dock);

        // From the dock's Close, the Tab order runs through the dock and never lands on a zero-size
        // control in the body — the resize handle was the one M0 found at zero size.
        await dockSettled(page, dock);
        const close = dockRegion(page, dock).getByRole('button', { name: dock.close });
        await close.focus();
        const forward = await tabStopsInBody(page, 'Tab', 12);
        await close.focus();
        const backward = await tabStopsInBody(page, 'Shift+Tab', 12);
        for (const stop of [...forward, ...backward]) {
          expect(stop.width, `${label}: "${stop.name}" has width`).toBeGreaterThan(0);
          expect(stop.height, `${label}: "${stop.name}" has height`).toBeGreaterThan(0);
          // A squeezed dock has the whole row: the stage beside it is a sliver nobody can see, so
          // the walk must never stop there.
          expect(stop.zone, `${label}: "${stop.name}" is not in the invisible stage`).not.toBe(
            'stage',
          );
        }
        expect(
          [...forward, ...backward].some((stop) => stop.zone === 'dock'),
          `${label}: the Tab order runs through the dock (${JSON.stringify([...forward, ...backward].map((stop) => `${stop.zone}:${stop.name}`))})`,
        ).toBe(true);

        // Escape closes it as at 1024, and focus goes to the control that opened it, never <body>.
        await close.focus();
        await page.keyboard.press('Escape');
        await expect(dockRegion(page, dock)).toBeHidden();
        const handedBack = await page.evaluate(() =>
          document.activeElement?.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item'),
        );
        expect(handedBack, `${label}: Escape hands focus back to the trigger`).toBe(dock.trigger);

        // And Close, from the keyboard, does the same.
        await openDockByKeyboard(page, dock);
        await dockRegion(page, dock).getByRole('button', { name: dock.close }).focus();
        await page.keyboard.press('Enter');
        await expect(dockRegion(page, dock)).toBeHidden();
        const afterClose = await page.evaluate(() =>
          document.activeElement?.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item'),
        );
        expect(afterClose, `${label}: Close hands focus back to the trigger`).toBe(dock.trigger);
      }
    }

    // The positive control for the walk above (ADR-0110): lift `inert` off a squeezed stage and the
    // same walk must find a stop in the stage's sliver or one with no size — otherwise the loop above would pass
    // against a layout that had lost the rule it exists to hold.
    const revisions = DOCKS[1];
    await openDockByKeyboard(page, revisions);
    await dockSettled(page, revisions);
    await page.evaluate(() => {
      const wrapper = document
        .querySelector('section[aria-label="Time-scaled logic diagram"] canvas')
        ?.closest('[inert]');
      if (wrapper instanceof HTMLElement) wrapper.inert = false;
    });
    await dockRegion(page, revisions).getByRole('button', { name: revisions.close }).focus();
    const unguarded = [
      ...(await tabStopsInBody(page, 'Tab', 16)),
      ...(await tabStopsInBody(page, 'Shift+Tab', 16)),
    ];
    expect(
      unguarded.some((stop) => stop.width === 0 || stop.height === 0 || stop.zone === 'stage'),
      'without inert the walk leaves the dock for the invisible stage',
    ).toBe(true);
  });

  test('a selected activity’s action bar and the plan facts do not overlap in the foot row', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto(planUrl);
    await page.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
    const bar = footRow(page).getByRole('toolbar', { name: /^Actions for / });
    await expect(bar).toBeVisible();

    // At the widths the narrow shell serves, the outlet that holds the bar used to ask for no width
    // at all, so it shared a line with the facts and the two painted over each other.
    for (const size of [
      { width: 700, height: 900 },
      { width: 640, height: 844 },
    ]) {
      await page.setViewportSize(size);
      const tag = `${String(size.width)} x ${String(size.height)}`;
      const barBox = await boxOf(bar, 'the action bar');
      const factsBox = await boxOf(page.locator('[data-schedule-state]'), 'the plan facts');
      const apart =
        barBox.x + barBox.width <= factsBox.x + 0.5 ||
        factsBox.x + factsBox.width <= barBox.x + 0.5 ||
        barBox.y + barBox.height <= factsBox.y + 0.5 ||
        factsBox.y + factsBox.height <= barBox.y + 0.5;
      expect(
        apart,
        `${tag}: the action bar ${JSON.stringify(barBox)} and the facts ${JSON.stringify(factsBox)} do not intersect`,
      ).toBe(true);
    }
  });

  test('Expand and Collapse keep focus on themselves from the keyboard', async ({ page }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto(planUrl);
    await expandPanel(page).focus();
    await page.keyboard.press('Enter');
    await expect(collapsePanel(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(expandPanel(page)).toBeFocused();
  });
});

/**
 * **Below 1024 wide the command band is one line that scrolls sideways** (toolbar-redesign M3, US-6,
 * `docs/TECH_DEBT.md` #471; `docs/specs/toolbar-redesign/m3-measurement.md` holds the readings).
 *
 * Before it the header and the deck's wrapped lines took 355 px of a 640-wide window and 603 px of a
 * 320-wide one: `<main>` had no height at 640 x 360 and below, and the foot row — Expand, Recalculate
 * — was under the window with nothing to scroll. On a touch pointer Expand was unreachable at all
 * five of #471's cells. Reachability here is `elementFromPoint` at the control's centre, as
 * `pointerReachable` has it: "visible" and "hit-testable" are different facts (ADR-0114 M1).
 *
 * **Narrow AND short is the one case where the band scrolls away** (`squat`, 26 rem): there the shell
 * itself scrolls, so Expand is a scroll away and every reading scrolls it into view first — that is
 * what a planner does, and what `scrollIntoViewIfNeeded` does for them. At 640 x 480 and above the
 * band is held and Expand is reachable at rest.
 */
const SC5_CELLS = [
  { width: 640, height: 480 },
  { width: 640, height: 360 },
  { width: 640, height: 300 },
  { width: 320, height: 720 },
  { width: 320, height: 256 },
] as const;

/** The band's fraction of the window, and whether the shell scrolls (so the band can scroll away). */
async function bandFacts(page: Page): Promise<{
  share: number;
  scrollsAway: boolean;
  squat: boolean;
  mainTop: number;
  scrollTop: number;
}> {
  return page.evaluate(() => {
    const band = document.querySelector('[data-surface="chrome"]:not([data-activities-bar])');
    const main = document.querySelector('main');
    const shell = main?.parentElement ?? null;
    const height = band?.getBoundingClientRect().height ?? 0;
    return {
      share: height / window.innerHeight,
      scrollsAway: shell !== null && shell.scrollHeight > shell.clientHeight,
      squat: window.matchMedia('(width < 64rem) and (height <= 26rem)').matches,
      mainTop: (main?.getBoundingClientRect().top ?? 0) + (shell?.scrollTop ?? 0),
      scrollTop: shell?.scrollTop ?? 0,
    };
  });
}

/** Browser default font size, so rem media queries answer (a CSS `html { font-size }` would not). */
async function setDefaultFontSize(page: Page, scale: 1 | 2): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.setFontSizes', {
    fontSizes: {
      standard: 16 * scale,
      fixed: 13 * scale,
      serif: 16 * scale,
      sansSerif: 16 * scale,
    },
  } as never);
  await cdp.detach();
}

test.describe('the selection bar on a finger-sized pointer (toolbar-redesign M4 review)', () => {
  test.use({ acknowledgeViewportNotice: true, hasTouch: true });

  // The dock outlet asks for 36 rem (576 px) while a `data-dock-wide` strip is in it, and no
  // measurement had put that floor at a window narrower than 576 px. At 320 and 640 the foot row's
  // own content box is under it, so the floor must give way rather than push the row sideways.
  test('a selection open at 320 and 640 wide does not scroll the page, main or the foot row sideways', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    for (const size of [
      { width: 320, height: 720 },
      { width: 640, height: 844 },
    ]) {
      const tag = `coarse ${String(size.width)} x ${String(size.height)}`;
      await page.setViewportSize(size);
      await page.goto(planUrl);
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
        `${tag}: the pointer is coarse`,
      ).toBe(true);
      await page.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
      await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
      await expect(footRow(page).getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
      await expect(footRow(page).locator('[data-dock-wide]')).toHaveCount(1);
      await expectNoSidewaysOverflow(page, tag);
    }
  });
});

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`the command band below 1024, ${pointer} pointer (toolbar-redesign M3)`, () => {
    test.use({ acknowledgeViewportNotice: true, hasTouch: pointer === 'coarse' });

    test('SC-5, SC-6 and SC-7: the band is held to 40 % or scrolls away, and the foot row is reachable', async ({
      page,
    }) => {
      test.setTimeout(420_000);
      page.setDefaultTimeout(20_000);
      const { planUrl } = await seedWorkspace(page);

      for (const size of SC5_CELLS) {
        const tag = `${pointer} ${String(size.width)} x ${String(size.height)}`;
        await page.setViewportSize(size);
        await page.goto(planUrl);
        expect(
          await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
          `${tag}: the pointer is the one this block names`,
        ).toBe(pointer === 'coarse');
        await expect(commandBand(page)).toBeVisible();

        // The deck is one line, and it says so by being wider than its box.
        const deck = await commandBand(page).evaluate((el) => ({
          overflows: el.scrollWidth > el.clientWidth,
          lines: new Set(
            [...el.querySelectorAll('[data-toolbar-focusable]')].map((c) =>
              Math.round(c.getBoundingClientRect().top / 4),
            ),
          ).size,
        }));
        expect(deck.overflows, `${tag}: the deck scrolls sideways`).toBe(true);
        expect(deck.lines, `${tag}: the deck is one line`).toBe(1);

        const facts = await bandFacts(page);
        expect(
          facts.share <= 0.4 || (facts.squat && facts.scrollsAway),
          `${tag}: the band is ${String(Math.round(facts.share * 100))} % of the window and ` +
            `${facts.squat && facts.scrollsAway ? 'scrolls away' : 'is held'}`,
        ).toBe(true);

        // Expand and Recalculate (the plan is not calculated, so it renders) are under a pointer
        // once scrolled to, which is all a band that scrolls away asks of a planner.
        const expand = expandPanel(page);
        const recalculate = page.getByRole('button', { name: 'Recalculate' });
        for (const [name, control] of [
          ['Expand activities panel', expand],
          ['Recalculate', recalculate],
        ] as const) {
          await control.scrollIntoViewIfNeeded();
          await pointerReachable(page, `${tag}: ${name}`, control);
        }
        if (!facts.squat) {
          // Held band: nothing has to be scrolled to.
          const reach = await page.evaluate(() => {
            const el = document.querySelector('button[aria-label="Expand activities panel"]');
            if (!el) return false;
            const b = el.getBoundingClientRect();
            return b.top >= 0 && b.bottom <= window.innerHeight;
          });
          expect(reach, `${tag}: Expand is on screen without scrolling`).toBe(true);
        }

        // SC-6: with the panel expanded the table keeps a row a pointer can hit, where the body can
        // hold one (a 640 x 480 or 320 x 720 window; the shorter cells scroll to a full window).
        if (size.height >= 480) {
          await expand.click();
          await expect(collapsePanel(page)).toBeVisible();
          await expect
            .poll(() => hittableRows(page), { message: `${tag}: rows with the panel expanded` })
            .toBeGreaterThanOrEqual(1);
          await collapsePanel(page).click();
          await expect(expand).toBeVisible();
        }
      }
    });

    test('SC-7: at text-only 200 % in a 1280 x 800 window every deck control is hit-testable', async ({
      page,
    }) => {
      test.setTimeout(420_000);
      page.setDefaultTimeout(20_000);
      const { planUrl } = await seedWorkspace(page);

      await setDefaultFontSize(page, 2);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(planUrl);
      await expect(commandBand(page)).toBeVisible();
      const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      // Without this the cell would silently read an ordinary 1280 window and pass for the wrong
      // reason: the browser's default font size is what rem media queries answer to.
      expect(root, 'setFontSizes moved the root font size, so rem queries respond').toBe('32px');

      const facts = await bandFacts(page);
      expect(facts.squat, '1280 x 800 at 200 % is 40 x 25 rem: narrow and short').toBe(true);
      expect(facts.scrollsAway, 'the shell scrolls, so the band scrolls away').toBe(true);

      const ids = await commandBand(page)
        .locator('[data-toolbar-focusable]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-toolbar-item') ?? ''));
      expect(ids.length, 'the deck has its controls').toBeGreaterThan(20);
      for (const id of ids) {
        const control = commandBand(page).locator(`[data-toolbar-item="${id}"]`).first();
        await control.scrollIntoViewIfNeeded();
        await pointerReachable(page, `200 % text, ${pointer}: ${id}`, control);
      }

      for (const [name, control] of [
        ['Expand activities panel', expandPanel(page)],
        ['Recalculate', page.getByRole('button', { name: 'Recalculate' })],
      ] as const) {
        await control.scrollIntoViewIfNeeded();
        await pointerReachable(page, `200 % text, ${pointer}: ${name}`, control);
      }
      await setDefaultFontSize(page, 1);
    });
  });
}

test.describe('the scrolling line: focus, the edge cue and menus (toolbar-redesign M3)', () => {
  test.use({ acknowledgeViewportNotice: true });

  /** The deck's visible box and the focused control's, in one read. */
  const focusReading = (page: Page) =>
    page.evaluate(() => {
      const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      const focused = document.activeElement;
      if (!deck || !focused || !deck.contains(focused)) return null;
      const d = deck.getBoundingClientRect();
      const f = focused.getBoundingClientRect();
      return {
        id: focused.getAttribute('data-toolbar-item'),
        leftGap: f.left - d.left,
        rightGap: d.right - f.right,
        // A one-line deck: a control the deck's box does not contain vertically is on a wrapped line
        // or under another layer, which the sideways gaps cannot see.
        topGap: f.top - d.top,
        bottomGap: d.bottom - f.bottom,
        scrollLeft: deck.scrollLeft,
        maxScroll: deck.scrollWidth - deck.clientWidth,
      };
    });

  test('ArrowRight, Home, End and Tab keep the focused control inside the line, clear of its edges', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto(planUrl);
    const deck = commandBand(page);
    await expect(deck).toBeVisible();
    const stops = deck.locator('[data-toolbar-focusable]');
    const count = await stops.count();
    expect(count, 'the deck has many more controls than a 640 px line holds').toBeGreaterThan(20);

    // The inset the line keeps either side (`max-lg:px-2`); a focused control is never nearer an edge
    // than that, which is what "flush" would be.
    const INSET = 8 - 0.5;
    const inside = async (label: string): Promise<{ id: string | null; scrollLeft: number }> => {
      const reading = await focusReading(page);
      expect(reading, `${label}: focus is in the deck`).not.toBeNull();
      if (!reading) throw new Error('unreachable');
      expect(
        reading.leftGap,
        `${label} (${String(reading.id)}): clear of the leading edge`,
      ).toBeGreaterThanOrEqual(INSET);
      expect(
        reading.rightGap,
        `${label} (${String(reading.id)}): clear of the trailing edge`,
      ).toBeGreaterThanOrEqual(INSET);
      // Half a pixel of rounding either way; a control on a second line is tens of pixels out.
      expect(
        reading.topGap,
        `${label} (${String(reading.id)}): inside the deck, top`,
      ).toBeGreaterThanOrEqual(-0.5);
      expect(
        reading.bottomGap,
        `${label} (${String(reading.id)}): inside the deck, bottom`,
      ).toBeGreaterThanOrEqual(-0.5);
      return reading;
    };

    await stops.first().focus();
    await inside('first control');
    let farthest = 0;
    for (let i = 1; i < count; i += 1) {
      // The search field keeps ArrowRight for its caret, so the deck's way out of it is a vertical
      // arrow (`toolbar-keyboard.ts`); every other stop takes ArrowRight.
      const inField = await page.evaluate(() => document.activeElement?.tagName === 'INPUT');
      await page.keyboard.press(inField ? 'ArrowDown' : 'ArrowRight');
      const at = await inside(`step ${String(i)}`);
      farthest = Math.max(farthest, at.scrollLeft);
    }
    expect(farthest, 'the line really scrolled to bring the last control in').toBeGreaterThan(0);
    expect(
      (await focusReading(page))?.id,
      'the lap reached the last control, so no stop was skipped or stuck',
    ).toBe('comments');

    // End after a lap lands where the lap ended; Home returns to the start of the line.
    await page.keyboard.press('Home');
    const home = await inside('Home');
    expect(home.scrollLeft, 'Home scrolls the line back to its start').toBe(0);
    await page.keyboard.press('End');
    const end = await inside('End');
    expect(end.scrollLeft, 'End scrolls the line to its end').toBeGreaterThan(0);

    // Tab into the deck from the header: the roving stop is the last control (End), the line is
    // scrolled back to its start, and the stop must be scrolled into view by the Tab that lands on it.
    await deck.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page.getByRole('button', { name: 'Show Project Explorer' }).focus();
    const toDeck = await page.evaluate(() => {
      const d = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      return d ? d.scrollLeft : null;
    });
    expect(toDeck, 'the line is back at its start before Tab').toBe(0);
    // The header's own controls come before the deck in tab order; Tab until the deck is reached.
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      const reading = await focusReading(page);
      if (reading) break;
    }
    const tabbed = await inside('Tab into the deck');
    expect(tabbed.scrollLeft, 'Tab scrolled the roving stop into view').toBeGreaterThan(0);
  });

  test('the line says it goes on: an edge fade that follows the scroll, and a control cut at the edge', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto(planUrl);
    const deck = commandBand(page);
    await expect(deck).toBeVisible();

    const read = () =>
      deck.evaluate((el) => {
        const cs = getComputedStyle(el);
        const d = el.getBoundingClientRect();
        const cut = [...el.querySelectorAll('[data-toolbar-focusable]')].filter((c) => {
          const r = c.getBoundingClientRect();
          return (r.left < d.left && r.right > d.left) || (r.left < d.right && r.right > d.right);
        }).length;
        return {
          mask: cs.maskImage,
          start: parseFloat(cs.getPropertyValue('--deck-fade-start')),
          end: parseFloat(cs.getPropertyValue('--deck-fade-end')),
          cut,
          remPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
        };
      });

    await deck.evaluate((el) => {
      el.scrollLeft = 0;
    });
    const atStart = await read();
    expect(atStart.mask, 'the deck is masked').not.toBe('none');
    expect(atStart.start, 'nothing fades at the start: the first control is whole').toBe(0);
    expect(atStart.end, 'the far edge fades: there is more').toBe(2 * atStart.remPx);
    // Which control straddles the edge depends on where the line happens to start, and the editing
    // row now leads it (owner decision, 2026-10-10), so the cue is asserted along the scroll: at some
    // position a control is cut, which is what tells a reader the line goes on where a mask is unavailable.
    const max = await deck.evaluate((el) => el.scrollWidth - el.clientWidth);
    let cutSomewhere = false;
    for (let x = 0; x <= max && !cutSomewhere; x += 24) {
      await deck.evaluate((el, left) => {
        el.scrollLeft = left;
      }, x);
      cutSomewhere = (await read()).cut >= 1;
    }
    expect(cutSomewhere, 'a control is cut at the edge, the cue where a mask is unavailable').toBe(
      true,
    );

    await deck.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect
      .poll(async () => (await read()).end, { message: 'the fade follows the scroll' })
      .toBe(0);
    const atEnd = await read();
    expect(atEnd.start, 'the leading edge fades at the end: there is more behind').toBe(
      2 * atEnd.remPx,
    );

    // A wide window has no line to scroll and no fade.
    await page.setViewportSize({ width: 1280, height: 600 });
    await expect(deck).toBeVisible();
    const wide = await deck.evaluate((el) => ({
      overflows: el.scrollWidth > el.clientWidth,
      mask: getComputedStyle(el).maskImage,
      rows: new Set(
        [...el.querySelectorAll('[data-deck-row]')].map((r) =>
          Math.round(r.getBoundingClientRect().top),
        ),
      ).size,
    }));
    expect(wide.overflows, '1280 x 600 does not scroll sideways').toBe(false);
    expect(wide.mask, '1280 x 600 has no fade').toBe('none');
    expect(wide.rows, '1280 x 600 keeps its two rows (CQ-3)').toBe(2);
  });

  test('in a squat window, focus moving into a band that has scrolled away brings it back into view', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    await page.setViewportSize({ width: 640, height: 300 });
    await page.goto(planUrl);
    const deck = commandBand(page);
    await expect(deck).toBeVisible();

    const shellScrollTop = () =>
      page.evaluate(() => document.querySelector('main')?.parentElement?.scrollTop ?? -1);
    /** The focused control's vertical position against the window, and whether it is in the deck. */
    const focusedInWindow = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        const inDeck = !!el?.closest('[role="toolbar"][aria-label="Plan commands"]');
        const r = el?.getBoundingClientRect();
        return { inDeck, top: r?.top ?? NaN, bottom: r?.bottom ?? NaN, h: window.innerHeight };
      });
    const scrollShellAway = async () => {
      await page.evaluate(() => {
        const shell = document.querySelector('main')?.parentElement;
        if (shell) shell.scrollTop = shell.scrollHeight;
      });
      // Without this the cases below would pass against a shell that never scrolled.
      expect(await shellScrollTop(), 'the shell scrolled, so the band is away').toBeGreaterThan(0);
      const away = await deck.evaluate((el) => el.getBoundingClientRect().bottom);
      expect(away, 'the band is above the window').toBeLessThanOrEqual(0);
    };

    // Shift+Tab from the foot strip, with the band scrolled away, until focus reaches the deck.
    await scrollShellAway();
    await expandPanel(page).focus();
    let reached = false;
    for (let i = 0; i < 80 && !reached; i += 1) {
      await page.keyboard.press('Shift+Tab');
      reached = (await focusedInWindow()).inDeck;
    }
    expect(reached, 'Shift+Tab from the foot strip reaches the deck').toBe(true);
    let at = await focusedInWindow();
    expect(at.top, 'Shift+Tab into the deck: its top is on screen').toBeGreaterThanOrEqual(0);
    expect(at.bottom, 'Shift+Tab into the deck: its bottom is on screen').toBeLessThanOrEqual(at.h);

    // An arrow press inside a deck that has scrolled away again: the roving move is the deck's own
    // focus (preventScroll), so the shell only follows because `onFocus` scrolls it.
    await scrollShellAway();
    await page.keyboard.press('ArrowRight');
    at = await focusedInWindow();
    expect(at.inDeck, 'ArrowRight stays in the deck').toBe(true);
    expect(
      at.top,
      'ArrowRight: the moved-to control is scrolled into the window, top',
    ).toBeGreaterThanOrEqual(0);
    expect(
      at.bottom,
      'ArrowRight: the moved-to control is scrolled into the window, bottom',
    ).toBeLessThanOrEqual(at.h);
  });

  for (const pointer of ['fine', 'coarse'] as const) {
    test.describe(`a menu from a half-scrolled trigger, ${pointer} pointer`, () => {
      test.use({ hasTouch: pointer === 'coarse' });

      test('Share & export and View open on screen from either edge of the line', async ({
        page,
      }) => {
        test.setTimeout(300_000);
        page.setDefaultTimeout(20_000);
        const { planUrl } = await seedWorkspace(page);
        await page.setViewportSize({ width: 640, height: 480 });
        await page.goto(planUrl);
        const deck = commandBand(page);
        await expect(deck).toBeVisible();

        // The trailing edge is Share & export (a `Menu`), the last control of the line; the leading
        // edge needs a control with line after it to scroll under, so it is View (the other overlay
        // the deck opens, a popover panel). Both are portalled and clamped by `overlay-position`.
        for (const [edge, id, opens, role] of [
          ['trailing', 'export', 'Share & export', 'menu'],
          ['leading', 'view', 'View', 'dialog'],
        ] as const) {
          // Park the trigger half under the named edge of the line, the case a clamp has to answer.
          await deck.evaluate(
            (el, args) => {
              const t = el.querySelector(`[data-toolbar-item="${args.id}"]`);
              if (!t) throw new Error('no trigger');
              const d = el.getBoundingClientRect();
              const r = t.getBoundingClientRect();
              el.scrollLeft +=
                args.edge === 'trailing'
                  ? r.right - (d.right + r.width / 2)
                  : r.left - (d.left - r.width / 2);
            },
            { id, edge },
          );
          const trigger = deck.locator(`[data-toolbar-item="${id}"]`);
          const box = await boxOf(trigger, opens);
          const deckBox = await boxOf(deck, 'the deck');
          const cut = box.x < deckBox.x || box.x + box.width > deckBox.x + deckBox.width;
          expect(cut, `${edge}: the trigger is half under the edge`).toBe(true);

          // Press the half that is showing.
          const x =
            edge === 'trailing'
              ? (box.x + deckBox.x + deckBox.width) / 2
              : (deckBox.x + box.x + box.width) / 2;
          const y = box.y + box.height / 2;
          if (pointer === 'coarse') await page.touchscreen.tap(x, y);
          else await page.mouse.click(x, y);
          const menu =
            role === 'menu' ? page.getByRole('menu') : page.getByRole('dialog', { name: opens });
          await expect(menu, `${edge}: ${opens} opens`).toBeVisible();
          // The overlay measures itself and re-clamps in a layout effect, so read it once it has
          // stopped moving rather than at the first frame it is visible.
          let last = '';
          await expect
            .poll(
              async () => {
                const now = JSON.stringify(await menu.boundingBox());
                const settled = now === last;
                last = now;
                return settled;
              },
              { message: `${edge}: the menu stops moving` },
            )
            .toBe(true);
          const m = await boxOf(menu, 'the menu');
          const vw = 640;
          const vh = 480;
          expect(m.x, `${edge}: the menu starts on screen`).toBeGreaterThanOrEqual(0);
          expect(m.x + m.width, `${edge}: the menu ends on screen`).toBeLessThanOrEqual(vw);
          expect(m.y, `${edge}: the menu starts below the top`).toBeGreaterThanOrEqual(0);
          expect(m.y + m.height, `${edge}: the menu ends above the bottom`).toBeLessThanOrEqual(vh);
          await pointerReachable(
            page,
            `${edge}: the overlay's first control`,
            role === 'menu' ? menu.getByRole('menuitem').first() : menu.getByRole('radio').first(),
          );
          await page.keyboard.press('Escape');
          await expect(menu).toBeHidden();
          await expect(trigger, `${edge}: focus returns to the trigger`).toBeFocused();
        }
      });
    });
  }
});

test.describe('the editing row leads on the scrolling line (owner decision, 2026-10-10)', () => {
  test.use({ acknowledgeViewportNotice: true });

  /**
   * Every deck control in document order with where it is drawn. The Tab and arrow sequence is the
   * document's (`[data-toolbar-focusable]`), so "the order on screen is the order of the keys" is
   * this list being sorted by its own position — which is what WCAG 1.3.2 and 2.4.3 ask.
   */
  async function deckStops(
    page: Page,
  ): Promise<{ id: string; row: string; x: number; y: number }[]> {
    return page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[role="toolbar"][aria-label="Plan commands"] [data-toolbar-focusable]',
        ),
      ].map((el) => {
        const b = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-toolbar-item') ?? '',
          row: el.closest('[data-deck-row]')?.getAttribute('data-deck-row') ?? '',
          x: Math.round(b.x),
          y: Math.round(b.y),
        };
      }),
    );
  }

  test('below 1024 the pen leads, DO comes before LOOK, and the DOM order is the order on screen; at 1024 and up LOOK is above DO as before', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(20_000);
    const { planUrl } = await seedWorkspace(page);
    await page.setViewportSize({ width: 800, height: 760 });
    await page.goto(planUrl);
    await expect(commandBand(page).getByRole('button', { name: 'Go to today' })).toBeAttached();

    const narrow = await deckStops(page);
    expect(narrow.length).toBeGreaterThan(10);
    // Rows in the order the document renders them: every DO control before every LOOK control.
    const rowsSeen = narrow.map((s) => s.row).filter((r, i, all) => i === 0 || r !== all[i - 1]);
    expect(rowsSeen, 'DO then LOOK, each row contiguous').toEqual(['do', 'look']);
    // The first control is the pen, on screen as in the document.
    expect(narrow[0]?.id).toBe('pen');
    // One line: no control sits left of the one before it, so the document order is the reading
    // order on screen (a CSS `order` would have made this list jump backwards).
    for (let i = 1; i < narrow.length; i += 1) {
      expect(
        narrow[i]!.x,
        `${narrow[i]!.id} is drawn left of ${narrow[i - 1]!.id}, so the keys would jump backwards`,
      ).toBeGreaterThanOrEqual(narrow[i - 1]!.x);
    }
    // And the keys really do walk that order: focus the first stop and arrow along.
    await page.locator('[data-toolbar-item="pen"]').focus();
    for (let i = 1; i < 6; i += 1) {
      await page.keyboard.press('ArrowRight');
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute('data-toolbar-item') ?? ''),
        `arrow ${String(i)} lands on the next control on screen`,
      ).toBe(narrow[i]?.id);
    }

    // At the floor and wider the rows stack LOOK above DO, unchanged.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(commandBand(page)).toBeVisible();
    const wide = await deckStops(page);
    const rowsWide = wide.map((s) => s.row).filter((r, i, all) => i === 0 || r !== all[i - 1]);
    expect(rowsWide, 'LOOK then DO at 1280').toEqual(['look', 'do']);
    const lookY = Math.max(...wide.filter((s) => s.row === 'look').map((s) => s.y));
    const doY = Math.min(...wide.filter((s) => s.row === 'do').map((s) => s.y));
    expect(doY, 'DO is drawn below LOOK at 1280').toBeGreaterThan(lookY);
  });
});
