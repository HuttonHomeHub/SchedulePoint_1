import type { PhaseTiming } from './judge';

/**
 * Frame pacing under `requestAnimationFrame` — the quantity ADR-0026 §9 actually gates on.
 *
 * **This is the whole point of measuring here rather than timing a function.** `docs/TECH_DEBT.md`
 * #75 spent months treating a 4 ms paint duration as the budget; §9's gate has always been frames
 * per second under sustained pan, and at the Fit framing the measured p95 sat comfortably inside a
 * 16.7 ms frame while **10.2 % of frames were still dropped**. A duration budget was the wrong
 * *quantity*, not the wrong number — a painter can finish every frame quickly and still miss vsyncs.
 *
 * Extracted from `scripts/revision-diff-bench.ts` so the panel and the CLI pace runs identically.
 */

const percentile = (sortedAscending: readonly number[], p: number): number =>
  sortedAscending[Math.min(sortedAscending.length - 1, Math.floor(sortedAscending.length * p))] ??
  0;

/**
 * The display's OWN frame interval, measured rather than assumed.
 *
 * **Not a hard-coded 16.7 ms.** A 120 Hz laptop, a 144 Hz monitor and a throttled background tab all
 * pace differently, and "dropped" has to mean "missed a vsync on THIS display" or the number is
 * about the assumption instead of the machine. The product owner's Surface Pro is exactly the case
 * that makes this matter.
 */
export async function measureIdleInterval(frames = 60): Promise<number> {
  const stamps: number[] = [];
  await new Promise<void>((resolve) => {
    const tick = (t: number): void => {
      stamps.push(t);
      if (stamps.length > frames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const gaps = stamps.slice(1).map((t, i) => t - (stamps[i] ?? t));
  gaps.sort((a, b) => a - b);
  return percentile(gaps, 0.5);
}

/**
 * Run one sustained pan and report how the frames landed.
 *
 * `draw(frameIndex)` is called once per animation frame; the caller decides what a frame paints, so
 * the same loop serves a baseline, a treatment and any future scenario. Timing is taken from the rAF
 * timestamps rather than from around `draw`, because the gap between frames is what a planner feels.
 */
export async function panPhase(
  draw: (frameIndex: number) => void,
  frames: number,
  idleInterval: number,
): Promise<PhaseTiming> {
  const stamps: number[] = [];
  await new Promise<void>((resolve) => {
    let i = 0;
    const tick = (t: number): void => {
      stamps.push(t);
      draw(i);
      i += 1;
      if (i > frames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const gaps = stamps.slice(1).map((t, i) => t - (stamps[i] ?? t));
  // A frame is "dropped" when its interval exceeds 1.5x the display's own — at least one whole vsync
  // missed. Measured against the display, never against a constant, for the reason above.
  const dropped = gaps.filter((g) => g > idleInterval * 1.5).length;
  const sorted = [...gaps].sort((a, b) => a - b);
  const mean = gaps.reduce((s, g) => s + g, 0) / Math.max(1, gaps.length);
  return {
    droppedPct: (dropped / Math.max(1, gaps.length)) * 100,
    intervalP50: percentile(sorted, 0.5),
    intervalP95: percentile(sorted, 0.95),
    fps: 1000 / mean,
  };
}

/**
 * Why a run was refused, in the operator's terms.
 *
 * **These are refusals, not failures, and the distinction is the product.** A browser benchmark is
 * trivially invalidated — a backgrounded tab throttles rAF to about 1 Hz, another window takes the
 * GPU, the reader scrolls mid-run. Reporting any of those as a FAIL would be a confident wrong
 * answer about the painter, which is exactly the harm this epic exists to prevent.
 */
export type RefusalReason =
  'TAB_HIDDEN' | 'IMPLAUSIBLE_DISPLAY_CLOCK' | 'TOO_FEW_FRAMES' | 'NO_CANVAS_CONTEXT';

export interface Refusal {
  readonly reason: RefusalReason;
  /** A sentence an operator can act on. Not a code, and not an apology. */
  readonly sentence: string;
}

/**
 * A display interval outside this range means the clock is not telling us about a display.
 *
 * The low bound is below any real refresh rate (a 240 Hz panel is 4.17 ms); the high bound is above
 * a 30 Hz one and far below the ~1000 ms a hidden tab throttles to. Both are deliberately loose —
 * this is a sanity check on the instrument, not a judgement about the hardware.
 */
const MIN_PLAUSIBLE_INTERVAL_MS = 3;
const MAX_PLAUSIBLE_INTERVAL_MS = 40;

/** The fewest frames a phase may report and still be worth a percentile. */
export const MIN_FRAMES_FOR_A_RUN = 30;

/**
 * Check the run is worth judging, BEFORE the judge is asked.
 *
 * Ordered cheapest-first, and the visibility check leads because it is both the likeliest and the
 * most silently destructive: a throttled tab produces a beautifully consistent ~1000 ms interval,
 * which reads as a stable measurement rather than as no measurement at all.
 */
export function refuseRun(input: {
  documentHidden: boolean;
  idleInterval: number;
  frameCount: number;
  hasContext: boolean;
}): Refusal | null {
  if (!input.hasContext) {
    return {
      reason: 'NO_CANVAS_CONTEXT',
      sentence:
        'This browser did not give the probe a 2D canvas, so nothing was drawn and nothing was ' +
        'measured. Nothing is wrong with the plan or the painter.',
    };
  }
  if (input.documentHidden) {
    return {
      reason: 'TAB_HIDDEN',
      sentence:
        'The tab was hidden part-way through, so the browser throttled the frame loop. This run ' +
        'measures the throttle, not the diagram — keep this tab in front while it runs.',
    };
  }
  if (
    !Number.isFinite(input.idleInterval) ||
    input.idleInterval < MIN_PLAUSIBLE_INTERVAL_MS ||
    input.idleInterval > MAX_PLAUSIBLE_INTERVAL_MS
  ) {
    return {
      reason: 'IMPLAUSIBLE_DISPLAY_CLOCK',
      sentence:
        `The display reported a frame every ${input.idleInterval.toFixed(1)} ms, which is not a ` +
        'plausible refresh rate. Something else was competing for the machine, so this run cannot ' +
        'say anything about the diagram.',
    };
  }
  if (input.frameCount < MIN_FRAMES_FOR_A_RUN) {
    return {
      reason: 'TOO_FEW_FRAMES',
      sentence:
        `Only ${String(input.frameCount)} frames were recorded, which is too few to take a ` +
        'percentile from. The run ended early.',
    };
  }
  return null;
}
