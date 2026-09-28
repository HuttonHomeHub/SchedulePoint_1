/**
 * The activities-panel M0 verdict, as a pure function — imported by
 * `measure-activities-panel.mjs` and exercised standalone by
 * `measure-activities-panel.judge.test.mjs` (`node scripts/measure-activities-panel.judge.test.mjs`).
 *
 * **Nothing here touches a browser, a clock or the filesystem**, which is what lets every branch be
 * unit-tested from a literal array of numbers — the ADR-0128 `judge.ts` discipline, applied to a
 * different question. That judge compares a baseline/treatment PAIR (does a feature cost anything?);
 * this one compares SEVEN REPEATS of one measurement against a single committed bar (does this
 * interaction meet its Core-Web-Vitals or fps floor?). Different shape, same vocabulary and the same
 * refusal to compute a verdict it cannot justify — see `docs/specs/activities-panel-scale/m0-conditions.md`
 * for the rule this file exists to apply mechanically.
 */

/** @typedef {'PASS' | 'FAIL' | 'INDETERMINATE' | 'REPORTED_ONLY'} Verdict */

/**
 * Thrown when a limb has nothing to judge — an empty repeat set, or a non-finite value in it. Kept
 * distinct from a FAIL for the same reason `ADR-0128`'s `NothingToJudgeError` is: a caller that
 * cannot tell "this failed the bar" from "this proves nothing" reports the wrong one.
 */
export class NothingToJudgeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NothingToJudgeError';
  }
}

/**
 * The spread guard's fraction of the bar. `m0-conditions.md`'s rule: `INDETERMINATE` when the range
 * straddles the bar, **or** when the spread exceeds this fraction of the bar — the second clause
 * fires even on a run that never straddles, because a wide-but-one-sided spread is still a run this
 * instrument cannot resolve with confidence.
 */
export const SPREAD_FRACTION = 0.5;

/**
 * Judge one limb's seven repeats against one bar, or refuse to.
 *
 * @param {object} input
 * @param {readonly number[]} input.values - one entry per repeat, in the limb's own unit (ms or
 *   fps). Order does not matter; this looks only at the range.
 * @param {number} input.bar - the ceiling (`direction: 'max'`) or floor (`direction: 'min'`) the
 *   limb is judged against.
 * @param {'max' | 'min'} input.direction - `'max'`: lower is better and `bar` is a ceiling (E1, I2,
 *   I3, I4 — a latency in ms). `'min'`: higher is better and `bar` is a floor (S1 — fps).
 * @param {boolean} input.gated - when false the limb is measured and reported with **no verdict**
 *   (the two `REPORTED_ONLY` limbs — N1's long-task total and I4's collapsed-vs-expanded delta — and
 *   every limb at 4× CPU, which this file's own conditions mark as a sensitivity figure, not a bar).
 * @returns {{
 *   verdict: Verdict,
 *   min: number,
 *   max: number,
 *   median: number,
 *   spread: number,
 *   bar: number,
 *   direction: 'max' | 'min',
 *   straddles: boolean,
 *   indeterminateReason?: string,
 * }}
 */
export function judgeLimb({ values, bar, direction, gated }) {
  if (direction !== 'max' && direction !== 'min') {
    throw new Error(`judgeLimb: direction must be 'max' or 'min', got ${String(direction)}`);
  }
  if (!Number.isFinite(bar)) {
    throw new Error(`judgeLimb: bar must be finite, got ${String(bar)}`);
  }
  if (values.length === 0) {
    throw new NothingToJudgeError(
      'NOTHING TO JUDGE — no repeats were recorded for this limb. Refusing to produce a verdict.',
    );
  }
  const nonFinite = values.find((v) => !Number.isFinite(v));
  if (nonFinite !== undefined) {
    throw new NothingToJudgeError(
      `NOTHING TO JUDGE — a non-finite repeat (${String(nonFinite)}) was recorded. A missing Event ` +
        `Timing entry must be recorded as "< 16 ms", never as 0 or as a failure, before it reaches ` +
        'this function.',
    );
  }

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const spread = max - min;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  // "Wholly on one side" is direction-dependent: for a ceiling, the pass side is <= bar; for a
  // floor, the pass side is >= bar.
  const allPass = direction === 'max' ? max <= bar : min >= bar;
  const allFail = direction === 'max' ? min > bar : max < bar;
  const straddles = !allPass && !allFail;

  const common = { min, max, median, spread, bar, direction, straddles };

  if (!gated) return { ...common, verdict: 'REPORTED_ONLY' };

  if (straddles) {
    return {
      ...common,
      verdict: 'INDETERMINATE',
      indeterminateReason:
        `the 7-run range [${min}, ${max}] straddles the bar (${String(bar)}), so this limb's ` +
        'seven repeats disagree about which side of the bar the interaction sits on. Neither a ' +
        'pass nor a fail from this run means anything.',
    };
  }

  if (spread > SPREAD_FRACTION * bar) {
    return {
      ...common,
      verdict: 'INDETERMINATE',
      indeterminateReason:
        `the 7-run spread (${spread.toFixed(2)}) exceeds ${String(SPREAD_FRACTION * 100)}% of the ` +
        `bar (${String(bar)}), even though every repeat landed on the same side of it. The ` +
        'instrument is too noisy on this machine to trust the side it landed on.',
    };
  }

  return { ...common, verdict: allPass ? 'PASS' : 'FAIL' };
}
