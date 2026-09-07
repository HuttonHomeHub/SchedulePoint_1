import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { judgeRun, MAX_DROPPED_DELTA_PP, type RunPair } from './judge';

/**
 * **F3 — the panel and the CLI agree, and the recorded 1920 cell comes back INDETERMINATE.**
 *
 * The numbers below are not invented. They are the 1920 cell of `m0-condition.md`'s second run of
 * the revision-compare overlay, taken in this container against **identical code** to a first run
 * that reported 0.93 pp — a better-than-tenfold move with nothing in the code path changed. That
 * document's own conclusion was that the environment is disqualified from answering the question,
 * and a human had to reach it by reading a note the CLI printed *after* a verdict.
 *
 * An invented fixture would only prove the judge agrees with whoever wrote it, which is why the
 * condition names a real recorded run. **If the expectation here is wrong, the judge is wrong and
 * not the fixture.**
 */
const RECORDED_1920 = {
  baselineMeanPp: 10.0,
  baselineSpreadPp: 6.67,
  treatmentMeanPp: 20.19,
  barPp: 2.0,
} as const;

/** Three pairs reproducing the recorded mean and spread exactly. */
const PAIRS: RunPair[] = [6.665, 10.0, 13.335].map((dropped) => ({
  baseline: { droppedPct: dropped, intervalP50: 8, intervalP95: 30, fps: 55 },
  treatment: {
    droppedPct: RECORDED_1920.treatmentMeanPp,
    intervalP50: 9,
    intervalP95: 40,
    fps: 48,
  },
}));

const COUNTS = {
  visibleChangedBars: 40,
  visibleBars: 222,
  visibleChangedLinks: 40,
  visibleLinks: 300,
};

describe('F3 — the recorded 1920 cell', () => {
  it('reproduces the recorded quantities, so the assertion below is about that run', () => {
    const r = judgeRun({ pairs: PAIRS, counts: COUNTS, barPp: 2.0, minFps: 30, gated: true });
    expect(r.baselineMeanPp).toBeCloseTo(RECORDED_1920.baselineMeanPp, 2);
    expect(r.baselineSpreadPp).toBeCloseTo(RECORDED_1920.baselineSpreadPp, 2);
    expect(r.treatmentMeanPp).toBeCloseTo(RECORDED_1920.treatmentMeanPp, 2);
  });

  it('is INDETERMINATE, and is NOT a FAIL', () => {
    // The whole point. A 10.19 pp delta against a 2.00 pp bar is a large, real-looking effect —
    // and the baseline's own spread (6.67 pp) is more than three times that bar, so the instrument
    // cannot separate the treatment from its own mood. A FAIL here would invite somebody to
    // withdraw a feature on the strength of a number this machine is not able to produce.
    const r = judgeRun({ pairs: PAIRS, counts: COUNTS, barPp: 2.0, minFps: 30, gated: true });
    expect(r.verdict).toBe('INDETERMINATE');
    expect(r.verdict).not.toBe('FAIL');
    expect(r.indeterminateReason).toMatch(/run-to-run spread/);
    expect(r.indeterminateReason).toMatch(/quieter machine, not a larger bar/);
  });

  it('uses the same bar the CLI and the registry use, rather than a number written here', () => {
    expect(RECORDED_1920.barPp).toBe(MAX_DROPPED_DELTA_PP);
  });

  it('and the CLI reaches this verdict through the SAME function, not a copy of it', () => {
    // F3's "both must report the same thing" is structural rather than a coincidence of two
    // implementations agreeing: the CLI driver calls `judgeRun` and contains no verdict arithmetic
    // of its own. Asserted by reading the driver, because a comment claiming it would be the
    // ADR-0076 Class 3 shape — a decision-bearing claim nobody executed.
    const cli = readFileSync(
      join(import.meta.dirname, '../../../../scripts/measure-revision-diff.mjs'),
      'utf8',
    );
    expect(cli).toMatch(/judgeRun/);
    // No second opinion about what makes a pass: the driver must not compute a verdict itself.
    expect(cli).not.toMatch(/verdict\s*=\s*['"`](PASS|FAIL|INDETERMINATE)/);
  });
});
