import { describe, expect, it } from 'vitest';

import { describeDuration, estimateStepSeconds, estimateSweepSeconds } from './sweep-duration';
import { sweepPlan } from './sweep-plan';

/**
 * The estimate, checked against the derivation it is supposed to agree with.
 *
 * **`docs/specs/probe-sweep/m0-measurements.md` derives ~119.5 s for a full sweep**, from the same
 * model this code uses: a phase is a fixed frame count, so wall-clock = frames ÷ fps. If the two
 * disagree, one of them is wrong and it matters which — that document's figure is the falsification
 * condition M0-T1 committed BEFORE any reading, and this number is what the operator is told before
 * they start something that covers their screen for two minutes.
 *
 * So the assertion is a band, not a point: the derivation's own largest term is flagged INFERRED
 * (revision overlay at Fit, ~39 % of the total, taken from a neighbouring reading rather than
 * measured), so demanding agreement to the second would be pretending to a precision neither has.
 */
describe('the sweep duration estimate', () => {
  it('agrees with M0-T1s derived ~119.5 s for a full sweep', () => {
    const seconds = estimateSweepSeconds(sweepPlan(), 'full');

    // Within 25 % of the committed derivation. Wide on purpose: M0-T2's readings replace the
    // inferred cell, and this test should survive that being a bit different rather than force the
    // estimate to match a number that was always approximate.
    expect(seconds).toBeGreaterThan(119.5 * 0.75);
    expect(seconds).toBeLessThan(119.5 * 1.25);
  });

  it('costs the whole-plan framing higher than the working zoom', () => {
    // The same machine measures 60.0 fps at Week and 32.2 at Fit (`docs/TECH_DEBT.md` #75 item 6).
    // One figure for both would put the sweep's estimate nearly a minute out. (This cited item 5's
    // 23.3, withdrawn by #261 on 2026-09-12 as contaminated by machine state; the assertion is
    // about the ORDER of the two, which every reading in the set agrees on.)
    const plan = sweepPlan();
    const week = plan.find((s) => s.preset === 'week');
    const fit = plan.find((s) => s.preset === 'fit');

    expect(week).toBeDefined();
    expect(fit).toBeDefined();
    expect(estimateStepSeconds(fit!, 'full')).toBeGreaterThan(estimateStepSeconds(week!, 'full'));
  });

  it('makes a quick check obviously shorter than a full one', () => {
    // The two exist so an operator can find out whether the probe works here before committing two
    // minutes to it. If the estimates did not separate, the choice would be meaningless.
    const quick = estimateSweepSeconds(sweepPlan(), 'quick');
    const full = estimateSweepSeconds(sweepPlan(), 'full');

    expect(quick).toBeLessThan(full / 3);
  });

  it('describes durations coarsely, never precisely', () => {
    // A precise-looking figure would claim more than this can know: the probe measures the frame
    // rate the estimate depends on. An operator needs "thirty seconds or two minutes", not seconds.
    expect(describeDuration(4)).toBe('a few seconds');
    expect(describeDuration(31)).toBe('about 30 seconds');
    expect(describeDuration(62)).toBe('about 60 seconds');
    expect(describeDuration(119.5)).toBe('about 2 minutes');
    expect(describeDuration(58 * 60 * 0 + 90)).toBe('about 1.5 minutes');
  });
});
