// @ts-check
/**
 * Fixtures for `measure-activities-panel.judge.mjs` — **and every case names the mutation that
 * makes it red** (ADR-0110 D5: a gate is not finished when it passes; it is finished when it has
 * been made to fail by the defect it was written for).
 *
 * Run standalone: `node scripts/measure-activities-panel.judge.test.mjs`
 */

import assert from 'node:assert/strict';

import {
  judgeLimb,
  NothingToJudgeError,
  SPREAD_FRACTION,
} from './measure-activities-panel.judge.mjs';

let run = 0;
const it = (what, fn) => {
  run += 1;
  try {
    fn();
  } catch (err) {
    process.stdout.write(`  ✗ ${what}\n    ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
};

// ── PASS ──────────────────────────────────────────────────────────────────────────────────────
// Mutation that makes this red: swap `allPass` / `allFail` in `judgeLimb` (or hard-code
// `verdict: 'FAIL'` on the final return) — a run wholly under a ceiling bar must read PASS.
it('a ceiling limb (E1-shaped): all seven repeats under the bar is PASS', () => {
  const result = judgeLimb({
    values: [120, 130, 118, 125, 140, 115, 132],
    bar: 200,
    direction: 'max',
    gated: true,
  });
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.straddles, false);
});

// Mutation that makes this red: use `direction === 'max'` logic for a floor limb (i.e. never branch
// on `direction`) — a run wholly ABOVE a floor bar must also read PASS.
it('a floor limb (S1-shaped): all seven repeats at or above the fps floor is PASS', () => {
  const result = judgeLimb({
    values: [46, 47, 45, 48, 46, 45.5, 47.2],
    bar: 45,
    direction: 'min',
    gated: true,
  });
  assert.equal(result.verdict, 'PASS');
});

// ── FAIL ──────────────────────────────────────────────────────────────────────────────────────
// Mutation that makes this red: `allFail` computed as `min >= bar` instead of `min > bar` (or the
// final ternary inverted) — a run wholly over a ceiling bar must read FAIL, not PASS.
it('a ceiling limb: all seven repeats over the bar is FAIL', () => {
  const result = judgeLimb({
    values: [220, 230, 240, 210, 225, 250, 215],
    bar: 200,
    direction: 'max',
    gated: true,
  });
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.straddles, false);
});

// Mutation that makes this red: drop the `direction === 'min'` branch of `allFail` so a floor limb
// is judged with the ceiling's rule — a run wholly BELOW the floor must read FAIL.
it('a floor limb: all seven repeats below the fps floor is FAIL', () => {
  const result = judgeLimb({
    values: [20, 22, 21, 19, 23, 20.5, 21.5],
    bar: 30,
    direction: 'min',
    gated: true,
  });
  assert.equal(result.verdict, 'FAIL');
});

// ── INDETERMINATE (straddle) ─────────────────────────────────────────────────────────────────
// Mutation that makes this red: delete the `if (straddles)` branch entirely, so a straddling run
// falls through to the plain PASS/FAIL ternary — this asserts the straddle case is caught FIRST
// and reads INDETERMINATE, not whichever side the median happens to land on.
it('a ceiling limb whose range straddles the bar is INDETERMINATE, never a silent PASS/FAIL', () => {
  const result = judgeLimb({
    values: [180, 190, 210, 195, 185, 205, 199],
    bar: 200,
    direction: 'max',
    gated: true,
  });
  assert.equal(result.verdict, 'INDETERMINATE');
  assert.equal(result.straddles, true);
  assert.match(result.indeterminateReason ?? '', /straddles the bar/);
});

it('a floor limb whose range straddles the bar is INDETERMINATE', () => {
  const result = judgeLimb({
    values: [44, 46, 43, 47, 45, 44.5, 46.5],
    bar: 45,
    direction: 'min',
    gated: true,
  });
  assert.equal(result.verdict, 'INDETERMINATE');
  assert.equal(result.straddles, true);
});

// ── INDETERMINATE (spread > 50% of the bar) ──────────────────────────────────────────────────
// Mutation that makes this red: delete the spread check (`if (spread > SPREAD_FRACTION * bar)`),
// leaving only the straddle check — a run that never straddles but whose spread swamps the bar
// must still be refused, per `m0-conditions.md`'s "or when the spread exceeds 50% of the bar"
// clause, which is a SEPARATE trigger from straddling.
it('a wide but one-sided range is INDETERMINATE on spread alone, not PASS', () => {
  // Every value is comfortably under the 200 ms bar (so it never straddles), but the spread
  // (140 - 20 = 120) is 60% of the bar, past the 50% guard.
  const result = judgeLimb({
    values: [20, 140, 40, 100, 60, 80, 30],
    bar: 200,
    direction: 'max',
    gated: true,
  });
  assert.equal(result.straddles, false, 'this fixture must not straddle — it tests spread alone');
  assert.equal(result.verdict, 'INDETERMINATE');
  assert.match(result.indeterminateReason ?? '', /spread/);
});

it('exactly 50% of the bar is still resolvable (the guard is a strict ">")', () => {
  // spread = 100, bar = 200, 100 is exactly 50% of 200 — the boundary itself must not refuse.
  const result = judgeLimb({
    values: [50, 150, 100, 120, 80, 90, 110],
    bar: 200,
    direction: 'max',
    gated: true,
  });
  assert.equal(result.spread, 100);
  assert.equal(result.spread, SPREAD_FRACTION * result.bar);
  assert.equal(result.verdict, 'PASS');
});

// ── REPORTED_ONLY ─────────────────────────────────────────────────────────────────────────────
// Mutation that makes this red: delete the `if (!gated) return …` early exit — an ungated limb
// (N1, I4's control delta, and every limb at 4x CPU) must never be given a PASS/FAIL verdict, even
// when it would clear the bar.
it('an ungated limb is REPORTED_ONLY whatever the numbers say', () => {
  const wouldFail = judgeLimb({
    values: [900, 950, 920, 930, 910, 940, 905],
    bar: 200,
    direction: 'max',
    gated: false,
  });
  assert.equal(wouldFail.verdict, 'REPORTED_ONLY');
  const wouldPass = judgeLimb({
    values: [10, 12, 11, 9, 13, 10.5, 11.5],
    bar: 200,
    direction: 'max',
    gated: false,
  });
  assert.equal(wouldPass.verdict, 'REPORTED_ONLY');
});

// ── throw-on-empty (and non-finite) ──────────────────────────────────────────────────────────
// Mutation that makes this red: skip the `values.length === 0` guard and let `Math.min()`/
// `Math.max()` on an empty array through (they return `Infinity`/`-Infinity`, which sorts to a
// confident-looking but meaningless verdict) — the judge must REFUSE, not guess.
it('an empty repeat set throws NothingToJudgeError rather than producing a verdict', () => {
  assert.throws(
    () => judgeLimb({ values: [], bar: 200, direction: 'max', gated: true }),
    NothingToJudgeError,
  );
});

it('a non-finite repeat (a dropped Event Timing entry recorded as NaN) also throws', () => {
  assert.throws(
    () => judgeLimb({ values: [100, NaN, 120], bar: 200, direction: 'max', gated: true }),
    NothingToJudgeError,
  );
});

// ── argument validation ───────────────────────────────────────────────────────────────────────
it('an unknown direction throws rather than silently defaulting', () => {
  assert.throws(() =>
    judgeLimb({ values: [1], bar: 1, direction: /** @type {any} */ ('sideways'), gated: true }),
  );
});

process.stdout.write(
  process.exitCode === 1
    ? `measure-activities-panel.judge: FAILED (${run} cases)\n`
    : `measure-activities-panel.judge: ${run} cases OK\n`,
);
