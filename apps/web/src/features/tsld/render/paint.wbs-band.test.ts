import { describe, expect, it, vi } from 'vitest';

import { paintWbsBand, type WbsBandPalette } from './paint';
import { mockCtx, recordingCtx } from './test-support/recording-ctx';
import type { WbsBandBar } from './wbs-band';

/**
 * **What `paintWbsBand` draws, recorded rather than counted** (`docs/TECH_DEBT.md` #71,
 * `docs/specs/wbs-bucket-bracket/`).
 *
 * The band had no paint-level test of any kind. That mattered because the defect this file exists
 * to pin is invisible to every other instrument here: a real summary and the derived Unassigned
 * bucket were the SAME rounded rectangle differing only in fill, so at the zoom where
 * `truncateToWidth` drops the label there was nothing but colour telling a thing in the plan from
 * an observation about it — WCAG 1.4.1. A contrast matrix cannot see that (both pairings passed);
 * a counting stub cannot see it (the call counts were identical); and jsdom has no pixels.
 *
 * `recordingCtx` logs property assignments as well as calls, which is what makes it an oracle for
 * this: the painter says "filled" or "stroked" entirely through `fillStyle`/`strokeStyle` and
 * `fill()`/`stroke()`, and a proxy that only trapped calls would report the old picture and the new
 * one as the same.
 *
 * **Written before the painter changed and verified red**, per the repository's rule that a gate is
 * finished when the defect it names has made it fail. Against the pre-fix painter the two negative
 * assertions below both failed, naming `fillStyle=#7a8090` and `fill([])` in the log.
 */

const PALETTE: WbsBandPalette = {
  bar: '#3b6fbf',
  derived: '#7a8090',
  rule: '#d9d9d9',
  label: '#ffffff',
  derivedLabel: '#1a1a1a',
  selection: '#1a1a1a',
};

const BAND = { width: 400, height: 24 };

/** A bar wide enough that its label survives — so the label assertions have something to read. */
function bar(overrides: Partial<WbsBandBar> = {}): WbsBandBar {
  return { id: 'a1', label: 'Substructure', depth: 0, x: 10, w: 120, y: 4, h: 16, ...overrides };
}

const DERIVED = bar({ id: null, label: 'Unassigned' });

/**
 * `mockCtx` is deliberately minimal and offers no `roundRect`, so the shared painter would take its
 * documented fallback branch. Adding it here rather than to the shared mock: every other suite's
 * recorded log would shift, and this is the only file that cares which branch ran.
 */
function paint(bars: readonly WbsBandBar[], selectedId: string | null = null): string[] {
  const { ctx, log } = recordingCtx({ ...mockCtx(), roundRect: vi.fn() });
  paintWbsBand(ctx, bars, selectedId, BAND, PALETTE);
  return log;
}

/** The same, on a context with no `roundRect` — the branch older engines take. */
function paintWithoutRoundRect(bars: readonly WbsBandBar[]): string[] {
  const { ctx, log } = recordingCtx();
  paintWbsBand(ctx, bars, null, BAND, PALETTE);
  return log;
}

describe('paintWbsBand — the derived bucket is a bracket, not a bar', () => {
  /**
   * The two negative assertions. **These are the ones that were red**, and they are stated as
   * absences because that is the actual change: the bucket stops being a filled shape.
   *
   * `palette.rule` legitimately fills — the band's foot hairline is a `fillRect` — so the fill
   * assertions are scoped to the bucket's own colour rather than to `fill` in general.
   */
  it('never fills with the derived colour', () => {
    const log = paint([DERIVED]);
    expect(log, `the bucket is still being filled: ${log.join(' ')}`).not.toContain(
      `fillStyle=${PALETTE.derived}`,
    );
  });

  it('strokes the derived colour instead, solid and 1px', () => {
    const log = paint([DERIVED]);
    expect(log).toContain(`strokeStyle=${PALETTE.derived}`);
    expect(log).toContain('lineWidth=1');
    /**
     * **Explicit, and not defensive tidiness.** The image export runs `paintScene` and then this
     * painter through ONE shared context (`render-export-image.ts`), so a dash left set by an
     * earlier layer would be inherited here. Every dash site in `paintScene` happens to reset
     * today — which is a property nothing asserts, across a function boundary, on the one path
     * where nobody is watching a screen. Setting it here makes the bracket's solidity a fact of
     * this painter rather than a consequence of another one's manners.
     */
    expect(log).toContain('setLineDash([[]])');
  });

  /**
   * The bracket's shape, asserted as the four path calls in order.
   *
   * The property each literal encodes, stated so a careless re-baseline cannot quietly lose it:
   * **the first and last points are both at `y + h` and nothing runs between them at that y — the
   * foot is open.** That is the whole distinction from a rectangle. Half-pixel offsets put a 1px
   * stroke on a pixel rather than across two.
   */
  it('draws three sides with the foot left open', () => {
    const log = paint([DERIVED]);
    const path = log.filter((entry) => entry.startsWith('moveTo') || entry.startsWith('lineTo'));
    expect(path).toEqual([
      'moveTo([10.5,20])',
      'lineTo([10.5,4.5])',
      'lineTo([129.5,4.5])',
      'lineTo([129.5,20])',
    ]);
    // A closed path would add a fourth `lineTo` back to the start, or a `closePath`. Neither.
    expect(log).not.toContain('closePath([])');
  });

  it('still paints the bucket’s name, in the derived ink', () => {
    const log = paint([DERIVED]);
    const inkAt = log.indexOf(`fillStyle=${PALETTE.derivedLabel}`);
    const textAt = log.findIndex((entry) => entry.startsWith('fillText'));
    expect(inkAt, 'the derived ink is never set').toBeGreaterThanOrEqual(0);
    expect(textAt, 'the name is never drawn').toBeGreaterThan(inkAt);
    expect(log[textAt]).toContain('Unassigned');
  });

  /**
   * **The pinned positive, and it is what stops this file passing vacuously.** Every assertion
   * above is about the bucket; if `paintWbsBand` regressed to drawing nothing at all, or to
   * treating every bar as derived, they would all still pass. A real summary is written out
   * literally rather than snapshotted, so a careless `-u` cannot re-baseline it.
   */
  it('leaves a real summary exactly as it was — filled, rounded, its own ink', () => {
    expect(paint([bar()])).toEqual([
      'setTransform([1,0,0,1,0,0])',
      'clearRect([0,0,400,24])',
      `fillStyle=${PALETTE.rule}`,
      'fillRect([0,23,400,1])',
      "font=11px 'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      'textBaseline=middle',
      'textAlign=left',
      `fillStyle=${PALETTE.bar}`,
      'beginPath([])',
      'roundRect([10,4,120,16,3])',
      'fill([])',
      'measureText(["Substructure"])',
      `fillStyle=${PALETTE.label}`,
      'fillText(["Substructure",13,12])',
    ]);
  });

  /**
   * The rounded-rect fallback, pinned because the bucket's new path must not accidentally depend on
   * `roundRect` being present. A summary degrades to a square `fillRect`; the bracket is drawn from
   * primitives and is therefore identical either way — which is a property, not a coincidence.
   */
  it('draws the same bracket on a context with no roundRect', () => {
    const withRound = paint([DERIVED]).filter(
      (e) => e.startsWith('moveTo') || e.startsWith('lineTo') || e.startsWith('stroke'),
    );
    const without = paintWithoutRoundRect([DERIVED]).filter(
      (e) => e.startsWith('moveTo') || e.startsWith('lineTo') || e.startsWith('stroke'),
    );
    expect(without).toEqual(withRound);
    expect(paintWithoutRoundRect([bar()])).toContain('fillRect([10,4,120,16])');
  });

  /**
   * The selection ring is a real summary's alone — the bucket cannot be selected, because it has
   * no row in the database to select (ADR-0063 §7). Asserted here because the ring is drawn from
   * the same loop and a refactor could easily hand it to the wrong branch.
   */
  it('never rings the bucket, even when something is selected', () => {
    const log = paint([DERIVED], null);
    expect(log).not.toContain(`strokeStyle=${PALETTE.selection}`);
  });
});
