import { describe, expect, it } from 'vitest';

import { judgeAbsolute, NothingToJudgeError, type PhaseTiming } from './judge';

/**
 * The absolute judge — `canvas-draw`'s half, and in particular the two refusals.
 *
 * Every case here is a run that produces a **plausible-looking number**. That is the whole class of
 * defect this function exists to refuse: a canvas that drew almost nothing paces beautifully, and a
 * machine whose repeats disagree still emits a mean somebody could quote.
 */
const at = (fps: number): PhaseTiming => ({
  droppedPct: 0,
  intervalP50: 1000 / fps,
  intervalP95: 1000 / fps,
  fps,
});

const base = {
  visibleBars: 400,
  minVisibleBars: 100,
  minFps: 30,
  gated: true,
  // 16.67 ms — an ordinary 60 Hz display, so the ceiling is ~60 fps and never binds in the cases
  // that are about something else. Stated rather than defaulted inside the judge, for the reason
  // the ceiling case below exists.
  idleInterval: 1000 / 60,
};

describe('judgeAbsolute', () => {
  /**
   * **The display's own ceiling** (`docs/TECH_DEBT.md` #275).
   *
   * Observed, not hypothesised: a run on iOS 18.7 Safari, `web-v0.125.1`, reported an idle frame
   * interval of 33.00 ms — a 30 Hz display, so an arithmetic ceiling of 30.3 fps. The
   * 500-activity limb's floor is 45 fps, which that machine **cannot reach whatever the painter
   * costs**, and the probe called it FAIL — a confidently wrong answer about somebody's hardware,
   * which is the class ADR-0130's whole epic exists to remove.
   *
   * The probe admits such a display on purpose: `MIN/MAX_PLAUSIBLE_INTERVAL_MS` is 3..40, so 33 ms
   * is inside the plausible band because 30 Hz is a real display and not a broken clock. So
   * `refuseRun` is right to accept it and the judge was wrong to hold it to an unreachable floor.
   *
   * This is #260 mirrored — that was a metric with no room at the CEILING, making a gated delta
   * arithmetically unfailable; this is no room at the FLOOR, making an absolute gate
   * arithmetically unpassable.
   */
  describe('a floor above the display\u2019s own refresh rate', () => {
    const THIRTY_HZ = 33;

    it('returns INDETERMINATE rather than FAIL, and names the arithmetic', () => {
      const r = judgeAbsolute({
        ...base,
        idleInterval: THIRTY_HZ,
        minFps: 45,
        runs: [at(30), at(30), at(30)],
      });

      expect(r.verdict).toBe('INDETERMINATE');
      // The reason must carry BOTH numbers and the word ceiling: a reader on that machine has to be
      // able to tell "your display cannot answer this" from "your painter is slow", and those are
      // the only two facts that separate them.
      expect(r.indeterminateReason).toMatch(/ceiling/i);
      expect(r.indeterminateReason).toContain('45');
      expect(r.indeterminateReason).toMatch(/30\.3/);
    });

    it('does not fire when the display can reach the floor', () => {
      // Same 30 Hz display, the 2,000-activity floor of 30 fps. The ceiling is 30.3, ABOVE the
      // floor, so the ceiling rule must not claim it. This run is a genuine FAIL and stays one —
      // the pinned negative, without which the case above is satisfied by a rule that fires always.
      const r = judgeAbsolute({
        ...base,
        idleInterval: THIRTY_HZ,
        minFps: 30,
        runs: [at(29.9), at(29.8), at(29.9)],
      });
      expect(r.verdict).toBe('FAIL');
    });

    it('does not fire on an ordinary display, and leaves PASS alone', () => {
      const r = judgeAbsolute({ ...base, minFps: 45, runs: [at(58), at(57), at(59)] });
      expect(r.verdict).toBe('PASS');
    });

    it('is skipped, not guessed, when the interval is unusable', () => {
      // A row that records no usable interval cannot have a ceiling computed, and inventing one
      // would be the defect inverted — a machine failed or excused on a number nobody measured.
      // The verdict is then whatever it would have been.
      const r = judgeAbsolute({
        ...base,
        idleInterval: Number.NaN,
        minFps: 45,
        runs: [at(30), at(30), at(30)],
      });
      expect(r.verdict).toBe('FAIL');
    });
  });

  it('passes a run that clears the floor on every repeat', () => {
    const r = judgeAbsolute({ ...base, runs: [at(58), at(55), at(60)] });
    expect(r.verdict).toBe('PASS');
    expect(r.p2).toBe(true);
    expect(r.slowestRunFps).toBe(55);
    expect(r.fastestRunFps).toBe(60);
  });

  it('fails a run that misses the floor on every repeat', () => {
    // Consistent is the operative word: all three agree, so the machine CAN answer, and the answer
    // is no. This is the case an INDETERMINATE-everywhere rule would have wrongly swallowed.
    const r = judgeAbsolute({ ...base, runs: [at(22), at(24), at(21)] });
    expect(r.verdict).toBe('FAIL');
    expect(r.p2).toBe(false);
  });

  it('refuses to judge when the repeats disagree about the answer', () => {
    // 25 and 44 either side of a 30 fps floor. The mean is 34.5, which would report a confident PASS
    // from an instrument that produced a FAIL on the same code one repeat earlier — exactly the
    // situation `m0-condition.md` concluded disqualified its environment rather than proving
    // anything. Without the branch this returns PASS.
    const r = judgeAbsolute({ ...base, runs: [at(25), at(44)] });
    expect(r.verdict).toBe('INDETERMINATE');
    expect(r.indeterminateReason).toMatch(/repeats disagree/);
    expect(r.indeterminateReason).toMatch(/quieter machine, not a lower floor/);
  });

  it('reports the numbers even when it refuses to judge them', () => {
    // The refusal is not a black hole: an operator still needs to see what the machine did, or the
    // only actionable information in the run is thrown away with the verdict.
    const r = judgeAbsolute({ ...base, runs: [at(25), at(44)] });
    expect(r.meanFps).toBeCloseTo(34.5, 5);
    expect(r.visibleBars).toBe(400);
  });

  it('throws rather than passing a run that drew almost nothing', () => {
    // ADR-0066's failure exactly: nine bars in ten culled, and the resulting number looked like the
    // budget being met. A canvas with nothing on it produces the best result this instrument can
    // emit, so this is a throw and not a low-confidence pass.
    expect(() => judgeAbsolute({ ...base, visibleBars: 12, runs: [at(120)] })).toThrow(
      NothingToJudgeError,
    );
    expect(() => judgeAbsolute({ ...base, visibleBars: 12, runs: [at(120)] })).toThrow(
      /NOT a pass/,
    );
  });

  it('checks non-vacuity BEFORE anything else', () => {
    // Order matters for what a reader is told. An empty canvas with no finite runs should report the
    // empty canvas — the cause — not "no finite run results", which sends them looking at the clock.
    expect(() => judgeAbsolute({ ...base, visibleBars: 0, runs: [at(Number.NaN)] })).toThrow(
      /NON-VACUITY FAILED/,
    );
  });

  it('throws on no runs at all rather than dividing by zero', () => {
    expect(() => judgeAbsolute({ ...base, runs: [] })).toThrow(NothingToJudgeError);
  });

  it('produces no verdict at all when the scenario is not gated', () => {
    // The Fit framing. The shipped painter already drops ~10 % of frames there on real hardware, so
    // a gate fails on day one and gets deleted rather than fixed (ADR-0058).
    const r = judgeAbsolute({ ...base, gated: false, runs: [at(11), at(52)] });
    expect(r.verdict).toBe('REPORTED_ONLY');
    // And it does NOT quietly become INDETERMINATE on the way past: those repeats disagree wildly,
    // and an ungated run has no floor for them to disagree about.
    expect(r.indeterminateReason).toBeUndefined();
  });

  it('still refuses an ungated run that drew nothing', () => {
    // Non-vacuity is not about the verdict — it is about whether the numbers mean anything, and a
    // REPORTED_ONLY row of figures taken from an empty canvas is exactly as misleading as a PASS.
    expect(() => judgeAbsolute({ ...base, gated: false, visibleBars: 3, runs: [at(120)] })).toThrow(
      NothingToJudgeError,
    );
  });

  it('applies the floor it is given, not the 30 fps one', () => {
    // ADR-0026 §9 is TWO floors — 45 fps at 500 activities and 30 at 2,000 — and judging the
    // 500-activity limb against 30 is a third easier than the gate actually is. M1 shipped exactly
    // that mistake in the registry; this pins the judge's half of it.
    expect(judgeAbsolute({ ...base, minFps: 45, runs: [at(38), at(37)] }).verdict).toBe('FAIL');
    expect(judgeAbsolute({ ...base, minFps: 30, runs: [at(38), at(37)] }).verdict).toBe('PASS');
  });
});
