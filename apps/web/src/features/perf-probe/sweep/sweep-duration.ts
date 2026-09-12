import { RUN_SIZES, type RunSize } from '../runner/run-probe';

import type { SweepStep } from './sweep-plan';

/**
 * Roughly how long a press will take, derived rather than stated as a constant.
 *
 * **The panel said "about twenty-five seconds" for every run.** That was true of one shape — a
 * full canvas-draw at the working zoom — and wrong for the others by a factor of two, which matters
 * because the number is the operator's basis for deciding whether to start something that covers
 * their screen and asks them to leave the machine alone.
 *
 * **A phase is a fixed frame count, so wall-clock = frames ÷ fps.** That is the whole model, and it
 * is the one `docs/specs/probe-sweep/m0-measurements.md` derives its ~119.5 s from — the same
 * arithmetic in the same terms, so a reader can check one against the other.
 *
 * **The fps figures below are DELIBERATELY coarse, and the estimate rounds up.** A precise-looking
 * "1 minute 58 seconds" would claim more than this can know: the whole point of the probe is that a
 * machine's frame rate is what is being measured, so the duration depends on the answer. An
 * operator needs to know whether this is thirty seconds or two minutes; they do not need seconds.
 */

/**
 * Phases per repeat, by scenario shape.
 *
 * `canvas-draw` runs two limbs (500 and 2,000 activities); `revision-diff` runs one limb whose every
 * repeat is a baseline phase AND a treatment phase. Both come to two, for different reasons, and
 * they are written separately so the next scenario is costed rather than assumed.
 */
function phasesPerRepeat(scenarioId: string): number {
  if (scenarioId === 'canvas-draw') return 2;
  if (scenarioId === 'revision-diff') return 2;
  // An unknown scenario is costed at one phase — an UNDER-estimate, so a longer run surprises
  // nobody into thinking the probe has hung. Guessing high would be the friendlier-looking error
  // and the worse one: an operator who is told two minutes and waits four stops trusting the number.
  return 1;
}

/**
 * The frame rate a step is assumed to hold, for estimation only.
 *
 * The whole-plan framing is slower, and by a lot: the same machine that holds 60 fps at the working
 * zoom measures 32.2 fps at Fit (`docs/TECH_DEBT.md` #75 item 6). Using one figure for both would
 * make the sweep's estimate wrong by nearly a minute, which is the difference between a number an
 * operator can plan around and one they learn to ignore.
 *
 * **The 25 is deliberately left below the measurement, and this comment cited 23.3 until
 * 2026-09-12.** That reading is the one figure in #75's set nothing has reproduced, withdrawn by
 * #261 as contaminated by machine state rather than by canvas size. Raising the constant to the
 * reproducing 32.2 would SHORTEN the estimate, and the paragraph above says which way this is
 * allowed to be wrong: an operator told two minutes who waits four stops trusting the number. So
 * the citation is corrected and the value is not, on purpose.
 */
function assumedFps(preset: string): number {
  return preset === 'fit' ? 25 : 60;
}

/**
 * Two figures this estimate deliberately does not match, recorded so neither reads as a mistake.
 *
 * **Against M0-T1's derivation it comes out at 126.4 s versus 119.5 s** — 5.8 % high, and traceable
 * rather than mysterious: that table costs canvas-draw's two limbs at their two measured rates
 * (57.2 and 23.3 fps) where this uses one coarse figure for the whole framing. The simplification is
 * the point — a per-limb fps table here would be a second copy of a measurement that lives in
 * `docs/TECH_DEBT.md`, and it would go stale there first.
 *
 * **Against the spec's user flow it says a quick sweep is ~13 s where §4.7 wrote "~30 s".** That
 * figure was written before anything was derived; this one comes from the frame counts. The
 * derivation wins, and the spec is the thing to correct.
 */

/** Seconds the display measurement costs before each step (`measureIdleInterval(60)` at ~60 Hz). */
const IDLE_MEASUREMENT_SECONDS = 1;

/** Seconds one step is expected to take. Exported so a confirmation can name its own step. */
export function estimateStepSeconds(step: SweepStep, size: RunSize): number {
  const { frames, repeats } = RUN_SIZES[size];
  const phases = phasesPerRepeat(step.scenario.id) * repeats;
  return IDLE_MEASUREMENT_SECONDS + (phases * frames) / assumedFps(step.preset);
}

export function estimateSweepSeconds(plan: readonly SweepStep[], size: RunSize): number {
  return plan.reduce((total, step) => total + estimateStepSeconds(step, size), 0);
}

/**
 * The estimate as an operator should read it: coarse, and never precise-looking.
 *
 * Rounded to a granularity that matches what the number can support — a quarter minute past a
 * minute, five seconds below it — so nothing here implies the probe knows how fast this machine is
 * before it has measured it.
 */
export function describeDuration(seconds: number): string {
  if (seconds < 15) return 'a few seconds';
  if (seconds < 75) return `about ${String(Math.round(seconds / 5) * 5)} seconds`;
  const minutes = Math.round((seconds / 60) * 2) / 2;
  return minutes === 1 ? 'about a minute' : `about ${String(minutes)} minutes`;
}
