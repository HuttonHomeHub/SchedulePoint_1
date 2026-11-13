import AxeBuilder from '@axe-core/playwright';
import { type CDPSession, type Page } from '@playwright/test';

import { holdThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';

import { addActivity, onboard, openNewPlan } from './support';

// Under a browser text-size setting (CDP below) a 1024 px window is 32 rem wide, which is under the
// designed floor, so the viewport notice would take a banner row of its own and move every reading.
test.use({ acknowledgeViewportNotice: true });

/**
 * **The help sheet lists the finger gestures** (`docs/specs/long-press-hint/` M1).
 *
 * The sheet is opened from the **account menu**, not with `?`: the seam between the entry point and
 * the surface is what a unit suite cannot see (ADR-0081). The diagram lists the two gestures that
 * work everywhere; the Gantt adds its row gesture and, only where editing is live, tap-then-drag.
 * The diagram canvas lists none, because nothing in it behaves differently for a finger (spec §2.5).
 */
test('the help sheet lists the touch gestures, in the diagram and in the Gantt', async ({
  page,
}) => {
  // The 1024 × 600 design floor (ADR-0179): a gesture phrase must wrap, not scroll sideways.
  await page.setViewportSize({ width: 1024, height: 600 });
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  const accountChip = page.getByRole('button', { name: /Account:/ });
  const openSheet = async (name: string) => {
    await accountChip.click();
    await page.getByRole('menuitem', { name: 'Shortcuts and gestures' }).click();
    const sheet = page.getByRole('dialog', { name });
    await expect(sheet).toBeVisible();
    return sheet;
  };
  // The dialog and every list inside it: a wrapped phrase must not widen any of them.
  const noSidewaysScroll = async (sheet: ReturnType<typeof page.getByRole>) => {
    const widths = await sheet.evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll('dl'))].map((n) => n.scrollWidth - n.clientWidth),
    );
    expect(widths.length).toBeGreaterThan(1);
    for (const w of widths) expect(w).toBeLessThanOrEqual(0);
  };
  const touchTerms = (sheet: ReturnType<typeof page.getByRole>) =>
    sheet
      .getByRole('heading', { name: 'Touch' })
      .locator('xpath=following-sibling::dl[1]')
      .locator('dt');

  // ---------------------------------------------------------------- the diagram, read-only
  const diagramSheet = await openSheet('Diagram shortcuts and gestures');
  await expect(diagramSheet.getByRole('heading', { name: 'Touch' })).toBeVisible();
  await expect(touchTerms(diagramSheet)).toHaveText([
    'Press and hold an icon button',
    'Press and hold an Explorer row',
  ]);
  await expect(diagramSheet.getByText('Tap a bar, then drag it')).toBeHidden();
  await noSidewaysScroll(diagramSheet);

  const results = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(diagramSheet).toBeHidden();
  await expect(accountChip).toBeFocused();

  // ---------------------------------------------------------------- the Gantt, with the pen
  await holdThePen(page);
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gantt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const ganttSheet = await openSheet('Gantt shortcuts and gestures');
  await expect(touchTerms(ganttSheet)).toHaveText([
    'Press and hold an icon button',
    'Press and hold an Explorer row',
    'Press and hold a row or bar',
    'Tap a bar, then drag it',
  ]);
  await noSidewaysScroll(ganttSheet);

  const ganttResults = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(ganttResults.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(ganttSheet).toBeHidden();
  await expect(accountChip).toBeFocused();
});

/**
 * **A finger's first press in a plan raises a one-time tip** (`docs/specs/long-press-hint/` M2).
 *
 * Driven by dispatching `pointerType` events, the method `toolbar.spec.ts` already trusts: the
 * tip's trigger keys on exactly that field (ADR-0177 D1), so the events run the real listeners in a
 * real browser and no device is needed. A mouse and a pen must NOT raise it.
 */
const TIP = 'Press and hold an icon button to see its name. A tap still presses it.';

/**
 * Dispatch a `pointerdown` of the given type on the Comments icon button. (Not the zoom glyphs:
 * at the 1024 x 600 floor they are folded into a popover and are not on the strip.)
 */
async function press(page: Page, pointerType: 'mouse' | 'pen' | 'touch'): Promise<void> {
  const glyph = page.getByRole('button', { name: 'Comments' });
  await expect(glyph).toBeVisible();
  const box = await glyph.boundingBox();
  if (!box) throw new Error('the Comments glyph has no box');
  await glyph.dispatchEvent('pointerdown', {
    pointerType,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  });
  await glyph.dispatchEvent('pointerup', { pointerType });
}

/**
 * Tab from the plan surface reaches both of the strip's buttons. This is the keyboard half of the
 * 200 % text check (WCAG 1.4.4, no loss of function); {@link probeStrip} is the pointer half.
 */
async function tabReachesStrip(page: Page, tag: string): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelector<HTMLElement>('[role="treegrid"] [role="row"][tabindex="0"], [role="listbox"]')
      ?.focus();
  });
  const wanted = new Set(['Touch gestures', 'Dismiss this tip']);
  const reached = new Set<string>();
  for (let i = 0; i < 120 && reached.size < wanted.size; i += 1) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ??
        document.activeElement?.textContent?.trim() ??
        '',
    );
    if (wanted.has(label)) reached.add(label);
  }
  expect([...reached].sort(), `${tag}: Tab reaches both strip buttons`).toEqual([...wanted].sort());
}

/**
 * The strip's two controls hit-testable at centre and corners **once scrolled into view**, and no
 * sideways scroll on it or any ancestor.
 *
 * Under large text the shell is the scroller (`squat`, ADR-0213) and the band sits above a
 * full-window body, so a control is first off-window and a planner scrolls to it: each control is
 * scrolled into view (`block: 'nearest'`) and a frame passes before it is hit-tested. A tooltip left
 * open by an earlier press is set to `pointer-events: none` so it cannot report a cover. The corner
 * inset scales with the root size, because the controls' `rounded-md` radius is in rem: a fixed 4 px
 * lies outside the arc at a 32 px root and reports a strip that is not there
 * (`docs/specs/large-text-dock/m0-measurement.md`, correction 6).
 *
 * Returns the strip height and the foot row's top **before any scrolling**, recorded (ADR-0142) so
 * the report shows what the reader saw at rest, not only what they reached.
 */
async function probeStrip(
  page: Page,
  tag: string,
): Promise<{ height: number; footTopAtRest: number }> {
  const message = page.getByText(TIP);
  await expect(message, `${tag}: the tip is up`).toBeVisible();
  const report = await message.evaluate(async (el) => {
    let strip: HTMLElement = el.parentElement as HTMLElement;
    while (strip.parentElement && !strip.querySelector('button[aria-label="Dismiss this tip"]')) {
      strip = strip.parentElement;
    }
    for (const tooltip of document.querySelectorAll<HTMLElement>('[data-tooltip]')) {
      tooltip.style.pointerEvents = 'none';
    }
    const footTopAtRest = (
      strip.closest<HTMLElement>('[data-activities-bar]') ?? strip
    ).getBoundingClientRect().top;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const inset = (4 * rootPx) / 16;
    const frame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const hits: Record<string, string[]> = {};
    const sizes: Record<string, [number, number]> = {};
    for (const name of ['Touch gestures', 'Dismiss this tip']) {
      const control = Array.from(strip.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
      );
      if (!control) throw new Error(`no ${name} control`);
      control.scrollIntoView({ block: 'nearest' });
      await frame();
      const r = control.getBoundingClientRect();
      sizes[name] = [r.width, r.height];
      const points: [number, number][] = [
        [r.x + r.width / 2, r.y + r.height / 2],
        [r.x + inset, r.y + inset],
        [r.right - inset, r.y + inset],
        [r.x + inset, r.bottom - inset],
        [r.right - inset, r.bottom - inset],
      ];
      hits[name] = points.map((p) => {
        const top = document.elementFromPoint(p[0], p[1]);
        return top !== null && control.contains(top) ? 'self' : (top?.tagName ?? 'none');
      });
    }
    const overflow: number[] = [];
    for (let n: HTMLElement | null = strip; n; n = n.parentElement) {
      overflow.push(n.scrollWidth - n.clientWidth);
    }
    return {
      height: strip.getBoundingClientRect().height,
      footTopAtRest,
      hits,
      overflow,
      sizes,
      coarse: matchMedia('(pointer: coarse)').matches,
    };
  });
  // WCAG 2.5.8 and ADR-0118: under a coarse pointer every control is finger-sized.
  if (report.coarse) {
    for (const [name, [width, height]] of Object.entries(report.sizes)) {
      expect(width, `${tag}: ${name} width`).toBeGreaterThanOrEqual(44);
      expect(height, `${tag}: ${name} height`).toBeGreaterThanOrEqual(44);
    }
  }
  for (const [name, hits] of Object.entries(report.hits)) {
    expect(hits, `${tag}: ${name} centre and corners`).toEqual(Array(5).fill('self'));
  }
  for (const w of report.overflow) expect(w, `${tag}: no sideways scroll`).toBeLessThanOrEqual(0);
  return { height: report.height, footTopAtRest: report.footTopAtRest };
}

/**
 * **Large text by a browser setting**: CDP `Page.setFontSizes`, so `rem` media queries answer as they
 * do for a real text-size preference (a CSS `html { font-size }` moves `rem` lengths and not `rem`
 * media queries). Copied from `e2e-narrow-shell/narrow-shell.spec.ts`: a Playwright `testDir` is its
 * own compilation root, and `promotion.spec.ts` and `month-labels.spec.ts` copy it the same way.
 *
 * The session is returned **attached** and the caller detaches it after the last assertion: the
 * override lives in the DevTools agent's per-page state. The root is asserted `32px` before anything
 * is measured, and applied once more if it still reads 16 px (the CI-defensive form of that file).
 */
async function setDefaultFontSize(page: Page, scale: 1 | 2): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await applyDefaultFontSize(cdp, scale);
  const wanted = `${String(16 * scale)}px`;
  const read = (): Promise<string> =>
    page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  await page.waitForTimeout(300);
  if ((await read()) !== wanted) {
    await applyDefaultFontSize(cdp, scale);
    await page.waitForTimeout(300);
  }
  expect(await read(), `the root size reads ${wanted} under CDP scale ${String(scale)}`).toBe(
    wanted,
  );
  return cdp;
}

async function applyDefaultFontSize(cdp: CDPSession, scale: 1 | 2): Promise<void> {
  await cdp.send('Page.setFontSizes', {
    fontSizes: {
      standard: 16 * scale,
      fixed: 13 * scale,
      serif: 16 * scale,
      sansSerif: 16 * scale,
    },
  } as never);
}

/**
 * **Large text by a user style sheet's root size** (`html { font-size: 200% }`, here inline): `rem`
 * lengths double and `rem` media queries do not. No browser setting produces it, but a user style
 * sheet does, and it is what #569 reproduced under. `squat` is a container query on the shell frame
 * (ADR-0213), so it answers in the root size in force and the shell must take its scrolling form
 * here exactly as it does under the setting: asserted, because a frame that stopped answering would
 * leave the band holding the window and every probe below reporting a cover.
 */
async function enlargeByRootSize(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
    '32px',
  );
  expect(
    await page.evaluate(
      () => getComputedStyle(document.querySelector('main#main')!.parentElement!).overflowY,
    ),
    'the shell takes its scrolling form under an inline 200 % root',
  ).toBe('auto');
}

test('a finger raises the tip once; a mouse or pen does not; it never returns', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1024, height: 600 });
  await onboard(page, Date.now() + 1);
  await openNewPlan(page);
  await holdThePen(page);
  // The diagram's dock (where the tip renders) is mounted only once there is something to draw.
  await addActivity(page, 'Excavate');
  const tip = page.getByText(TIP);

  await press(page, 'mouse');
  await press(page, 'pen');
  await expect(tip).toBeHidden();

  await press(page, 'touch');
  const fine = await probeStrip(page, 'fine 1024 x 600');

  // Large text (WCAG 1.4.4, no loss of function) by a browser setting: every strip button takes a
  // pointer press once scrolled to, and the keyboard still reaches it.
  const cdp = await setDefaultFontSize(page, 2);
  try {
    const large = await probeStrip(page, 'fine 1024 x 600 at 200% text (browser setting)');
    expect(large.height).toBeGreaterThanOrEqual(fine.height);
    await tabReachesStrip(page, 'fine 1024 x 600 at 200% text (browser setting)');
    await applyDefaultFontSize(cdp, 1);
  } finally {
    await cdp.detach();
  }
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
    '16px',
  );

  // The same by a user style sheet's root size: ADR-0213's guard for the route #569 was found on.
  try {
    await enlargeByRootSize(page);
    const large = await probeStrip(page, 'fine 1024 x 600 at 200% text (root size)');
    expect(large.height).toBeGreaterThanOrEqual(fine.height);
    await tabReachesStrip(page, 'fine 1024 x 600 at 200% text (root size)');
  } finally {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
  }

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // Touch gestures opens the sheet and the tip stays; Escape returns focus to the button.
  const open = page.getByRole('button', { name: 'Touch gestures', exact: true });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Diagram shortcuts and gestures' });
  await expect(sheet.getByRole('heading', { name: 'Touch' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(tip).toBeVisible();
  await expect(open).toBeFocused();

  // Dismiss withdraws it, hands focus to the plan surface, and it does not come back. At 1024 x 600
  // the activities panel takes the body (ADR-0180) and the diagram is not mounted, so the surface
  // that is reachable is the panel's toggle in the foot row; the strip's own buttons must not be it.
  await page.getByRole('button', { name: 'Dismiss this tip' }).click();
  await expect(tip).toBeHidden();
  const focusLanded = await page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return false;
    // The toggle is the destination when no plan surface can take focus. The diagram stays mounted
    // under a `hidden` wrapper while the panel takes the body, so mounted is not the test.
    const surface = document.querySelector('[role="listbox"], [role="treegrid"]');
    return surface !== null && surface.closest('[hidden], [inert]') === null
      ? surface.contains(active)
      : active.closest('[data-activities-toggle]') !== null;
  });
  expect(focusLanded, 'focus is on the plan surface, not <body>').toBe(true);
  await page.reload();
  // The dismissal is on the device, not in memory: read the key the app reads.
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('schedulepoint-hints') ?? '{}')),
  ).toMatchObject({ 'touch-gestures': true });
  await press(page, 'touch');
  // Settle past the hook's frame, so "hidden" is not asserted before the strip could have shown.
  await page.waitForTimeout(500);
  await expect(tip).toBeHidden();
});

test('the tip is raised in the Gantt too, on a coarse pointer', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({
    viewport: { width: 1024, height: 600 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await onboard(page, Date.now() + 2);
    await openNewPlan(page);
    await holdThePen(page);
    const gantt = page.getByRole('button', { name: 'Gantt', exact: true });
    await gantt.click();
    await expect(gantt).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const tip = page.getByText(TIP);
    await expect(tip).toBeHidden();

    // The listener is the document's, so any element will carry the touch. This one is a button
    // (the view switch), not a Gantt bar or cell: the Gantt's own gestures are not the subject.
    await gantt.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await gantt.dispatchEvent('pointerup', { pointerType: 'touch' });
    await probeStrip(page, 'coarse 1024 x 600, Gantt');
    const cdp = await setDefaultFontSize(page, 2);
    try {
      await probeStrip(page, 'coarse 1024 x 600 at 200% text (browser setting), Gantt');
      await tabReachesStrip(page, 'coarse 1024 x 600 at 200% text (browser setting), Gantt');
      await applyDefaultFontSize(cdp, 1);
    } finally {
      await cdp.detach();
    }
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
      '16px',
    );
    try {
      await enlargeByRootSize(page);
      await probeStrip(page, 'coarse 1024 x 600 at 200% text (root size), Gantt');
      await tabReachesStrip(page, 'coarse 1024 x 600 at 200% text (root size), Gantt');
    } finally {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
    }

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await context.close();
  }
});
