/**
 * The verdict, as a pure function — shared by the browser panel and the existing CLI driver.
 *
 * **Extracted, never forked** (`docs/specs/staff-performance-probe/` M1). This logic lived in
 * `apps/web/scripts/measure-revision-diff.mjs:153-243`; the driver now calls it. Two copies of a
 * judgement drift invisibly — each looks right alone, and only somebody comparing two published
 * numbers months apart would ever see it (the ADR-0065 `routeOrthogonal` argument, and ADR-0121's
 * `stackSeries`). F1 is the proof that the move changed nothing: the CLI is the before/after oracle.
 *
 * **Nothing here touches a canvas, a clock or the DOM**, which is what lets every branch below be
 * unit-tested from a literal.
 */

/**
 * What a run can be judged to be.
 *
 * `INDETERMINATE` is the one this epic adds, and it is the reason the epic touches the judge at all.
 * See {@link judgeRun} for the rule and for why it outranks a FAIL.
 */
export type Verdict = 'PASS' | 'FAIL' | 'INDETERMINATE' | 'REPORTED_ONLY';

/** One measured window — the shape `revision-diff-bench.ts` already returns. */
export interface PhaseTiming {
  readonly droppedPct: number;
  readonly intervalP50: number;
  readonly intervalP95: number;
  readonly fps: number;
}

/** One baseline/treatment pair, run back to back so they share their machine's mood. */
export interface RunPair {
  readonly baseline: PhaseTiming;
  readonly treatment: PhaseTiming;
}

/**
 * How much of the treatment was actually on screen.
 *
 * **Counted inside the viewport**, because a changed set that is all off-screen costs the painter
 * nothing and would pass every pacing gate while proving nothing — the ADR-0093 shape, where a green
 * result cannot distinguish "it is cheap" from "there was nothing there".
 */
export interface VisibleCounts {
  readonly visibleChangedBars: number;
  readonly visibleBars: number;
  readonly visibleChangedLinks: number;
  readonly visibleLinks: number;
}

export interface JudgeInput {
  readonly pairs: readonly RunPair[];
  readonly counts: VisibleCounts;
  /** P1 — the largest dropped-frame difference that still counts as no cost, in percentage points. */
  readonly barPp: number;
  /** P2 — the absolute floor the treatment must hold. */
  readonly minFps: number;
  /**
   * When false the run is measured and reported with **no verdict at all** — the Fit preset, where
   * the shipped painter already drops ~10 % of frames on real hardware (`docs/TECH_DEBT.md` #75) and
   * a gate would fail on day one, which is how a gate gets deleted rather than fixed (ADR-0058).
   */
  readonly gated: boolean;
}

export interface JudgeResult {
  readonly verdict: Verdict;
  readonly baselineMeanPp: number;
  readonly treatmentMeanPp: number;
  readonly deltaPp: number;
  /** The baseline's own run-to-run spread — the instrument's noise floor for this run. */
  readonly baselineSpreadPp: number;
  /**
   * How much of the metric's range the baseline left unused — `100 - baselineMeanPp`.
   *
   * `droppedPct` is a share of frames, so it is bounded at 100 and the largest delta P1 can ever
   * see is this number. It is on every result, gated or not, because the reading that exposed
   * `docs/TECH_DEBT.md` #260 is an **ungated** one and would return before any gated branch.
   */
  readonly headroomPp: number;
  /**
   * True when the remaining headroom is smaller than the bar the delta is judged against.
   *
   * When it is, **P1 cannot fail** — a treatment that dropped every remaining frame would still
   * score inside the bar — so a delta printed beside it does not mean what it looks like.
   */
  readonly saturated: boolean;
  readonly treatmentFps: number;
  readonly p1: boolean;
  readonly p2: boolean;
  /** Present only for `INDETERMINATE`, and it says which quantity beat which. */
  readonly indeterminateReason?: string;
}

/**
 * P1 — the difference gate. ADR-0100's bar, taken because it is the only one in this repository that
 * has been used and passed, rather than invented for this epic.
 *
 * A **default**, not a constant baked into {@link judgeRun}: the bar is an input, so a caller states
 * which question it is asking. Both callers use this value, and they import it rather than repeating
 * it — the whole point of M1.
 */
export const MAX_DROPPED_DELTA_PP = 2.0;

/** P2 — the absolute floor. ADR-0026 §9's figure at the 2,000-activity ceiling. */
export const MIN_FPS = 30;

/** The floors, proportional so they ask the same question of a 147-activity scene and a 2,160 one. */
export const MIN_CHANGED_FRACTION = 0.1;
/** A tiny absolute guard underneath, because 10 % of two links is not a measurement either. */
export const MIN_CHANGED_ABSOLUTE = 5;

/**
 * Thrown when the run cannot be judged at all. **Distinct from a FAIL**, and that distinction is the
 * point: a caller that cannot tell "this is bad" from "this proves nothing" will report the first.
 */
export class NothingToJudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NothingToJudgeError';
  }
}

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const share = (n: number, d: number): number => (d === 0 ? 0 : (n / d) * 100);

/**
 * Judge a run, or refuse to.
 *
 * **It throws rather than returning a verdict it cannot justify.** ADR-0097 Landing C's harness
 * emitted a **PROCEED from an `undefined`** — an edit had silently failed to apply, and
 * `undefined >= 120` is `false`, which is the right answer from a missing number. So the checks run
 * in this order and non-vacuity runs FIRST: a treatment that drew nothing passes every pacing gate
 * perfectly.
 *
 * ## Why `INDETERMINATE` outranks `FAIL`, and why the rule is the simple one
 *
 * When the baseline's own run-to-run spread is at least as large as the bar, the instrument cannot
 * resolve the question being asked of it, and **no verdict computed from it means anything** —
 * including a FAIL.
 *
 * The tempting refinement is to keep FAIL when the delta clearly exceeds the noise (say
 * `delta - spread > bar`), on the grounds that a large enough effect is still detectable. It is
 * deliberately **not** implemented, because the source data says otherwise: `m0-condition.md`'s two
 * runs of **identical code** put the same 1920 cell at a baseline of 0.93 pp and then 10.00 pp — a
 * better-than-tenfold move with nothing in the code path changed — and that document's own
 * conclusion is that the environment "is disqualified from answering it", not that the second run
 * measured a real regression. A rule that reports FAIL from an unfit instrument invites somebody to
 * act on it, which is precisely the harm this verdict exists to prevent.
 *
 * So: **spread ≥ bar means the machine cannot answer, full stop.** Simple, conservative in the
 * direction of refusing, and with no tuning parameter to argue about later.
 *
 * ## Its sibling: the metric's range, not the machine's noise
 *
 * `docs/TECH_DEBT.md` #260 found the same shape one quantity along. `droppedPct` is bounded at 100,
 * so when the baseline sits near the ceiling the largest delta P1 can ever see is smaller than the
 * bar and **P1 cannot fail** — a treatment that dropped every remaining frame would score inside
 * it. The product owner's first real-hardware reading is the case: a baseline of 98.33 pp leaves
 * 1.67 pp against a 2.00 pp bar, and the report printed `delta -0.19 pp`, which reads as "the
 * overlay is free" and cannot mean that.
 *
 * Both refusals say "no verdict computed here means anything"; they differ in what has run out.
 * Saturation is checked first because a ceiling compresses the spread beneath it, so a saturated
 * run can look quiet at the exact moment it has nothing left to say.
 *
 * Today the CLI prints this as a *note after the verdict*, which reads as a result somebody should
 * act on; a human had to notice it by hand and write the finding into `m0-condition.md` §"Three
 * findings". Making it a first-class verdict is the correction this epic exists to make automatic.
 */
export function judgeRun(input: JudgeInput): JudgeResult {
  const { pairs, counts, barPp, minFps, gated } = input;
  const { visibleChangedBars, visibleBars, visibleChangedLinks, visibleLinks } = counts;

  // ── Non-vacuity FIRST. A treatment that drew nothing passes every pacing gate. ────────────────
  const enough = (n: number, d: number): boolean =>
    Number.isFinite(n) &&
    Number.isFinite(d) &&
    n >= MIN_CHANGED_ABSOLUTE &&
    share(n, d) >= MIN_CHANGED_FRACTION * 100;

  if (!enough(visibleChangedBars, visibleBars) || !enough(visibleChangedLinks, visibleLinks)) {
    throw new NothingToJudgeError(
      `NON-VACUITY FAILED — the treatment does not draw enough to judge.\n` +
        `  bars  ${String(visibleChangedBars)}/${String(visibleBars)} = ` +
        `${share(visibleChangedBars, visibleBars).toFixed(1)}% ` +
        `(need >= ${String(MIN_CHANGED_FRACTION * 100)}% and >= ${String(MIN_CHANGED_ABSOLUTE)})\n` +
        `  links ${String(visibleChangedLinks)}/${String(visibleLinks)} = ` +
        `${share(visibleChangedLinks, visibleLinks).toFixed(1)}% ` +
        `(need >= ${String(MIN_CHANGED_FRACTION * 100)}% and >= ${String(MIN_CHANGED_ABSOLUTE)})\n` +
        `This is NOT a pass. A verdict computed from this run would be meaningless.`,
    );
  }

  const baselineDropped = pairs.map((p) => p.baseline.droppedPct);
  const treatmentDropped = pairs.map((p) => p.treatment.droppedPct);

  if (pairs.length === 0 || baselineDropped.some((x) => !Number.isFinite(x))) {
    throw new NothingToJudgeError(
      'NOTHING TO JUDGE — no finite pair results. Refusing to produce a verdict.',
    );
  }

  const baselineMeanPp = mean(baselineDropped);
  const treatmentMeanPp = mean(treatmentDropped);
  const deltaPp = treatmentMeanPp - baselineMeanPp;
  const baselineSpreadPp = Math.max(...baselineDropped) - Math.min(...baselineDropped);
  const treatmentFps = mean(pairs.map((p) => p.treatment.fps));

  const p1 = deltaPp <= barPp;
  const p2 = treatmentFps >= minFps;

  // Computed for every result, gated or not, and that placement is the whole of #260's own
  // correction to itself. That row proposed the guard "where the spread guard sits" — and the
  // reading that exposed it is an **ungated** Fit run, which returns at the `!gated` line below
  // before any gated branch can be reached. A fact placed inside the verdict branch would have been
  // absent from the exhibit it was written for.
  const headroomPp = 100 - baselineMeanPp;
  const saturated = headroomPp < barPp;

  const common = {
    baselineMeanPp,
    treatmentMeanPp,
    deltaPp,
    baselineSpreadPp,
    headroomPp,
    saturated,
    treatmentFps,
    p1,
    p2,
  };

  // Reported, never gated — see `gated`.
  if (!gated) return { ...common, verdict: 'REPORTED_ONLY' };

  // ── The metric's remaining range against the question's precision. ────────────────────────────
  //
  // Checked BEFORE the spread guard, and the ordering is an argument rather than an arbitrary
  // choice: a ceiling **compresses** the spread it sits under. A baseline pinned at 99 pp on every
  // repeat has a spread of nearly zero, so the spread guard would read that machine as perfectly
  // able to resolve the question at the exact moment the metric has no room left to express an
  // answer. Saturation is the more fundamental refusal, so it speaks first.
  //
  // It is arithmetic, not policy — unlike the Fit preset's ungating, which is ADR-0058's
  // day-one-failure judgement. Any machine whose Week baseline ran hot enough reaches the same dead
  // zone with the gate still armed, which is why this is not confined to the framing that found it.
  if (saturated) {
    return {
      ...common,
      verdict: 'INDETERMINATE',
      indeterminateReason:
        `the baseline already dropped ${baselineMeanPp.toFixed(2)} pp of its frames, leaving ` +
        `${headroomPp.toFixed(2)} pp of headroom against a ${barPp.toFixed(2)} pp bar — so the ` +
        `largest difference this run could possibly show is smaller than the bar, and P1 cannot ` +
        `fail whatever the treatment costs. The delta below is a property of the ceiling, not a ` +
        `measurement of the feature. The remedy is a framing or a machine where the baseline has ` +
        `room, not a smaller bar.`,
    };
  }

  // The instrument's noise floor against the question's precision. Checked BEFORE pass/fail,
  // because an unfit instrument's PASS and its FAIL are equally meaningless.
  if (baselineSpreadPp >= barPp) {
    return {
      ...common,
      verdict: 'INDETERMINATE',
      indeterminateReason:
        `the baseline's own run-to-run spread (${baselineSpreadPp.toFixed(2)} pp) is at least as ` +
        `large as the bar it is judged against (${barPp.toFixed(2)} pp), so this machine cannot ` +
        `resolve the question. Neither a pass nor a fail from this run means anything. The remedy ` +
        `is a quieter machine, not a larger bar.`,
    };
  }

  return { ...common, verdict: p1 && p2 ? 'PASS' : 'FAIL' };
}

/**
 * What an absolute run measured, and whether it cleared ADR-0026 §9's floor.
 *
 * Separate from {@link JudgeResult} because it answers a **different question**, not because the
 * judge was forked. `revision-diff` asks "does this feature cost anything?", which needs a pair;
 * `canvas-draw` asks "does the shipped painter hold its frame rate?", which has no treatment to
 * compare against and no delta to bar. Collapsing the two into one function with an optional
 * `treatment` would produce exactly the ADR-0093 defect: a green result that cannot distinguish
 * "the feature is free" from "there was no feature in the run".
 *
 * They share this file, the {@link Verdict} vocabulary, {@link NothingToJudgeError} and the
 * INDETERMINATE philosophy — which is the part that would drift if it were written twice.
 */
export interface AbsoluteJudgeInput {
  /** One entry per repeat of the same phase. Repeats are what make the spread meaningful. */
  readonly runs: readonly PhaseTiming[];
  /** Bars the painter actually drew, from `cull` — the painter's own answer, not a second opinion. */
  readonly visibleBars: number;
  /** The floor below which the number is about the cull rather than the painter. */
  readonly minVisibleBars: number;
  /** ADR-0026 §9's floor AT THIS SCALE — 45 fps at 500 activities, 30 at 2,000. */
  readonly minFps: number;
  /** False at the Fit framing, where the shipped painter is already known to judder. */
  readonly gated: boolean;
  /**
   * The display's measured idle frame interval, in milliseconds — the same figure `refuseRun`
   * checks against its plausible band and the report prints.
   *
   * **Required, never defaulted** (`docs/TECH_DEBT.md` #275, and the ADR-0070 `hoursPerDay`
   * precedent). This value was stored on every row and printed in every block while the judge
   * never read it — `grep -c idleInterval judge.ts` returned 0 — so a machine whose display cannot
   * produce as many frames as the floor demands was failed for the display's cadence rather than
   * for the painter's cost. A default would reintroduce exactly that, silently, at whichever call
   * site forgot to pass it.
   *
   * Non-finite or non-positive means the row records no usable interval; the ceiling is then not
   * computed rather than guessed.
   */
  readonly idleInterval: number;
}

export interface AbsoluteJudgeResult {
  readonly verdict: Verdict;
  readonly meanFps: number;
  readonly slowestRunFps: number;
  readonly fastestRunFps: number;
  readonly meanDroppedPct: number;
  readonly worstIntervalP95: number;
  readonly visibleBars: number;
  readonly p2: boolean;
  readonly indeterminateReason?: string;
}

/**
 * Judge an absolute run, or refuse to.
 *
 * Same shape and same ordering as {@link judgeRun}, for the same reasons: non-vacuity first (a
 * canvas that drew almost nothing paces beautifully), then the instrument's fitness, then the
 * verdict.
 *
 * ## The non-vacuity floor is the one that matters here
 *
 * ADR-0066 recorded the exact failure this guards. A generated plan laid nose-to-tail spanned
 * twenty-eight years; the whole-plan zoom then culled roughly nine bars in ten, and the resulting
 * 4.6 ms p95 "looked like the budget being met" (`docs/TECH_DEBT.md` #75). Nothing about that number
 * was wrong — it was simply about the cull. An almost-empty canvas produces the best-looking result
 * this instrument can emit, which is why the check runs before anything else and **throws** rather
 * than returning a low-confidence pass.
 *
 * ## INDETERMINATE, expressed in this scenario's own quantity
 *
 * {@link judgeRun} calls a run indeterminate when the baseline's run-to-run spread is at least as
 * large as the bar. There is no bar here, so the analogue is stated directly: **if the repeats
 * disagree about the answer — some clear the floor and some do not — the machine cannot resolve the
 * question.** No tolerance, no tuning parameter, and no rule that could report a FAIL from an
 * instrument that also reported a PASS on the same code minutes earlier. That is precisely the
 * situation `m0-condition.md` recorded (0.93 pp and then 10.00 pp for identical code) and concluded
 * disqualified the environment rather than proving a regression.
 *
 * Runs that **all** fall below the floor are a consistent FAIL, and runs that all clear it are a
 * consistent PASS. Only disagreement is refused.
 */
export function judgeAbsolute(input: AbsoluteJudgeInput): AbsoluteJudgeResult {
  const { runs, visibleBars, minVisibleBars, minFps, gated, idleInterval } = input;

  // ── Non-vacuity FIRST. An almost-empty canvas paces perfectly. ────────────────────────────────
  if (!Number.isFinite(visibleBars) || visibleBars < minVisibleBars) {
    throw new NothingToJudgeError(
      `NON-VACUITY FAILED — the painter did not draw enough for this run to be about the painter.\n` +
        `  visible bars ${String(visibleBars)} (need >= ${String(minVisibleBars)})\n` +
        `This is NOT a pass. A number measured on an almost-empty canvas is a number about the ` +
        `cull, which is how a 4.6 ms p95 once looked like the draw budget being met (ADR-0066).`,
    );
  }

  const fpsValues = runs.map((r) => r.fps);
  if (runs.length === 0 || fpsValues.some((x) => !Number.isFinite(x))) {
    throw new NothingToJudgeError(
      'NOTHING TO JUDGE — no finite run results. Refusing to produce a verdict.',
    );
  }

  const meanFps = mean(fpsValues);
  const slowestRunFps = Math.min(...fpsValues);
  const fastestRunFps = Math.max(...fpsValues);
  const p2 = meanFps >= minFps;

  const common = {
    meanFps,
    slowestRunFps,
    fastestRunFps,
    meanDroppedPct: mean(runs.map((r) => r.droppedPct)),
    worstIntervalP95: Math.max(...runs.map((r) => r.intervalP95)),
    visibleBars,
    p2,
  };

  // Reported, never gated — the Fit framing, where a gate would fail on day one (ADR-0058).
  if (!gated) return { ...common, verdict: 'REPORTED_ONLY' };

  /**
   * **The display's own ceiling, before any question about the painter** (`docs/TECH_DEBT.md`
   * #275).
   *
   * A display that emits a frame every `idleInterval` ms cannot exceed `1000 / idleInterval` fps
   * whatever the painter costs. When that ceiling is at or below the floor, the run is not a
   * measurement of the painter at all — it is arithmetic about the hardware — and reporting FAIL
   * is a confidently wrong answer about somebody's machine.
   *
   * Observed on iOS 18.7 Safari, `web-v0.125.1`: an idle interval of 33.00 ms (30 Hz, ceiling
   * 30.3 fps) judged against the 500-activity floor of 45 fps. The probe admits such a display on
   * purpose — `MIN/MAX_PLAUSIBLE_INTERVAL_MS` is 3..40, because 30 Hz is a real display and not a
   * broken clock — so `refuseRun` is right to accept it and this is where the answer belongs.
   *
   * **Checked BEFORE the straddle case**, because when the ceiling binds, "the repeats disagree"
   * is the wrong explanation for a reader to be given: the repeats agree perfectly and the floor
   * is unreachable. Both return INDETERMINATE, and which reason is printed is the whole value.
   *
   * **It is not a phone rule.** Any throttled display reaches it — Low Power Mode, a laptop on
   * battery, a panel negotiated at 30 Hz, a remote or virtualised session, thermal throttling.
   *
   * **What this deliberately does NOT do**: it does not add a margin. The 2,000-activity floor of
   * 30 fps against a 30.3 fps ceiling leaves about 1 % of headroom, and #275 rightly calls a
   * verdict decided at that distance a coin toss — but catching it means choosing a margin, and no
   * margin has ever been measured here. Inventing one would be the number-tuned-to-the-answer this
   * repository keeps refusing. The residual stays on #275 as an open decision.
   */
  const ceilingFps = Number.isFinite(idleInterval) && idleInterval > 0 ? 1000 / idleInterval : null;
  if (ceilingFps !== null && ceilingFps <= minFps) {
    return {
      ...common,
      verdict: 'INDETERMINATE',
      indeterminateReason:
        `this display cannot reach the floor. It emits a frame every ` +
        `${idleInterval.toFixed(2)} ms, an arithmetic ceiling of ${ceilingFps.toFixed(1)} fps, and ` +
        `the floor for this reading is ${String(minFps)} fps. No painter, however cheap, can ` +
        `produce a passing number on this machine, so neither a pass nor a fail from this run says ` +
        `anything about the painter. The remedy is a display that can answer the question — not a ` +
        `lower floor, and not a faster painter.`,
    };
  }

  if (slowestRunFps < minFps && fastestRunFps >= minFps) {
    return {
      ...common,
      verdict: 'INDETERMINATE',
      indeterminateReason:
        `the repeats disagree about the answer — the slowest ran at ${slowestRunFps.toFixed(1)} fps ` +
        `and the fastest at ${fastestRunFps.toFixed(1)} fps, either side of the ` +
        `${String(minFps)} fps floor. This machine cannot resolve the question, so neither a pass ` +
        `nor a fail from this run means anything. The remedy is a quieter machine, not a lower floor.`,
    };
  }

  return { ...common, verdict: p2 ? 'PASS' : 'FAIL' };
}
