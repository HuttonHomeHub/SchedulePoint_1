import type { ProbeResultBody } from '../api/probe-results';
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
}

export interface SweepOutcome {
  /** Minted once per press. Every step's rows carry it, which is what makes them one sitting. */
  readonly sweepId: string;
  readonly steps: readonly SweepStepResult[];
  /** True when the operator stopped it. Steps after the stop are `not taken`, never `refused`. */
  readonly stopped: boolean;
}

export interface RunSweepInput {
  readonly size: RunSize;
  readonly machineLabel: string | null;
  /** Mints the sitting id. Injected so a test can assert one id across four steps. */
  readonly newSweepId: () => string;
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
      steps.push({ step, status: 'not taken', outcome: null, body: null });
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
      steps.push({ step, status, outcome, body: null });
      input.onProgress({ stepIndex: index, stepCount: plan.length, step, status });
      if (outcome.kind === 'cancelled') stopped = true;
      continue;
    }

    // Recorded per step rather than at the end, which is the whole reason an interruption is cheap:
    // two minutes of measurement should not be lost because the operator closed the tab at 1:50.
    const withSweep: ProbeResultBody = { ...body, sweepId };
    let status: SweepStepStatus;
    try {
      await input.store(withSweep);
      status = 'recorded';
    } catch {
      // **Never a throw out of the sweep.** A failed POST is per-step state: the figures are on
      // screen and retryable, and steps 2–4 have no reason to be abandoned because step 1's write
      // lost a connection. Swallowed HERE and nowhere else — the panel renders the state.
      status = 'not recorded';
    }

    steps.push({ step, status, outcome, body: withSweep });
    input.onProgress({ stepIndex: index, stepCount: plan.length, step, status });

    // A cancellation that still kept limbs is recorded AND ends the sweep (ADR-0081 M3's rule:
    // the limb is the unit of durability, the press is not).
    if (outcome.kind === 'cancelled') stopped = true;
  }

  return { sweepId, steps, stopped };
}
