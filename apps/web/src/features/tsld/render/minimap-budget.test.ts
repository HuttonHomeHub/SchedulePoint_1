import { describe, expect, it } from 'vitest';

import type { RenderActivity } from './geometry';
import { buildMinimapBitmap, type MinimapPalette } from './minimap';

/**
 * **The minimap draw-budget gate** (M1-T3) — the counting-stub method of
 * `paint.wbs-band-budget.test.ts` / the ADR-0054 dates gate: the assertion is about the
 * **shape** of the cost, not a millisecond count, because a CI runner's absolute timings
 * are noise.
 *
 * The shape: one build is O(activities) fills with **zero text work** (no
 * `fillText`/`measureText` — nothing is legible at this scale, so measuring would be pure
 * waste), **zero per-bar strokes** (`strokeRect`), and `fillStyle` batched into exactly
 * **two bar passes** (non-critical, then critical) plus the ground and the data-date line —
 * never a per-bar style write, which is the classic way a canvas loop goes quadratic-ish
 * in state churn.
 *
 * **What this gate structurally cannot catch:** a per-FRAME rebuild regression. This test
 * calls the build once and counts; nothing here fails if the host wires the build into the
 * frame loop. That is M2's spy test (`a scene-change spy records zero builds on selection
 * change / rectangle movement`), and this docblock says so, so a green run here is not read
 * as covering it.
 */
const PALETTE: MinimapPalette = {
  ground: '#0f1218',
  outline: '#f2f4f8', // distinct from dataDate so the fringe assertions can tell them apart
  bar: '#3b6fbf',
  critical: '#e05d44',
  nearCritical: '#d29628',
  gridMinor: '#72777e',
  gridYear: '#4a4f57',
  dataDate: '#e6e8ee',
};
const BOX = { width: 200, height: 120 };
const DATA_DATE = '2026-01-01';

/**
 * What the M3 temporal tiers add to every count below — **re-derived, never relaxed**.
 *
 * Every fixture here spans 2026-01-01 … 2026-03-01 (60 days). At `BOX.width` 200 that is
 * 3.33 px/day, so the month pitch is ~101 px and the year pitch ~1,217 px: the ladder admits
 * **month as the minor tier and year**, the most either can be, so these fixtures exercise the
 * tiers' worst case rather than skipping them.
 *
 * `calendarBoundaries(0, 60, '2026-01-01')` returns month boundaries at offsets **0, 31, 59**
 * (1 Jan, 1 Feb, 1 Mar) and a year boundary at **0** — four rules, all inside the box:
 * `screenXOfDay` puts them at 0, 103 and 197.
 *
 * So: **+4 `fillRect`** (one per rule) and **+2 `fillStyle`** (one per drawn tier, batched —
 * never per rule). Both are hand-checkable from the two sentences above, which is the point:
 * a budget gate whose numbers cannot be re-derived by a reader is a number nobody will
 * question when it next moves.
 *
 * A span admitting NO tier writes neither, and the last case in this file pins that.
 */
const TIER_FILLS = 4;
const TIER_STYLES = 2;

function countingCtx() {
  const calls = { fillRect: 0, fillText: 0, measureText: 0, strokeRect: 0, styleWrites: 0 };
  let fillStyle = '';
  const ctx = {
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => {
      calls.fillRect += 1;
    },
    strokeRect: () => {
      calls.strokeRect += 1;
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    setLineDash: () => {},
    fillText: () => {
      calls.fillText += 1;
    },
    measureText: () => {
      calls.measureText += 1;
      return { width: 0 } as TextMetrics;
    },
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'middle' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string | CanvasGradient | CanvasPattern) {
      calls.styleWrites += 1;
      fillStyle = typeof v === 'string' ? v : '[object]';
    },
  };
  return { calls, ctx };
}

function plan(count: number): RenderActivity[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    type: 'TASK' as const,
    laneIndex: i % 200,
    label: `a${i}`,
    earlyStart: i === 0 ? '2026-01-01' : '2026-01-05',
    earlyFinish: '2026-03-01',
    isCritical: i % 3 === 0,
    isNearCritical: false,
  }));
}

describe('minimap draw budget', () => {
  it('2,000 activities: O(n) fills, zero text work, zero per-bar strokes', () => {
    const { calls, ctx } = countingCtx();
    buildMinimapBitmap(ctx, plan(2000), DATA_DATE, BOX, PALETTE);
    // ground + one fill per placed bar + the data-date line (first bar anchors day 0 in span)
    expect(calls.fillRect).toBe(1 + TIER_FILLS + 2000 + 1);
    expect(calls.fillText).toBe(0);
    expect(calls.measureText).toBe(0);
    expect(calls.strokeRect).toBe(0);
  });

  it('fillStyle is batched: one write per pass, regardless of n', () => {
    const { calls, ctx } = countingCtx();
    buildMinimapBitmap(ctx, plan(2000), DATA_DATE, BOX, PALETTE);
    // ground + minor tier + year tier + ordinary bars + critical bars + data-date.
    expect(calls.styleWrites).toBe(4 + TIER_STYLES);
  });

  it('a fringed plan stays fillRect-only and batched: no strokes, no text', () => {
    // 8 lanes → 15px rows → every critical bar carries its 1.4.1 fringe. The shape holds:
    // ground + bar-pass + fringe-pass + critical-pass + data-date = **5** batched styles, plus
    // the M3 tiers, still O(n) fills, still zero strokeRect/fillText.
    //
    // **This comment used to say "6 writes total" beside an assertion of 5, and the name said 6
    // too.** The assertion was right; the prose invented a sixth write for "the critical INSET
    // fill after the fringe", which is a `fillRect` inside a pass whose `fillStyle` was already
    // set. Corrected at M3-T3: the prose moves, never the number.
    const { calls, ctx } = countingCtx();
    const acts = Array.from({ length: 100 }, (_, i) => ({
      id: `a${i}`,
      type: 'TASK' as const,
      laneIndex: i % 8,
      label: `a${i}`,
      earlyStart: i === 0 ? '2026-01-01' : '2026-01-05',
      earlyFinish: '2026-03-01',
      isCritical: i % 3 === 0,
      isNearCritical: false,
    }));
    buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);
    const critical = acts.filter((a) => a.isCritical).length;
    // ground + non-critical + fringe-per-critical + inset-per-critical + data-date
    expect(calls.fillRect).toBe(1 + TIER_FILLS + (100 - critical) + critical * 2 + 1);
    expect(calls.styleWrites).toBe(5 + TIER_STYLES);
    expect(calls.strokeRect).toBe(0);
    expect(calls.fillText).toBe(0);
  });

  /**
   * M2. The near-critical pass is GUARDED, and these two cases are the guard's two sides.
   *
   * The point of the guard is that a plan with no near-critical activity pays exactly what it
   * paid before — so the four assertions above, which all use `plan()` (every activity
   * `isNearCritical: false`), still expect **4** style writes and are untouched. If the pass were
   * unconditional they would have had to move to 5 for a pass drawing zero rects, which is a gate
   * loosened to fit a feature rather than a cost the feature has.
   */
  it('a plan with no near-critical activity pays nothing for the pass', () => {
    const { calls, ctx } = countingCtx();
    buildMinimapBitmap(ctx, plan(500), DATA_DATE, BOX, PALETTE);
    expect(calls.styleWrites, 'ground + two tiers + two bar passes + data-date').toBe(
      4 + TIER_STYLES,
    );
    expect(calls.fillRect).toBe(1 + TIER_FILLS + 500 + 1);
  });

  it('a plan WITH near-critical activities adds exactly one batched pass', () => {
    const acts = plan(500).map((a, i) =>
      i % 5 === 1 && !a.isCritical ? { ...a, isNearCritical: true } : a,
    );
    const near = acts.filter((a) => a.isNearCritical && !a.isCritical).length;
    expect(near, 'the fixture must actually contain near-critical bars').toBeGreaterThan(0);
    const { calls, ctx } = countingCtx();
    buildMinimapBitmap(ctx, acts, DATA_DATE, BOX, PALETTE);
    // ground + ordinary + NEAR-CRITICAL + critical + data-date. Still one write per pass, and
    // still O(n) fills — one per placed bar, whichever pass drew it.
    expect(calls.styleWrites).toBe(5 + TIER_STYLES);
    expect(calls.fillRect).toBe(1 + TIER_FILLS + 500 + 1);
    expect(calls.fillText).toBe(0);
    expect(calls.strokeRect).toBe(0);
  });

  it('the empty plan costs one ground fill and nothing else', () => {
    const { calls, ctx } = countingCtx();
    buildMinimapBitmap(ctx, [], DATA_DATE, BOX, PALETTE);
    expect(calls.fillRect).toBe(1);
    expect(calls.styleWrites).toBe(1);
  });
});
