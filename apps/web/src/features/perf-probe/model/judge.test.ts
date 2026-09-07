import { describe, expect, it } from 'vitest';

import {
  judgeRun,
  NothingToJudgeError,
  type JudgeInput,
  type PhaseTiming,
  type RunPair,
} from './judge';

/**
 * The judge, and in particular the verdict this epic exists to add.
 *
 * **F3's fixtures are REAL RECORDED RUNS, not invented ones**, and that is the point of them: an
 * invented fixture proves only that the judge agrees with whoever wrote the fixture. Every number
 * below is transcribed from `docs/specs/revision-compare-changes/m0-condition.md`'s own result
 * tables, and the cell each came from is named.
 */

const timing = (droppedPct: number, fps = 59): PhaseTiming => ({
  droppedPct,
  intervalP50: 16.7,
  intervalP95: 17.2,
  fps,
});

/** Enough on screen to judge — the non-vacuity floor is exercised separately below. */
const AMPLE: JudgeInput['counts'] = {
  visibleChangedBars: 34,
  visibleBars: 220,
  visibleChangedLinks: 43,
  visibleLinks: 303,
};

/**
 * Build pairs whose baseline mean and spread are the recorded ones.
 *
 * Two pairs are enough to set both: the mean is their average, the spread their difference. The
 * real runs took three, and the judge reads only mean/min/max — so this reproduces the quantities
 * the verdict is computed from without pretending to reproduce the run.
 */
const pairsFor = (baseMean: number, baseSpread: number, treatMean: number, fps = 59): RunPair[] => [
  { baseline: timing(baseMean - baseSpread / 2), treatment: timing(treatMean, fps) },
  { baseline: timing(baseMean + baseSpread / 2), treatment: timing(treatMean, fps) },
];

const input = (over: Partial<JudgeInput> = {}): JudgeInput => ({
  pairs: pairsFor(0.56, 1.11, 1.3),
  counts: AMPLE,
  barPp: 2.0,
  minFps: 30,
  gated: true,
  ...over,
});

describe('judgeRun', () => {
  it('PASSES the cell that really passed — scale/Week/1646, run 1', () => {
    // m0-condition.md run 1: baseline 0.56 pp (spread 1.11), treatment 1.30, delta +0.74, P1+P2 pass.
    const r = judgeRun(input());
    expect(r.verdict).toBe('PASS');
    expect(r.deltaPp).toBeCloseTo(0.74, 2);
    expect(r.indeterminateReason).toBeUndefined();
  });

  it('returns INDETERMINATE for the 1920 cell, NOT FAIL — F3', () => {
    // m0-condition.md run 2, scale/Week/1920: baseline 10.00 pp (spread 6.67), treatment 20.19.
    // The delta is +10.19 against a 2.00 pp bar, so the arithmetic alone says FAIL — and the
    // instrument's own noise floor is 6.67 pp, more than three times the bar. That document's
    // conclusion for this cell is that the environment "is disqualified from answering it".
    const r = judgeRun(input({ pairs: pairsFor(10.0, 6.67, 20.19, 58.2) }));
    expect(r.verdict).toBe('INDETERMINATE');
    expect(r.baselineSpreadPp).toBeCloseTo(6.67, 2);
    // P1 genuinely failed. The verdict outranks it, and the flag stays readable so a reader can see
    // exactly what was overridden and why.
    expect(r.p1).toBe(false);
    expect(r.indeterminateReason).toMatch(/cannot resolve the question/);
  });

  it('returns INDETERMINATE for the cell whose PROSE already said so — run 1, 1920', () => {
    // The canonical case, and the one a human had to spot by hand: baseline 0.93 pp with a spread
    // of 2.22 against a 2.00 bar. m0-condition.md finding 1: "The bar sits below the instrument's
    // noise floor, so this cell discriminates nothing." The CLI printed FAIL for it.
    const r = judgeRun(input({ pairs: pairsFor(0.93, 2.22, 3.15, 58.2) }));
    expect(r.verdict).toBe('INDETERMINATE');
  });

  it('still FAILS when the instrument is quiet and the treatment is genuinely costly', () => {
    // The discriminating case. Without it, INDETERMINATE could be "the spread is big" wearing a
    // different name, and a real regression on a quiet machine would be excused by it.
    const r = judgeRun(input({ pairs: pairsFor(1.0, 0.4, 9.0) }));
    expect(r.verdict).toBe('FAIL');
    expect(r.p1).toBe(false);
  });

  it('FAILS on fps even when the difference is small', () => {
    const r = judgeRun(input({ pairs: pairsFor(1.0, 0.4, 1.5, 22) }));
    expect(r.verdict).toBe('FAIL');
    expect(r.p1).toBe(true);
    expect(r.p2).toBe(false);
  });

  it('reports without judging when the run is not gated — the Fit preset', () => {
    // The shipped painter already drops ~10% of frames here on real hardware (#75). A gate that
    // fails on day one gets deleted rather than fixed (ADR-0058), so this preset has no verdict.
    const r = judgeRun(input({ pairs: pairsFor(99.07, 0.5, 100.0), gated: false }));
    expect(r.verdict).toBe('REPORTED_ONLY');
    expect(r.treatmentMeanPp).toBeCloseTo(100.0, 2);
  });

  it('THROWS rather than judging when too little is on screen — the control cell', () => {
    // m0-condition.md run 1: the 147-activity fixture control threw, and the file records that as
    // the harness behaving correctly rather than as a failure to work around.
    expect(() =>
      judgeRun(
        input({
          counts: {
            visibleChangedBars: 19,
            visibleBars: 147,
            visibleChangedLinks: 4,
            visibleLinks: 188,
          },
        }),
      ),
    ).toThrow(NothingToJudgeError);
  });

  it('THROWS on an empty run rather than averaging nothing', () => {
    // `mean([])` is NaN, and NaN <= 2.0 is false — so without this guard an empty run reports FAIL,
    // which is a confident answer derived from no data. ADR-0097 Landing C's shape, inverted.
    expect(() => judgeRun(input({ pairs: [] }))).toThrow(NothingToJudgeError);
  });

  it('THROWS on a non-finite baseline rather than propagating NaN into a verdict', () => {
    const pairs: RunPair[] = [{ baseline: timing(Number.NaN), treatment: timing(1) }];
    expect(() => judgeRun(input({ pairs }))).toThrow(NothingToJudgeError);
  });

  it('does not let a large but ALL-OFF-SCREEN change count', () => {
    // The proportional floor. 4 changed links out of 188 is 2.1%, below the 10% floor, even though
    // 4 is a real number of links — the ADR-0093 shape the floor exists to catch.
    expect(() =>
      judgeRun(
        input({
          counts: { ...AMPLE, visibleChangedLinks: 4, visibleLinks: 188 },
        }),
      ),
    ).toThrow(/NON-VACUITY FAILED/);
  });
});
