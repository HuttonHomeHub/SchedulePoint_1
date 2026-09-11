import { describe, expect, it } from 'vitest';

import { changedSet, countVisible, runRevisionDiff } from './revision-diff';

import type { RenderActivity, RenderEdge } from '@/features/tsld/render/geometry';

/**
 * `revision-diff`'s two pure helpers (`docs/TECH_DEBT.md` #259 item 7).
 *
 * The sibling module `canvas-draw` has had `canvas-draw.test.ts` since it shipped; this one had
 * nothing, and neither helper needs a canvas — so the gap was inconsistency rather than necessity.
 *
 * Both are load-bearing for whether a *reading* means anything. `changedSet` decides what the
 * overlay draws, and the probe's non-vacuity floors are checked against `countVisible`'s output:
 * if either is wrong the probe reports a confident number about a picture that was never painted,
 * which is the failure ADR-0066 recorded (a 4.6 ms p95 that turned out to be about the cull).
 */

const activity = (i: number, over: Partial<RenderActivity> = {}): RenderActivity => ({
  id: `a${String(i)}`,
  type: 'TASK',
  laneIndex: i,
  label: `A${String(i)}`,
  earlyStart: '2026-01-10',
  earlyFinish: '2026-01-15',
  isCritical: false,
  isNearCritical: false,
  ...over,
});

const edge = (i: number): RenderEdge =>
  ({
    id: `e${String(i)}`,
    predecessorId: `a${String(i)}`,
    successorId: `a${String(i + 1)}`,
    type: 'FS',
  }) as RenderEdge;

describe('changedSet', () => {
  it('takes a deterministic stride, so two runs measure the same picture', () => {
    // Deterministic BY INDEX rather than random is the whole design: the probe is a paired
    // baseline-against-treatment measurement, and a treatment whose subject moves between pairs
    // measures nothing. Asserted as identity across two calls, not as a particular stride —
    // pinning the constant here would make this a copy of the source rather than a test of it.
    const activities = Array.from({ length: 50 }, (_, i) => activity(i));
    const edges = Array.from({ length: 50 }, (_, i) => edge(i));
    const first = changedSet(activities, edges);
    const second = changedSet(activities, edges);
    expect(first.ghosts.map((g) => g.id)).toEqual(second.ghosts.map((g) => g.id));
    expect(first.changedEdges.map((e) => e.id)).toEqual(second.changedEdges.map((e) => e.id));
  });

  it('changes a minority, which is what makes the overlay a difference and not a second plan', () => {
    // ADR-0127 CQ-2 rejected drawing the whole old plan behind the new one: a ghost behind every
    // unchanged bar is a picture of the plan rather than of what happened to it. A stride that
    // selected most activities would quietly reinstate exactly that.
    const activities = Array.from({ length: 100 }, (_, i) => activity(i));
    const { ghosts } = changedSet(activities, []);
    expect(ghosts.length).toBeGreaterThan(0);
    expect(ghosts.length).toBeLessThan(activities.length / 2);
  });

  it('SKIPS an activity with no dates rather than inventing them', () => {
    // `earlyStart`/`earlyFinish` are null until the plan is recalculated. An activity with no dates
    // draws no bar, so it can have no ghost — coercing would invent a date and draw a rectangle the
    // product never would, and the probe would then count it as visible work.
    const activities = Array.from({ length: 20 }, (_, i) =>
      activity(i, { earlyStart: null, earlyFinish: null }),
    );
    expect(changedSet(activities, []).ghosts).toHaveLength(0);
  });

  it('shifts the ghost EARLIER, which is what a slipped activity looks like', () => {
    const [ghost] = changedSet([activity(0)], []).ghosts;
    expect(ghost).toBeDefined();
    expect(ghost!.baselineStart < '2026-01-10').toBe(true);
    expect(ghost!.baselineFinish < '2026-01-15').toBe(true);
    // The span is preserved: a ghost is the same work at an earlier date, not a different duration.
    const days = (a: string, b: string) =>
      (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
    expect(days(ghost!.baselineStart, ghost!.baselineFinish)).toBe(
      days('2026-01-10', '2026-01-15'),
    );
  });

  it('carries the lane and the milestone flag, because the overlay draws by shape', () => {
    // ADR-0127 D2: a ghost sits in the lane the old revision RECORDED, never a guessed one, and a
    // milestone is a diamond rather than a bar. Both come from here or the painter has to guess.
    const [ghost] = changedSet([activity(7, { type: 'START_MILESTONE' })], []).ghosts;
    expect(ghost?.laneIndex).toBe(7);
    expect(ghost?.isMilestone).toBe(true);
  });

  it('is empty for an empty scene rather than throwing', () => {
    expect(changedSet([], [])).toEqual({ ghosts: [], changedEdges: [] });
  });
});

describe('countVisible', () => {
  const SIZE = { width: 1000, height: 600 };
  // A viewport framing 2026-01-01 at x=0 with 10 px per day, so day 0..100 is on screen.
  const view: Parameters<typeof countVisible>[4] = { originX: 0, originY: 0, pxPerDay: 10 };

  it('counts only what is inside the viewport — the point of the whole function', () => {
    // "Count what is actually on screen, so a PASS cannot mean the treatment drew nothing."
    const onScreen = activity(0, { earlyStart: '2026-01-10', earlyFinish: '2026-01-15' });
    const offScreen = activity(1, { earlyStart: '2027-06-01', earlyFinish: '2027-06-10' });
    const { ghosts } = changedSet([onScreen], []);
    const { ghosts: far } = changedSet([offScreen], []);

    expect(countVisible(ghosts, [], [], [onScreen], view, SIZE).visibleChangedBars).toBe(1);
    expect(countVisible(far, [], [], [offScreen], view, SIZE).visibleChangedBars).toBe(0);
  });

  it('counts a link when EITHER endpoint is on screen, not only when both are', () => {
    // A link with one end off screen is still drawn and still costs the painter; requiring both
    // would under-count exactly the dense hub cases the overlay is hardest on.
    const near = activity(0, { earlyStart: '2026-01-05', earlyFinish: '2026-01-08' });
    const far = activity(1, { earlyStart: '2027-06-01', earlyFinish: '2027-06-10' });
    const link = { id: 'e0', predecessorId: 'a0', successorId: 'a1', type: 'FS' } as RenderEdge;
    const counts = countVisible([], [link], [link], [near, far], view, SIZE);
    expect(counts.visibleChangedLinks).toBe(1);
  });

  it('does not count a link whose endpoints have no dates', () => {
    // An undated activity draws no bar, so an edge into it has no geometry to be on screen.
    const a = activity(0, { earlyStart: null, earlyFinish: null });
    const b = activity(1, { earlyStart: null, earlyFinish: null });
    const link = { id: 'e0', predecessorId: 'a0', successorId: 'a1', type: 'FS' } as RenderEdge;
    expect(countVisible([], [link], [link], [a, b], view, SIZE).visibleChangedLinks).toBe(0);
  });

  it('does not count a link whose endpoints are not in the scene at all', () => {
    // A dangling edge is not a drawable one. Without this the count could exceed what is painted,
    // and a non-vacuity floor would pass on links that do not exist.
    const link = {
      id: 'e0',
      predecessorId: 'ghost',
      successorId: 'other',
      type: 'FS',
    } as RenderEdge;
    expect(countVisible([], [link], [link], [], view, SIZE).visibleChangedLinks).toBe(0);
  });

  it('reports denominators alongside the changed counts', () => {
    // The floors were first written against the changed counts alone and that was the wrong shape:
    // "3 changed bars visible" means something different on a screen showing 10 bars and one
    // showing 2,000. Both numbers travel together or neither is interpretable.
    const activities = Array.from({ length: 30 }, (_, i) =>
      activity(i, { earlyStart: '2026-01-10', earlyFinish: '2026-01-15' }),
    );
    const { ghosts } = changedSet(activities, []);
    const counts = countVisible(ghosts, [], [], activities, view, SIZE);
    expect(counts.visibleBars).toBeGreaterThanOrEqual(counts.visibleChangedBars);
    expect(counts.visibleChangedBars).toBeGreaterThan(0);
  });
});

describe('progress narration', () => {
  /**
   * `docs/TECH_DEBT.md` #259 item 11 — this scene narrated ONCE for a whole multi-pair run while
   * its sibling `canvas-draw` narrates per repeat, so a screen-reader user heard one sentence and
   * then up to twenty-five seconds of silence, which is indistinguishable from a run that died.
   *
   * Driven against a **stub 2D context**, because jsdom has no canvas and this assertion is about
   * the callback's cadence rather than anything painted. Every method is a no-op recorder; if the
   * painter ever needs a real return value from one of these the stub will fail loudly rather than
   * silently measure nothing.
   */
  const stubCtx = (): CanvasRenderingContext2D => {
    const noop = (): void => {};
    const handler: ProxyHandler<object> = {
      get: (_t, prop) => {
        if (prop === 'canvas') return { width: 100, height: 100 };
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createPattern' || prop === 'createLinearGradient') return () => null;
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        return noop;
      },
      set: () => true,
    };
    return new Proxy({}, handler) as CanvasRenderingContext2D;
  };

  it('calls back once per pair, not once per run', async () => {
    const seen: { index: number; count: number }[] = [];
    await runRevisionDiff(
      stubCtx(),
      { width: 400, height: 300 },
      {} as Parameters<typeof runRevisionDiff>[2],
      {
        scene: 'fixture',
        preset: 'week',
        // One frame per phase keeps the test quick; the cadence being asserted is per PAIR.
        frames: 1,
        pairs: 3,
        idleInterval: 16.7,
        onPairStart: (index, count) => seen.push({ index, count }),
      },
    );

    expect(seen).toEqual([
      { index: 0, count: 3 },
      { index: 1, count: 3 },
      { index: 2, count: 3 },
    ]);
  });
});
