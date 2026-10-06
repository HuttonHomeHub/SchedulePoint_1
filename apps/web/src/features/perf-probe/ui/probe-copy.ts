import { isGated, type ScenarioDefinition, type ScenarioPreset } from '../model/scenarios';
import type { ProbeOutcome, RunSize } from '../runner/run-probe';
import type { SweepOutcome } from '../sweep/run-sweep';
import { describeDuration, estimateSweepSeconds } from '../sweep/sweep-duration';
import { sweepPlan, type SweepStep } from '../sweep/sweep-plan';

/**
 * Which control opened the confirmation.
 *
 * **Three kinds rather than one dialog with a boolean**, because each control makes a different
 * promise: a sweep covers the screen for about two minutes and produces four readings, a check
 * takes seconds and produces none that can be graded, and a single measurement is whatever the
 * three selects say. A dialog that named the wrong duration would be worse than none — the number
 * is the operator's basis for deciding whether to start something that asks them to leave the
 * machine alone.
 */
export type ConfirmKind = 'sweep' | 'check' | 'one' | 'missing';

/** `Step 2 of 4 · Canvas draw budget · whole plan` — what the overlay says it is doing. */
export function stepLabel(plan: readonly SweepStep[], step: SweepStep): string {
  const index = plan.findIndex(
    (s) => s.scenario.id === step.scenario.id && s.preset === step.preset,
  );
  const position = index === -1 ? '' : `Step ${String(index + 1)} of ${String(plan.length)} · `;
  return `${position}${step.scenario.label} · ${step.preset === 'fit' ? 'whole plan' : 'week'}`;
}

/**
 * What each control promises before it takes the screen.
 *
 * **Pure and exported, so the copy is assertable from literals** rather than only reachable by
 * driving a dialog — and so the three confirmations cannot drift into three different accounts of
 * the same three facts (how long, that the motion IS the measurement, what Stop keeps).
 */
export function confirmationCopy(
  kind: ConfirmKind | null,
  one: { scenario: ScenarioDefinition; preset: ScenarioPreset; size: RunSize },
  /**
   * What a resume would re-measure — **passed in rather than derived**, because it is a fact about
   * one sitting on screen and not about the registry. The other three kinds can be described from
   * `sweepPlan()` alone; this one cannot, and defaulting it would let the dialog promise a shape it
   * is not about to run.
   */
  missing: { plan: readonly SweepStep[]; size: RunSize } | null = null,
): string {
  const motion =
    'It covers the screen with a moving diagram — that movement IS the measurement, so it is not ' +
    'reduced or stilled for a reduced-motion setting. Keep this tab in front and leave the machine ' +
    'alone: a backgrounded tab is throttled by the browser, and a run will say so rather than ' +
    'reporting a number.';
  const stop = 'Stop ends it at the next repeat and keeps every reading that has already finished.';

  if (kind === 'sweep') {
    const plan = sweepPlan();
    return (
      `This takes ${describeDuration(estimateSweepSeconds(plan, 'full'))} and produces ` +
      `${String(plan.length)} readings — every measurement at both framings. ${motion} ${stop} ` +
      'Half the readings are ungraded by design: the whole-plan framing is measured and never ' +
      'given a pass or a fail, because the diagram is already known to drop frames there.'
    );
  }

  if (kind === 'check') {
    const plan = sweepPlan();
    return (
      `This takes ${describeDuration(estimateSweepSeconds(plan, 'quick'))} and answers one ` +
      'question: does the probe work on this machine? Every reading runs once, so none of them ' +
      // **Stop is named here too**, and it was the only one of the four that left it out (M7 ux
      // review). The overlay and its Stop button render identically for a check, and a check can
      // keep a completed limb exactly like a full run — so the one control whose confirmation said
      // nothing about leaving was the one an operator is likeliest to be trying out.
      `can be graded — there is no run-to-run spread to judge against. ${motion} ${stop}`
    );
  }

  if (kind === 'missing') {
    // No plan means nothing is missing, and the control that opens this dialog is not rendered in
    // that state. Said rather than assumed: a promise about "0 readings" is the shape of sentence
    // this epic exists to remove, and it costs one branch to make it unreachable.
    if (missing === null || missing.plan.length === 0) {
      return 'There are no missing readings to take.';
    }
    const count = missing.plan.length;
    return (
      `This takes ${describeDuration(estimateSweepSeconds(missing.plan, missing.size))} and takes ` +
      `the ${count === 1 ? 'one reading' : `${String(count)} readings`} that ` +
      `${count === 1 ? 'was' : 'were'} refused or never taken. ${motion} ${stop} ` +
      // **The honest cost of joining the sitting, stated before it is paid.** The readings are
      // stored under the SAME sitting id, which is what makes them one act — and time has passed
      // since the others, on a machine that may since have been moved, resized or rebooted. The
      // block flags a spread beyond an hour for the same reason; warning here is what lets an
      // operator decide to start a fresh sitting instead.
      'They join the sitting above rather than starting a new one, so it will hold readings taken ' +
      'minutes or days apart — comparable only if this machine and this window are as they were.'
    );
  }

  const seconds = estimateSweepSeconds([{ scenario: one.scenario, preset: one.preset }], one.size);
  const ungraded =
    one.size === 'quick'
      ? ' It runs once, so there is no run-to-run spread to grade against — it reports its figures and stops.'
      : isGated(one.scenario, one.preset)
        ? ''
        : ' This framing is measured but never graded — the diagram is already known to drop frames at the whole-plan zoom, so it will report its figures without a pass or a fail.';
  return `This takes ${describeDuration(seconds)}. ${motion} ${stop}${ungraded}`;
}

/**
 * One sentence for the live region.
 *
 * **A refusal is never phrased as a result.** The whole point of the fourth verdict is that a
 * reader can tell "this machine says no" from "this machine cannot say", and a status line that
 * flattened them would undo it in the one channel a screen-reader user has.
 */
/**
 * What a sitting came to, in one sentence.
 *
 * **One function, both consumers** — the visible copy and the live region read the same string, so
 * they cannot say different things about one press. That is the rule `docs/TECH_DEBT.md` #259
 * item 10 exists because of, applied at the point where it is cheap.
 *
 * It counts what the steps say rather than what the last mutation flag says: a sweep writes four
 * times, so one `isError` is a fact about the fourth write and nothing about the other three.
 */
/**
 * The sentence a finished sitting is announced with: what was measured, and whether it is kept.
 *
 * **The recording state is part of it**, and it was not: "recorded" rendered as a plain `<p>` with
 * no role, so a successful store — a row now exists in the installation's history — was completely
 * silent to assistive technology, while its failure was announced loudly by an `Alert`. WCAG 4.1.3,
 * found by the M5 accessibility review. The asymmetry is the defect: a reader heard the bad news
 * and never the good, on a screen whose whole purpose is saying what the state is now.
 *
 * Counted from the steps rather than from one mutation's flags: a sweep POSTs four times, so
 * `record.isError` is a fact about the LAST write and says nothing about the other three.
 */
export function verdictFor(outcome: SweepOutcome): string {
  const recorded = outcome.steps.filter((step) => step.status === 'recorded').length;
  const unrecorded = outcome.steps.filter((step) => step.status === 'not recorded').length;
  const recording =
    unrecorded > 0
      ? ` ${String(unrecorded)} of ${String(outcome.steps.length)} were NOT recorded — the figures are still on screen.`
      : recorded > 0
        ? ` Recorded in this installation’s history.`
        : '';
  return `${summariseSweep(outcome)}${recording}`;
}

export function summariseSweep(outcome: SweepOutcome): string {
  const counts = {
    recorded: outcome.steps.filter((s) => s.status === 'recorded').length,
    notRecorded: outcome.steps.filter((s) => s.status === 'not recorded').length,
    refused: outcome.steps.filter((s) => s.status === 'refused').length,
    notTaken: outcome.steps.filter((s) => s.status === 'not taken').length,
  };

  // A one-step sitting says what it always said: a reader who pressed "Measure one thing" should
  // not be handed the vocabulary of a sweep.
  if (outcome.steps.length === 1) {
    const only = outcome.steps[0];
    return only?.outcome ? summarise(only.outcome) : 'Nothing was measured.';
  }

  const parts: string[] = [];
  if (counts.recorded > 0) parts.push(`${String(counts.recorded)} measured`);
  // **"Not taken" and "refused" stay apart here too**, because this sentence is where a reader
  // meets them: one means nobody tried, the other means the machine declined.
  if (counts.refused > 0) parts.push(`${String(counts.refused)} refused`);
  if (counts.notTaken > 0) parts.push(`${String(counts.notTaken)} not taken`);
  if (counts.notRecorded > 0) parts.push(`${String(counts.notRecorded)} measured but not recorded`);

  const lead = outcome.stopped ? 'You stopped this sitting.' : 'Sitting finished.';
  return parts.length === 0 ? lead : `${lead} ${parts.join(', ')}.`;
}

function summarise(outcome: ProbeOutcome): string {
  if (outcome.kind === 'cancelled') {
    // **The same sentence the visible copy uses, not a second wording of it.** Before M3 both said
    // "nothing was recorded" and were right; after it, a live region still saying so while the
    // screen says two readings were kept would be false in the one channel a screen-reader user
    // has — the one-correct-pattern-applied-to-a-control-and-not-its-neighbour shape this register
    // records six times over, and the M3-T2 risk names it in advance.
    return cancelledSentence(outcome.limbs.length);
  }
  if (outcome.kind === 'refused') {
    return `The run was refused and nothing was measured. ${outcome.refusal.sentence}`;
  }
  const verdicts = outcome.limbs.map((limb) =>
    limb.result.kind === 'unjudgeable' ? 'CANNOT BE JUDGED' : limb.result.judged.verdict,
  );
  return `Measurement finished. ${verdicts.join(', ')}.`;
}

/**
 * What a stopped run kept, and what it did not get to.
 *
 * The count is of **completed** readings — the runners drop an interrupted limb rather than
 * truncating it, so a number here is never a partial measurement dressed as a whole one. Singular
 * and plural are separate strings rather than a bare "1 reading(s)", because this is the sentence a
 * reader meets at the moment they are least sure what just happened.
 */
export function cancelledSentence(kept: number): string {
  if (kept === 0) {
    return 'You stopped this run before anything finished, so nothing was measured and nothing was recorded.';
  }
  if (kept === 1) {
    return 'You stopped this run. One reading had already finished and was kept; the rest were not taken.';
  }
  return `You stopped this run. ${String(kept)} readings had already finished and were kept; the rest were not taken.`;
}

/**
 * What the Performance box says about itself, folded and open (ADR-0178 D-3, spec §4.9).
 *
 * It lives here and not in the staff console's `panel-copy.ts` because `features/perf-probe` may not
 * import `features/staff` (`no-staff-import.structural.test.ts`); the wording is the console's
 * all the same, and `copy.structural.test.ts` reads this file for the same three forbidden shapes.
 */
export const PERFORMANCE_COPY = {
  /** The first line, folded or open: what the box is for, in one sentence. */
  summary: 'Measures how quickly this browser draws a schedule.',
  /** Under the open box: why the result depends on the computer in front of you. */
  intro:
    'Measurements are taken on this computer, not the server, so results depend on the machine you use.',
  open: 'Open performance tools',
  hide: 'Hide performance tools',
  /** Why Hide is shaded while a run covers the screen. */
  hideBlocked: 'A measurement is running.',
  /** The summary line while the history read has not answered. */
  readingPending: 'Checking for earlier readings…',
  readingFailed: 'Earlier readings could not be loaded.',
} as const;
