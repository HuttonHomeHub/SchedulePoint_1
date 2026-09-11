import { describe, expect, it } from 'vitest';

import { MIN_FRAMES_FOR_A_RUN, percentile, refuseRun, summariseFrameStamps } from './pacing';

/**
 * The refusals — which are the product, not the plumbing.
 *
 * A browser benchmark is trivially invalidated, and the failure mode that matters is not "it broke".
 * It is that an invalid run produces a **plausible-looking number**: a hidden tab throttles rAF to
 * roughly 1 Hz and reports a beautifully consistent interval, which reads as a stable measurement
 * rather than as no measurement at all. Every case below is one of those.
 */
const ok = {
  documentHidden: false,
  idleInterval: 16.7,
  frameCount: 180,
  hasContext: true,
};

describe('refuseRun', () => {
  it('lets a healthy run through', () => {
    expect(refuseRun(ok)).toBeNull();
  });

  it('refuses a hidden tab, and says what to do about it', () => {
    const r = refuseRun({ ...ok, documentHidden: true });
    expect(r?.reason).toBe('TAB_HIDDEN');
    // The sentence has to be actionable, because this is the refusal an operator will actually hit.
    expect(r?.sentence).toMatch(/keep this tab in front/);
  });

  it('refuses the throttled clock a hidden tab produces, even if visibility was missed', () => {
    // Belt and braces, and not redundant: `document.hidden` is false for an OCCLUDED window on some
    // platforms, and the throttle still applies. ~1000 ms is what that looks like.
    expect(refuseRun({ ...ok, idleInterval: 1000 })?.reason).toBe('IMPLAUSIBLE_DISPLAY_CLOCK');
  });

  it('refuses an impossibly fast clock too', () => {
    // 0.5 ms is 2000 Hz. No display does that; something has replaced the timer.
    expect(refuseRun({ ...ok, idleInterval: 0.5 })?.reason).toBe('IMPLAUSIBLE_DISPLAY_CLOCK');
  });

  it('accepts the real refresh rates a planner might have', () => {
    // 60 Hz, 120 Hz (the Surface Pro's own), 144 Hz and 30 Hz all pass. A bound tight enough to
    // reject a real machine would make the probe useless on exactly the hardware it exists for.
    for (const interval of [16.7, 8.3, 6.9, 33.3]) {
      expect(refuseRun({ ...ok, idleInterval: interval })).toBeNull();
    }
  });

  it('refuses a run too short to take a percentile from', () => {
    expect(refuseRun({ ...ok, frameCount: MIN_FRAMES_FOR_A_RUN - 1 })?.reason).toBe(
      'TOO_FEW_FRAMES',
    );
    expect(refuseRun({ ...ok, frameCount: MIN_FRAMES_FOR_A_RUN })).toBeNull();
  });

  it('refuses a missing 2D context, and blames neither the plan nor the painter', () => {
    const r = refuseRun({ ...ok, hasContext: false });
    expect(r?.reason).toBe('NO_CANVAS_CONTEXT');
    expect(r?.sentence).toMatch(/Nothing is wrong with the plan or the painter/);
  });

  it('checks the context FIRST, because without one nothing else was measured', () => {
    // Order matters for the sentence a reader gets. With no context there are no frames either, and
    // "only 0 frames were recorded" would send them looking for a run that never started.
    const r = refuseRun({
      documentHidden: true,
      idleInterval: 999,
      frameCount: 0,
      hasContext: false,
    });
    expect(r?.reason).toBe('NO_CANVAS_CONTEXT');
  });

  it('reports the hidden tab ahead of the clock it caused', () => {
    // Both are true when a tab is backgrounded. The visibility sentence names the cause and the
    // remedy; the clock sentence describes a symptom, which is the less useful of the two.
    const r = refuseRun({ ...ok, documentHidden: true, idleInterval: 1000 });
    expect(r?.reason).toBe('TAB_HIDDEN');
  });
});

/**
 * **The arithmetic that had four copies and two answers** (`docs/TECH_DEBT.md` #258).
 *
 * Neither scene pinned it, which is why the divergence survived: each copy looked reasonable alone
 * and nothing compared them. These cases exist so that the next edit to the index rule or the
 * dropped-frame threshold is a decision somebody has to make on purpose.
 */
describe('percentile — the ONE index rule', () => {
  const sorted = Array.from({ length: 600 }, (_, i) => i);

  it('indexes at floor(n · p) — the definition three of the four copies used', () => {
    expect(percentile(sorted, 0.95)).toBe(570);
    expect(percentile(sorted, 0.5)).toBe(300);
  });

  /**
   * The documented, deliberate property. Against the standard nearest-rank definition
   * (`ceil(p · n) − 1`) this sits ONE RANK HIGH, so it is never optimistic about a frame interval.
   * Asserted rather than merely written down: "correcting" it re-bases every reading in
   * `perf_probe_results`, and that must fail here rather than pass quietly.
   */
  it('is exactly one rank above nearest-rank, and that is the choice', () => {
    const nearestRank = (xs: readonly number[], p: number) =>
      xs[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)];
    expect(percentile(sorted, 0.95)).toBe((nearestRank(sorted, 0.95) ?? 0) + 1);
  });

  it('clamps at the top rather than reading past the end, and answers 0 for no samples', () => {
    expect(percentile([5], 0.95)).toBe(5);
    expect(percentile([], 0.95)).toBe(0);
  });

  /**
   * The divergence itself, as a fixture. The old `revision-diff` copy used `floor((n − 1) · p)`,
   * and on a tailed distribution the two answers are 12 % apart — which is what makes this a
   * defect rather than a rounding curiosity.
   */
  it('differs materially from the index the fourth copy used', () => {
    const tailed = Array.from({ length: 600 }, (_, i) => (i < 570 ? 16.7 : 16.7 + (i - 569) * 2));
    const otherCopy = tailed[Math.min(tailed.length - 1, Math.floor((tailed.length - 1) * 0.95))];
    expect(percentile(tailed, 0.95)).toBe(18.7);
    expect(otherCopy).toBe(16.7);
  });
});

describe('summariseFrameStamps — the ONE summary', () => {
  /** Twelve timestamps 16.7 ms apart: eleven gaps, none of them a miss. */
  const even = Array.from({ length: 12 }, (_, i) => i * 16.7);

  it('derives gaps from the stamps — one fewer than the timestamps given', () => {
    expect(summariseFrameStamps(even, 16.7).frames).toBe(11);
  });

  it('calls a frame dropped only past 1.5x the display interval, never at a fixed 16.7 ms', () => {
    // 24 ms is 1.44x — slow, and NOT a missed vsync. 26 ms is 1.56x, which is.
    const nearMiss = [0, 24];
    const miss = [0, 26];
    expect(summariseFrameStamps(nearMiss, 16.7).droppedPct).toBe(0);
    expect(summariseFrameStamps(miss, 16.7).droppedPct).toBe(100);
    // And the threshold is the DISPLAY's, so the same 26 ms gap is fine on a 30 Hz panel.
    expect(summariseFrameStamps(miss, 33.3).droppedPct).toBe(0);
  });

  it('reports fps from the mean gap, not from the median', () => {
    expect(summariseFrameStamps(even, 16.7).fps).toBeCloseTo(1000 / 16.7, 6);
  });

  it('answers a no-gap run without dividing by zero', () => {
    const one = summariseFrameStamps([0], 16.7);
    expect(one.frames).toBe(0);
    expect(one.droppedPct).toBe(0);
    expect(one.intervalP95).toBe(0);
  });
});
