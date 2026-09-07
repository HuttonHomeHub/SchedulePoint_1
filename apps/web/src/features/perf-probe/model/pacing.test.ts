import { describe, expect, it } from 'vitest';

import { MIN_FRAMES_FOR_A_RUN, refuseRun } from './pacing';

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
