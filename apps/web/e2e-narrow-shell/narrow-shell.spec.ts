import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';

import { activityEditor } from '../e2e-support/activity-editor';
import { expect, test } from '../e2e-support/test';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

/**
 * **The narrow shell** (`docs/specs/narrow-shell-journey/`, closes `docs/TECH_DEBT.md` #172).
 *
 * The first authenticated journey ever to run below `lg` (1024 px). It runs at 640 × 480 — a 1280
 * window at 200 % zoom — because below the 1024 floor is the zoom band, not a phone (ADR-0179). Its subjects are the branches
 * no browser had opened: the off-canvas `Sheet` that IS the Project Explorer on a narrow screen,
 * the header hamburger that opens it, the `matchMedia` transition effect that closes it on
 * crossing `lg`, and the below-`md` workspace fallback that ADR-0114 M7's gate pass found broken
 * — by a specialist review, because this suite did not exist to find it.
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

test.describe('after "Continue anyway" the shell is the existing narrow layout', () => {
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

    // ── FR-4: below `md` the plan's facts render in the shell fallback, not a hidden pane
    // (the ADR-0114 M7 regression, asserted in a real layout for the first time).
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

  // ── 6. At 320 x 256, after Continue: the existing narrow layout still works.
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

  // A dialog: the activity editor, reached from the Activities pane's row menu. At 320 px WIDE but
  // not 256 tall: 1.4.10 is a width obligation, and the plan workspace's chrome (band, facts row)
  // leaves a 256 px window no pane to click in — height never triggers the notice and its own
  // vertical budget is the M4 payoff (`m0-measurement.md` §4), not a reflow defect.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(planUrl);
  await ensurePen(page);
  await page.getByRole('radio', { name: 'Activities' }).click();
  // By keyboard: at 320 px the row's `⋯` is under the pane's own bar for a pointer (a finding
  // below the designed floor, not a reflow failure — nothing scrolls sideways and the control is
  // keyboard-reachable; docs/TECH_DEBT.md #466).
  await page.getByRole('button', { name: 'Actions for Dig footings' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Edit' }).focus();
  await page.keyboard.press('Enter');
  await expect(activityEditor(page)).toBeVisible();
  await expectAxeClean(page, 'the activity editor at 320 x 256');
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
