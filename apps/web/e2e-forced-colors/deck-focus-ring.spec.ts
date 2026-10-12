import { type Locator, type Page } from '@playwright/test';

import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import { createHierarchy, ensurePen, newPlan, onboard } from '../e2e-workspace-chrome/support';

/**
 * **The command deck's rows clip their edges, and the forced-colours focus ring must still show at
 * them** (toolbar-grid M1; WCAG 2.2 §2.4.7).
 *
 * Each deck row has `overflow-x: clip` so a group divider hung outside the row's box is not painted at
 * the start of a line (`deck-row-clip`, `globals.css`). Under forced colours a focused control's
 * indicator is `outline: 2px solid Highlight; outline-offset: 2px`, so it reaches **4 px** outside the
 * control, and a clip at the row's own edge cuts it on the first control of every line and the last
 * at the right edge. `focus-ring.spec.ts` cannot see that: it names three controls on `/sign-in`, and
 * says in its own docblock that ancestor clipping is not exercised.
 *
 * **The assertion is a strip of pixels just outside the control's edge, before and after focus.** The
 * ring is the only thing that can change a strip that lies wholly outside the control's box, so a
 * difference means the ring is painted there and no difference means it was cut. It is read for the
 * first control of every line and the last control at the right edge, on both pointers, at 1912, at
 * 1280 with Add armed (DO wraps there) and at the 1024 floor, where touch wraps to four lines.
 *
 * **Verified red** by setting the clip margin to `0` (`overflow-clip-margin: 0` in `deck-row-clip`):
 * every first-in-line control fails. The `forcedColors: 'none'` case is its control: an ordinary ring is
 * an inset box-shadow, so nothing is drawn outside the box and the same strip must NOT change — which
 * is what proves the strip measures the outline and not, say, a hover wash.
 */
const CELLS = [
  { width: 1912, height: 1080, armAdd: false },
  { width: 1280, height: 800, armAdd: true },
  { width: 1024, height: 600, armAdd: false },
];

const RING_PX = 4;

interface Edge {
  item: string;
  side: 'left' | 'right';
  row: string;
}

/** The controls that sit on a row's left or right edge, one per line and side. */
async function edgeControls(page: Page): Promise<Edge[]> {
  return page.evaluate(() => {
    const out: { item: string; side: 'left' | 'right'; row: string }[] = [];
    for (const row of document.querySelectorAll<HTMLElement>(
      '[role="toolbar"][aria-label="Plan commands"] [data-deck-row]',
    )) {
      const rb = row.getBoundingClientRect();
      const controls = [...row.querySelectorAll<HTMLElement>('[data-toolbar-focusable]')]
        .map((el) => ({ el, b: el.getBoundingClientRect() }))
        .filter(({ b }) => b.width > 8 && b.height > 8);
      const lines = new Map<number, typeof controls>();
      for (const c of controls) {
        const key = [...lines.keys()].find((k) => Math.abs(k - c.b.top) < 4) ?? c.b.top;
        lines.set(key, [...(lines.get(key) ?? []), c]);
      }
      for (const line of lines.values()) {
        const first = line.reduce((a, c) => (c.b.left < a.b.left ? c : a));
        const last = line.reduce((a, c) => (c.b.right > a.b.right ? c : a));
        const id = (el: HTMLElement): string => el.getAttribute('data-toolbar-item') ?? '';
        if (Math.abs(first.b.left - rb.left) <= 2)
          out.push({
            item: id(first.el),
            side: 'left',
            row: row.getAttribute('data-deck-row') ?? '',
          });
        if (Math.abs(rb.right - last.b.right) <= 2)
          out.push({
            item: id(last.el),
            side: 'right',
            row: row.getAttribute('data-deck-row') ?? '',
          });
      }
    }
    return out;
  });
}

/** Whether focusing the control by keyboard changes the strip of pixels just outside one of its edges. */
async function ringReachesOutside(page: Page, target: Locator, side: 'left' | 'right') {
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const box = await target.boundingBox();
  if (!box) throw new Error('the control has no box');
  const clip = {
    x: side === 'left' ? box.x - RING_PX : box.x + box.width,
    y: box.y + 4,
    width: RING_PX,
    height: box.height - 8,
  };
  const before = await page.screenshot({ clip });
  // A key press first, so `:focus-visible` matches the programmatic focus that follows.
  await page.keyboard.press('Shift');
  await target.focus();
  await expect(target).toBeFocused();
  const after = await page.screenshot({ clip });
  return !before.equals(after);
}

async function openPlan(page: Page): Promise<void> {
  await acknowledgeViewportNotice(page.context());
  await page.setViewportSize({ width: 1440, height: 900 });
  await onboard(page, Date.now() + Math.floor(Math.random() * 1000));
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
  await ensurePen(page);
}

async function sweep(page: Page, expectRing: boolean): Promise<number> {
  let checked = 0;
  for (const cell of CELLS) {
    await page.setViewportSize({ width: cell.width, height: cell.height });
    await page.waitForTimeout(500);
    if (cell.armAdd) {
      await page.locator('[data-toolbar-item="add-activity"]').first().click();
      await page.waitForTimeout(300);
    }
    const edges = await edgeControls(page);
    // The pinned positive: a deck with no control on an edge would pass the loop vacuously.
    expect(
      edges.some((e) => e.side === 'left'),
      `no left-edge control at ${cell.width}`,
    ).toBe(true);
    expect(
      edges.some((e) => e.side === 'right'),
      `no right-edge control at ${cell.width}`,
    ).toBe(true);
    for (const edge of edges) {
      const target = page.locator(`[data-toolbar-item="${edge.item}"]`).first();
      const changed = await ringReachesOutside(page, target, edge.side);
      expect(
        changed,
        `${edge.row} row, ${edge.side} edge, ${edge.item} at ${cell.width}: ${
          expectRing ? 'the focus ring is cut at the row edge' : 'an ordinary ring painted outside'
        }`,
      ).toBe(expectRing);
      checked += 1;
    }
    if (cell.armAdd) await page.keyboard.press('Escape');
  }
  return checked;
}

test.describe('forced colours: the deck focus ring at a row edge', () => {
  test.use({ forcedColors: 'active' });

  test('a fine pointer: every edge control shows its whole ring', async ({ page }) => {
    test.setTimeout(300_000);
    await openPlan(page);
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    expect(await sweep(page, true)).toBeGreaterThan(6);
  });
});

test.describe('forced colours: the deck focus ring at a row edge, under touch', () => {
  test.use({ forcedColors: 'active', hasTouch: true });

  test('a coarse pointer: every edge control shows its whole ring', async ({ page }) => {
    test.setTimeout(300_000);
    await openPlan(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(await sweep(page, true)).toBeGreaterThan(6);
  });
});

test.describe('ordinary colours: the control', () => {
  test.use({ forcedColors: 'none' });

  test('the ordinary ring is inside the control, so nothing is drawn outside its edge', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openPlan(page);
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(false);
    expect(await sweep(page, false)).toBeGreaterThan(6);
  });
});
