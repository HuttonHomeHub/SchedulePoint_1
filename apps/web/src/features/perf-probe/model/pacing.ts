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

/**
 * **The ONE percentile** (`docs/TECH_DEBT.md` #258). There were four, and they did not agree.
 *
 * Three spelled the index `floor(n · p)` — this module, `scenes/canvas-draw.ts`, and
 * `scripts/measure-draw-in-browser.js`, the harness that produced every p95 figure #75 argues in.
 * `scenes/revision-diff.ts` spelled it `floor((n − 1) · p)`. They differ at every sample count
 * where those two products floor to different integers, which is **most** of them: at n = 600,
 * p = 0.95 one reads index 570 and the other 569. On a realistic 600-gap distribution with a 5 %
 * tail that is **18.7 ms against 16.7 ms — a 12 % difference on the single quantity #75 is about.**
 *
 * That is not the hypothetical drift #258 warned of; it had already happened, and it was invisible
 * because each copy looks perfectly reasonable alone. It was found by reading the two side by side
 * while consolidating them, not by anything failing.
 *
 * **`floor(n · p)` wins, and the reason is comparability rather than correctness.** It is what
 * three of the four used, including both the module whose `measureIdleInterval` has a live caller
 * and the harness behind the numbers in the register — so every figure anybody has ever quoted
 * stays comparable with every figure taken from here on. The alternative silently re-bases the
 * whole history to buy a one-rank correction that **changes no verdict at all**: `judgeAbsolute`
 * decides on `fps` and `droppedPct`, and carries `worstIntervalP95` as a reported figure only.
 *
 * **The known, deliberate property, stated so nobody "fixes" it without reading this.** Against the
 * standard nearest-rank definition (`ceil(p · n) − 1`) this sits **one rank high** — for p = 0.95
 * on 600 samples it returns the 571st value rather than the 570th. It is therefore never optimistic
 * about a frame interval, which is the right direction for a performance figure to err in, and on
 * a run of 600 frames it is one sample. Changing it re-bases every reading in
 * `perf_probe_results`; that is a decision with a cost, not a tidy-up.
 */
export const percentile = (sortedAscending: readonly number[], p: number): number =>
  sortedAscending[Math.min(sortedAscending.length - 1, Math.floor(sortedAscending.length * p))] ??
  0;

/**
 * Timestamps to the intervals between them. One line, and a fifth home for it is exactly the kind
 * of thing nobody would think to compare — which is how the percentile above came to have two
 * answers. Both public functions below go through it.
 */
function gapsOf(stamps: readonly number[]): number[] {
  return stamps.slice(1).map((t, i) => t - (stamps[i] ?? t));
}

/** What one sustained rAF run reports about how its frames landed. */
export interface FramePacing {
  /** Gaps measured, i.e. one fewer than the timestamps collected. */
  frames: number;
  droppedPct: number;
  intervalP50: number;
  intervalP95: number;
  fps: number;
}

/**
 * **The ONE summary** (`docs/TECH_DEBT.md` #258). Both scenes carried this block
 * character-for-character apart from whether they reported `frames`, which is precisely the shape
 * that drifts: someone corrects the dropped-frame threshold or the percentile in one of them and
 * `canvas-draw` and `revision-diff` quietly stop being comparable to each other — the one property
 * the whole readings table exists to preserve (ADR-0128 D2).
 *
 * A frame is "dropped" when its interval exceeds **1.5×** the display's own, i.e. at least one
 * whole vsync was missed. Not a fixed 16.7 ms: see {@link measureIdleInterval}.
 *
 * It takes the raw rAF timestamps rather than pre-computed gaps, so the gap derivation is inside
 * the shared rule too — a caller that slices its own gaps is a fifth copy of the smallest and most
 * forgettable part of this.
 */
export function summariseFrameStamps(stamps: readonly number[], idleInterval: number): FramePacing {
  const gaps = gapsOf(stamps);
  const dropped = gaps.filter((g) => g > idleInterval * 1.5).length;
  const sorted = [...gaps].sort((a, b) => a - b);
  const mean = gaps.reduce((sum, g) => sum + g, 0) / Math.max(1, gaps.length);
  return {
    frames: gaps.length,
    droppedPct: (dropped / Math.max(1, gaps.length)) * 100,
    intervalP50: percentile(sorted, 0.5),
    intervalP95: percentile(sorted, 0.95),
    fps: 1000 / mean,
  };
}

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
  const gaps = gapsOf(stamps);
  gaps.sort((a, b) => a - b);
  return percentile(gaps, 0.5);
}

/**
 * There was a `panPhase` here, and it was dead.
 *
 * It was written as the one shared pan loop "so the panel and the CLI pace runs identically" — and
 * it had **zero callers**. Both scenes reimplemented the same gap/percentile/dropped-frame
 * arithmetic instead, which is the exact drift ADR-0128 D2 exists to prevent, with the module meant
 * to be canonical sitting unused beside them. Found by the M5 component review.
 *
 * Deleted rather than kept, because dead code that LOOKS like the shared home is worse than none:
 * the next person to fix an off-by-one in the dropped-frame threshold fixes it here, and neither
 * scene changes.
 *
 * **Unifying the two real implementations was filed as `#258` and is now DONE** — see
 * {@link percentile} and {@link summariseFrameStamps} above, and what that unification found. The
 * fear stated here was hypothetical and turned out to be history: by the time anyone looked, the
 * two copies already disagreed. `measureIdleInterval` was never the problem and is unchanged.
 */

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
