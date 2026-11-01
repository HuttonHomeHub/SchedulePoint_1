import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import { onboard, openNewPlan, startEditing } from './support';

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
  await startEditing(page);
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

/** Dispatch a `pointerdown` of the given type on the zoom-out deck glyph. */
async function press(page: Page, pointerType: 'mouse' | 'pen' | 'touch'): Promise<void> {
  const glyph = page.locator('[data-toolbar-item="zoom-out"]');
  await expect(glyph).toBeVisible();
  const box = await glyph.boundingBox();
  if (!box) throw new Error('the zoom-out glyph has no box');
  await glyph.dispatchEvent('pointerdown', {
    pointerType,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  });
  await glyph.dispatchEvent('pointerup', { pointerType });
}

/**
 * The strip's two controls hit-testable at centre and corners, and no sideways scroll on it or any
 * ancestor. Returns the strip height, recorded (ADR-0142) so the report shows what the foot row paid.
 */
async function probeStrip(page: Page, tag: string): Promise<number> {
  const message = page.getByText(TIP);
  await expect(message, `${tag}: the tip is up`).toBeVisible();
  const report = await message.evaluate((el) => {
    let strip: HTMLElement = el.parentElement as HTMLElement;
    while (strip.parentElement && !strip.querySelector('button[aria-label="Dismiss this tip"]')) {
      strip = strip.parentElement;
    }
    const hits: Record<string, string[]> = {};
    const sizes: Record<string, [number, number]> = {};
    for (const name of ['Touch gestures', 'Dismiss this tip']) {
      const control = Array.from(strip.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
      );
      if (!control) throw new Error(`no ${name} control`);
      const r = control.getBoundingClientRect();
      sizes[name] = [r.width, r.height];
      const points: [number, number][] = [
        [r.x + r.width / 2, r.y + r.height / 2],
        [r.x + 2, r.y + 2],
        [r.right - 2, r.y + 2],
        [r.x + 2, r.bottom - 2],
        [r.right - 2, r.bottom - 2],
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
  return report.height;
}

test('a finger raises the tip once; a mouse or pen does not; it never returns', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1024, height: 600 });
  await onboard(page, Date.now() + 1);
  await openNewPlan(page);
  await startEditing(page);
  const tip = page.getByText(TIP);

  await press(page, 'mouse');
  await press(page, 'pen');
  await expect(tip).toBeHidden();

  await press(page, 'touch');
  const fine = await probeStrip(page, 'fine 1024 x 600');

  // Text-only 200 % (WCAG 1.4.4): still reachable, still no sideways scroll.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const large = await probeStrip(page, 'fine 1024 x 600 at 200% text');
  expect(large).toBeGreaterThanOrEqual(fine);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });

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

  // Dismiss withdraws it, hands focus to the plan surface, and it does not come back.
  await page.getByRole('button', { name: 'Dismiss this tip' }).click();
  await expect(tip).toBeHidden();
  const focusLanded = await page.evaluate(() => {
    const active = document.activeElement;
    return (
      active !== null &&
      active !== document.body &&
      active.closest('[role="listbox"], [role="treegrid"]') !== null
    );
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
    await startEditing(page);
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
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await probeStrip(page, 'coarse 1024 x 600 at 200% text, Gantt');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await context.close();
  }
});
