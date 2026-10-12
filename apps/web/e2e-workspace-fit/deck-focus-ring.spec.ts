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
 * at the right edge. `e2e-forced-colors/focus-ring.spec.ts` cannot see that: it names three controls on `/sign-in`, and
 * says in its own docblock that ancestor clipping is not exercised.
 *
 * **The assertion is a strip of pixels just outside the control's edge, before and after focus.** The
 * ring is the only thing that can change a strip that lies wholly outside the control's box, so a
 * difference means the ring is painted there and no difference means it was cut. It is read for the
 * first control of every line and the last control at the right edge, on both pointers, at 1912, at
 * 1280 with Add armed (DO wraps there) and at the 1024 floor, where touch wraps to four lines.
 *
 * **It lives in this suite and not in `e2e-forced-colors`** because it needs a signed-in plan workspace:
 * that suite runs against a production preview whose CI environment cannot create an account, and its
 * four tests never sign in. `forcedColors` is a per-test context option, so nothing else is needed.
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
/**
 * The strip read is the ring's OUTERMOST pixel of CSS width, not the whole 4 px. A clip that shaves a
 * fractional device pixel off the ring's outer edge leaves the inner 3 px painted, so a strip that
 * covered all four would still change on focus and pass.
 */
const OUTER_BAND_PX = 1;

type Side = 'left' | 'right' | 'top' | 'bottom';

interface Edge {
  item: string;
  side: Side;
  row: string;
}

/** The controls that sit on a row's left or right edge, one per line and side. */
async function edgeControls(page: Page): Promise<Edge[]> {
  return page.evaluate(() => {
    const out: { item: string; side: Side; row: string }[] = [];
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
      const id = (el: HTMLElement): string => el.getAttribute('data-toolbar-item') ?? '';
      const rowId = row.getAttribute('data-deck-row') ?? '';
      // The block axis clips too, so a control on the first or last line is checked at its top or
      // bottom edge: a row that clipped only across would cut nothing a left/right strip could see.
      const ordered = [...lines.entries()].sort(([a], [b]) => a - b);
      const top = ordered[0]?.[1].find((c) => Math.abs(c.b.top - rb.top) <= 2);
      const bottom = ordered.at(-1)?.[1].find((c) => Math.abs(rb.bottom - c.b.bottom) <= 2);
      if (top) out.push({ item: id(top.el), side: 'top', row: rowId });
      if (bottom) out.push({ item: id(bottom.el), side: 'bottom', row: rowId });
      for (const line of lines.values()) {
        const first = line.reduce((a, c) => (c.b.left < a.b.left ? c : a));
        const last = line.reduce((a, c) => (c.b.right > a.b.right ? c : a));
        if (Math.abs(first.b.left - rb.left) <= 2)
          out.push({ item: id(first.el), side: 'left', row: rowId });
        if (Math.abs(rb.right - last.b.right) <= 2)
          out.push({ item: id(last.el), side: 'right', row: rowId });
      }
    }
    return out;
  });
}

/** Whether focusing the control by keyboard changes the strip of pixels just outside one of its edges. */
async function ringReachesOutside(page: Page, target: Locator, side: Side) {
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const box = await target.boundingBox();
  if (!box) throw new Error('the control has no box');
  const across = side === 'left' || side === 'right';
  const clip = {
    x: across
      ? side === 'left'
        ? box.x - RING_PX
        : box.x + box.width + RING_PX - OUTER_BAND_PX
      : box.x + 4,
    y: across
      ? box.y + 4
      : side === 'top'
        ? box.y - RING_PX
        : box.y + box.height + RING_PX - OUTER_BAND_PX,
    width: across ? OUTER_BAND_PX : box.width - 8,
    height: across ? box.height - 8 : OUTER_BAND_PX,
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
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(cell.width);
    if (cell.armAdd) {
      const add = page.locator('[data-toolbar-item="add-activity"]').first();
      await add.click();
      await expect(add).toHaveText(/^Adding/);
    }
    await settle(page);
    // The ring reaches RING_PX, and a ring that ends exactly on the clip edge is shaved by a fractional
    // device scale, so the margin must clear it by a pixel (`deck-row-clip`, `globals.css`).
    const margins = await page
      .locator('[data-deck-row]')
      .evaluateAll((rows) => rows.map((r) => parseFloat(getComputedStyle(r).overflowClipMargin)));
    for (const margin of margins) {
      expect(margin, `a row's clip margin at ${cell.width}`).toBeGreaterThanOrEqual(RING_PX + 1);
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
    for (const side of ['top', 'bottom'] as const) {
      expect(
        edges.some((e) => e.side === side),
        `no ${side}-edge control at ${cell.width}`,
      ).toBe(true);
    }
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
    if (cell.armAdd) {
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-toolbar-item="add-activity"]').first()).not.toHaveText(
        /^Adding/,
      );
    }
  }
  return checked;
}

/** Two frames after a resize or a state change, so the strip is read from the settled layout. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
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

// The owner's Surface is 1.5 and 175 % scaling is 1.75: an edge lands between device pixels there, and
// a ring that ends exactly on the clip edge is shaved (toolbar-grid M1).
for (const deviceScaleFactor of [1.5, 1.75]) {
  test.describe(`forced colours: the deck focus ring at a row edge, at ${deviceScaleFactor}x`, () => {
    test.use({ forcedColors: 'active', deviceScaleFactor });

    test('a fine pointer: every edge control shows its whole ring', async ({ page }) => {
      test.setTimeout(300_000);
      await openPlan(page);
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(deviceScaleFactor);
      expect(await sweep(page, true)).toBeGreaterThan(6);
    });
  });
}

test.describe('forced colours: the deck focus ring at a row edge, under touch at 1.5x', () => {
  test.use({ forcedColors: 'active', hasTouch: true, deviceScaleFactor: 1.5 });

  test('a coarse pointer: every edge control shows its whole ring', async ({ page }) => {
    test.setTimeout(300_000);
    await openPlan(page);
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1.5);
    expect(await sweep(page, true)).toBeGreaterThan(6);
  });
});
