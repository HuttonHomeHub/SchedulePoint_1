import type { ProbeResultBody } from '../api/probe-results';
import { describeStoreFailure, type StoreFailure } from '../model/store-failure';
import { toProbeBody } from '../model/to-probe-body';
import type { ProbeOutcome, RunSize } from '../runner/run-probe';

import { sweepPlan, type SweepStep } from './sweep-plan';

/**
 * One press of **Run all measurements**: every reading the probe can take, recorded as each lands.
 *
 * **Orchestration only.** It takes the runner and the store as callbacks and holds no React, no
 * canvas and no clock of its own, which is what lets every branch below be driven from literals —
 * including the ones a real run reaches once in fifty (a refusal on step two, a POST that fails on
 * step three, a Stop between steps).
 *
 * **All three controls go through this.** A single run is a one-step sweep, which is not a
 * simplification for its own sake: two orchestrations would drift, and the drift would be invisible
 * because each looks right alone — the ADR-0065 `routeOrthogonal` argument, and the reason M2's
 * formatter became one model with two adapters rather than two formatters.
 */

/** What happened to one step, in the vocabulary the panel and the report both use. */
export type SweepStepStatus =
  /** Not reached yet. A sweep stopped early leaves steps here, and they are NOT refusals. */
  | 'waiting'
  | 'running'
  | 'recorded'
  /** Measured, and the POST failed. The figures exist; the row does not. Retryable. */
  | 'not recorded'
  /** The machine declined — a hidden tab, an implausible clock. Nothing was measured. */
  | 'refused'
  /** The operator stopped before this step began. Distinct from refused: nobody tried. */
  | 'not taken';

export interface SweepStepResult {
  readonly step: SweepStep;
  readonly status: SweepStepStatus;
  readonly outcome: ProbeOutcome | null;
  /** Present only for `not recorded`, so a retry can send exactly what failed. */
  readonly body: ProbeResultBody | null;
  /**
   * Why the write failed, and whether a retry could ever clear it — present only for
   * `not recorded` (`docs/TECH_DEBT.md` #269).
   *
   * The catch below used to swallow the error whole, so the panel had one sentence for a dropped
   * socket and for a 422 alike, and offered the same button for both. Derived once here rather
   * than in the panel, because "which statuses are retryable" is a decision and two call sites
   * would eventually answer it differently.
   */
  readonly storeFailure: StoreFailure | null;
}

export interface SweepOutcome {
  /**
   * Minted once per press, and `null` when this press is not a sitting.
   *
   * Every step's rows carry it, which is what makes them one sitting; a single press carries none,
   * which is what stops it claiming to be a sitting of one with three readings missing.
   */
  readonly sweepId: string | null;
  /**
   * The protocol every step in this sitting ran under.
   *
   * **Carried on the outcome so a resume cannot pick a different one.** `missingSteps` re-runs
   * under the same `sweepId`, and a `quick` reading stored beside a `full` one under a single id is
   * a sitting whose rows were taken under two protocols — legible in the Protocol column and
   * invisible in the sentence that names the sitting. Reading the size off the outcome makes the
   * match structural rather than something the panel has to remember.
   */
  readonly size: RunSize;
  readonly steps: readonly SweepStepResult[];
  /** True when the operator stopped it. Steps after the stop are `not taken`, never `refused`. */
  readonly stopped: boolean;
}

export interface RunSweepInput {
  readonly size: RunSize;
  readonly machineLabel: string | null;
  /**
   * Mints the sitting id, or returns `null` when this press is not one.
   *
   * **`null` is a fact, not a gap**, and the schema says so: `sweep_id` is "NULL means this reading
   * was a single press… a default would claim membership of a sitting that does not exist"
   * (`docs/specs/probe-sweep/feature-spec.md:644`). This callback returned a string unconditionally
   * until M6-T4, so a single **Measure one thing** press stored an id, grouped as a sweep, and the
   * history told the operator their sitting held "1 of 4 readings — 3 were refused or never taken".
   * All three of those clauses were false, on the commonest press there is.
   *
   * Injected rather than decided here for the reason the resume needs: only the caller knows
   * whether this press continues a sitting, starts one, or is on its own. `plan.length` cannot
   * tell — a resume of one missing reading is a one-step plan inside a four-reading sitting.
   */
  readonly newSweepId: () => string | null;
  readonly runStep: (step: SweepStep) => Promise<ProbeOutcome>;
  /** Resolves on a stored row, rejects on a failed POST. Never throws out of the sweep. */
  readonly store: (body: ProbeResultBody) => Promise<unknown>;
  readonly onProgress: (state: SweepProgress) => void;
  readonly shouldStop: () => boolean;
  /** Defaults to the derived plan; a test supplies its own. */
  readonly plan?: readonly SweepStep[];
}

export interface SweepProgress {
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly step: SweepStep;
  readonly status: SweepStepStatus;
}

export async function runSweep(input: RunSweepInput): Promise<SweepOutcome> {
  const plan = input.plan ?? sweepPlan();
  const sweepId = input.newSweepId();
  const steps: SweepStepResult[] = [];
  let stopped = false;

  for (const [index, step] of plan.entries()) {
    // **Asked before the step, so a stop leaves the rest `not taken` rather than unexplained.**
    // "Not taken" and "refused" are two vocabularies and stay apart: a reading not taken is one
    // nobody tried, a refusal is one the machine declined. Collapsing them loses the difference
    // between "you stopped early" and "your tab was in the background".
    if (input.shouldStop()) {
      stopped = true;
      steps.push({ step, status: 'not taken', outcome: null, body: null, storeFailure: null });
      continue;
    }

    input.onProgress({ stepIndex: index, stepCount: plan.length, step, status: 'running' });
    const outcome = await input.runStep(step);

    // **A refusal does not end the sweep.** The machine declined THIS step — a tab hidden for a
    // moment, a clock reading implausibly — and the next scene may well be fine. Ending here would
    // spend the operator's two minutes and hand back one sentence.
    const body = toProbeBody(outcome, input.machineLabel);
    if (body === null) {
      const status: SweepStepStatus = outcome.kind === 'refused' ? 'refused' : 'not taken';
      steps.push({ step, status, outcome, body: null, storeFailure: null });
      input.onProgress({ stepIndex: index, stepCount: plan.length, step, status });
      if (outcome.kind === 'cancelled') stopped = true;
      continue;
    }

    // Recorded per step rather than at the end, which is the whole reason an interruption is cheap:
    // two minutes of measurement should not be lost because the operator closed the tab at 1:50.
    const withSweep: ProbeResultBody = { ...body, sweepId };
    let status: SweepStepStatus;
    let storeFailure: StoreFailure | null = null;
    try {
      await input.store(withSweep);
      status = 'recorded';
    } catch (error) {
      // **Never a throw out of the sweep.** A failed POST is per-step state: the figures are on
      // screen, steps 2–4 have no reason to be abandoned because step 1's write lost a connection.
      // Swallowed HERE and nowhere else — the panel renders the state.
      //
      // **The error is no longer discarded** (`docs/TECH_DEBT.md` #269). This was a bare `catch {}`,
      // and the comment above said "and retryable" — true of the case it was written for and false
      // of a 422, which will refuse the identical body every time. Losing the status here is what
      // left the panel with one sentence for every failure.
      status = 'not recorded';
      storeFailure = describeStoreFailure(error);
    }

    steps.push({ step, status, outcome, body: withSweep, storeFailure });
    input.onProgress({ stepIndex: index, stepCount: plan.length, step, status });

    // A cancellation that still kept limbs is recorded AND ends the sweep (ADR-0081 M3's rule:
    // the limb is the unit of durability, the press is not).
    if (outcome.kind === 'cancelled') stopped = true;
  }

  return { sweepId, size: input.size, steps, stopped };
}

/**
 * The steps that produced nothing and can only be had by measuring again.
 *
 * **`not recorded` is deliberately NOT one of them.** That step has its figures and a body; it
 * needs a POST, which **Retry recording** does in a fraction of a second. Re-measuring it would
 * spend twenty-five seconds to obtain numbers already on screen, and — because a second press
 * measures a second time — it would store a *different* reading under the same id while the
 * operator believed they were re-sending the one in front of them. The two affordances answer two
 * different failures and stay apart for the same reason `refused` and `not taken` do.
 *
 * `waiting` and `running` cannot appear on a finished sweep and are excluded by the same rule
 * rather than by assuming they cannot: nothing was measured, but nothing was attempted either.
 */
export function missingSteps(outcome: SweepOutcome): SweepStep[] {
  return outcome.steps
    .filter((step) => step.status === 'refused' || step.status === 'not taken')
    .map((step) => step.step);
}

/**
 * Fold a resumed press back into the sitting it belongs to.
 *
 * **A resume replaces steps; it never replaces the sitting.** The obvious implementation — set the
 * new outcome as the panel's state — would drop every reading the first press recorded from the
 * screen, so an operator who resumed two of four steps would be shown a two-step sitting and could
 * reasonably conclude the other two had been lost. They are in the database; only the screen would
 * have forgotten them.
 *
 * The prior's `sweepId` and `size` win because they define the sitting: a resume is a second press
 * inside the same act, which is precisely what `newSweepId: () => prior.sweepId` says at the call
 * site. `stopped` takes the RESUMED press's value, because it is a fact about the most recent press
 * and the prior's is spent — a sitting stopped and then completed is no longer a stopped sitting,
 * and the steps say so themselves.
 */
export function mergeResumed(prior: SweepOutcome, resumed: SweepOutcome): SweepOutcome {
  const byKey = new Map(resumed.steps.map((step) => [stepKey(step.step), step]));
  return {
    sweepId: prior.sweepId,
    size: prior.size,
    steps: prior.steps.map((step) => byKey.get(stepKey(step.step)) ?? step),
    stopped: resumed.stopped,
  };
}

/**
 * A step's identity — **one definition, used by the merge, the panel and the renderer.**
 *
 * Scenario and framing, which is what a step IS: the plan is derived from the registry
 * (`sweep-plan.ts`) and holds each pair exactly once, so this is a key rather than a heuristic.
 * Object identity would not do — a resumed plan is rebuilt from the prior outcome's steps, and even
 * where the references happen to survive, relying on that would make the merge fail silently the
 * first time a plan was reconstructed rather than carried.
 *
 * It lives here rather than in the panel because `mergeResumed` and the panel's retry set are now
 * two readers of one identity, and two spellings of it would agree until the day they did not —
 * the ADR-0065 `routeOrthogonal` argument, and the reason this file owns the orchestration at all.
 */
export function stepKey(step: SweepStep): string {
  return `${step.scenario.id}:${step.preset}`;
}
