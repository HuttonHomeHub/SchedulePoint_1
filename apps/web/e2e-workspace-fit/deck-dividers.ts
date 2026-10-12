import { type Page } from '@playwright/test';

import { expect } from '../e2e-support/test';

/**
 * **No group paints a box, and no divider starts or ends a line** (toolbar-grid M1, SC-1 and SC-3).
 *
 * Read in the browser because jsdom computes no Tailwind and has no layout: a unit test can pin which
 * class a row carries, never that the class takes a divider off a wrapped line's start. That is the
 * defect the pill was chosen to prevent (SC-12, the leading-seam defect, measured at 1024) and the
 * reason the pill existed, so this is the assertion the pill's deletion is conditional on.
 *
 * **What counts as painted is decided from the computed style, not from geometry alone.** A divider
 * hangs half a gap to the left of its group, so a group that opens a line has its divider outside the
 * row's box. Whether that is invisible depends entirely on the row's computed `overflow-x`: `clip`
 * removes it, anything else paints it. Asking geometry alone ("is the divider left of the row?")
 * would pass against a row with no clip at all, which is the build this case exists to refuse.
 *
 * Three questions, per deck group:
 * 1. **No box.** The group, its sections and the rows have no fill, border, outline or shadow of
 *    their own, and the group's `::before` is a left border only.
 * 2. **A painted divider has a neighbour before it on its line.** Otherwise it opens a line, whether
 *    at the left edge (clipped away) or beside a lone group pushed to the right by `ml-auto`.
 * 3. **The first group on a row has no divider at all.**
 *
 * Returns the count of painted dividers so a caller can pin a positive: a deck with no second group
 * on any line draws none, and would satisfy every comparison here vacuously.
 */
interface DividerReading {
  boxes: string[];
  stray: string[];
  firstWithDivider: string[];
  painted: number;
  clipped: number;
  /** The least distance, in CSS px, by which a clipped divider lies beyond its row's clip edge. */
  minClipHeadroom: number;
  rowOverflow: string[];
}

/**
 * How far past the clip edge a divider's inner edge must lie to count as clipped away. Half a CSS px
 * is the most a fractional device scale snaps an edge by (at 1.5 a device pixel is 0.67 CSS px, and a
 * 1 px border is drawn as one of them), so a divider with less than this is not reliably gone — the
 * old geometry had exactly zero here, and an exact `<=` is the comparison that passes on a float.
 */
const CLIP_HEADROOM_PX = 0.5;

export async function readDividers(page: Page): Promise<DividerReading> {
  return page.evaluate((headroomFloor) => {
    const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
    if (!deck) throw new Error('the deck was not found — nothing to assert about');
    const out: DividerReading = {
      boxes: [],
      stray: [],
      firstWithDivider: [],
      painted: 0,
      clipped: 0,
      minClipHeadroom: Number.POSITIVE_INFINITY,
      rowOverflow: [],
    };
    const transparent = (c: string): boolean => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    const own = (el: Element, label: string): void => {
      const cs = getComputedStyle(el);
      const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
      const border = sides.some(
        (s) =>
          parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 &&
          cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none',
      );
      // The row seam below 1024 is a border on the second row by design; this case runs from the floor.
      if (!transparent(cs.backgroundColor)) out.boxes.push(`${label}: fill ${cs.backgroundColor}`);
      if (border) out.boxes.push(`${label}: border`);
      if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
        out.boxes.push(`${label}: outline`);
      if (cs.boxShadow !== 'none') out.boxes.push(`${label}: shadow ${cs.boxShadow}`);
      if (cs.backgroundImage !== 'none') out.boxes.push(`${label}: background image`);
    };

    for (const row of deck.querySelectorAll<HTMLElement>('[data-deck-row]')) {
      const rowId = row.getAttribute('data-deck-row') ?? '?';
      const rowBox = row.getBoundingClientRect();
      const rowCs = getComputedStyle(row);
      out.rowOverflow.push(`${rowId}:${rowCs.overflowX}/${rowCs.overflowY}`);
      own(row, `row ${rowId}`);

      const groups = [...row.querySelectorAll<HTMLElement>(':scope > [role="group"]')].filter(
        (g) => g.getBoundingClientRect().width > 0,
      );
      groups.forEach((group, index) => {
        const name = group.getAttribute('aria-label') ?? '?';
        own(group, `group ${name}`);
        for (const section of group.querySelectorAll(':scope > div > div')) {
          own(section, `a section of ${name}`);
        }

        const before = getComputedStyle(group, '::before');
        const lineOf = (el: HTMLElement, pseudo: '::before' | null): boolean => {
          const cs = pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el);
          return (
            cs.content !== 'none' &&
            cs.content !== 'normal' &&
            parseFloat(cs.borderLeftWidth) > 0 &&
            cs.borderLeftStyle !== 'none'
          );
        };
        const hasOwn = lineOf(group, '::before');
        // The group's `::before` is a line and never a box.
        if (!transparent(before.backgroundColor))
          out.boxes.push(`group ${name}::before: fill ${before.backgroundColor}`);
        for (const side of ['Top', 'Right', 'Bottom'] as const) {
          if (parseFloat(before.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0)
            out.boxes.push(`group ${name}::before: ${side} border`);
        }

        if (index === 0) {
          if (hasOwn) out.firstWithDivider.push(`${rowId}/${name}`);
          return;
        }

        // A trailing group's divider is drawn by the spacer before it; every other group draws its own.
        const trailing = group.classList.contains('ml-auto');
        const g = group.getBoundingClientRect();
        let bx: number;
        let lineTop: number;
        if (trailing) {
          if (hasOwn) out.stray.push(`${rowId}/${name}: a trailing group draws its own divider`);
          const spacer = group.previousElementSibling as HTMLElement | null;
          if (!spacer || !spacer.hasAttribute('data-deck-spacer') || !lineOf(spacer, '::before')) {
            out.stray.push(`${rowId}/${name}: a trailing group has no divider before it`);
            return;
          }
          const sp = spacer.getBoundingClientRect();
          bx = sp.right - parseFloat(getComputedStyle(spacer, '::before').right) - 1;
          lineTop = sp.top;
        } else {
          if (!hasOwn) {
            out.stray.push(`${rowId}/${name}: a later group has no divider`);
            return;
          }
          bx = g.left + parseFloat(before.left);
          lineTop = g.top;
        }

        // The clip edge sits `overflow-clip-margin` outside the row's box, so a focus ring can show there.
        const margin = parseFloat(rowCs.overflowClipMargin) || 0;
        // How far the divider's inner edge lies beyond the clip edge, on whichever side it hangs.
        const headroom =
          rowCs.overflowX === 'clip'
            ? Math.max(rowBox.left - margin - (bx + 1), bx - (rowBox.right + margin))
            : Number.NEGATIVE_INFINITY;
        if (headroom >= headroomFloor) {
          out.clipped += 1;
          out.minClipHeadroom = Math.min(out.minClipHeadroom, headroom);
          return;
        }
        // Painted. It needs a group before it AND the group it leads, both on its own line.
        const sameLine = (el: HTMLElement): boolean =>
          Math.abs(el.getBoundingClientRect().top - lineTop) < 4;
        const hasBefore = groups
          .slice(0, index)
          .some((other) => sameLine(other) && other.getBoundingClientRect().right <= bx + 0.5);
        const hasAfter = sameLine(group) && g.left >= bx - 0.5;
        if (hasBefore && hasAfter) out.painted += 1;
        else
          out.stray.push(
            `${rowId}/${name}: a painted divider has no group ${hasBefore ? 'after' : 'before'} it on its line, at x=${Math.round(bx)}`,
          );
      });
    }
    return out;
  }, CLIP_HEADROOM_PX);
}

/** Asserts the three questions above for the current page state; returns the painted count. */
export async function expectDividersOnlyBetweenGroups(
  page: Page,
  where: string,
): Promise<DividerReading> {
  const r = await readDividers(page);
  expect(r.boxes, `${where}: something on the deck paints a box`).toEqual([]);
  expect(r.firstWithDivider, `${where}: the first group on a row draws a divider`).toEqual([]);
  expect(r.stray, `${where}: a divider starts a line, or a later group has none`).toEqual([]);
  // Every row must clip both axes: `overflow-clip-margin` does nothing unless both do, and a row that
  // clips only x would pass the geometry above while cutting the focus ring (`deck-focus-ring.spec.ts`).
  expect(
    r.rowOverflow.filter((row) => !/:clip\/clip$/.test(row)),
    `${where}: a deck row does not clip both axes`,
  ).toEqual([]);
  return r;
}
