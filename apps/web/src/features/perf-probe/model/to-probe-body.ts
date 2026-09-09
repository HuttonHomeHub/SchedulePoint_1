import type { ProbeLimbBody, ProbeResultBody } from '../api/probe-results';
import type { LimbOutcome, ProbeOutcome } from '../runner/run-probe';

/**
 * Turn a finished run into the POST body — **or refuse to**.
 *
 * `null` for a run that was refused or cancelled, and that refusal is why this is a pure function
 * rather than an `if` in the panel. A refusal means **nothing was measured**: there are no samples,
 * the numbers that do exist are placeholders, and storing a row would put a reading in the
 * installation's history that no machine ever produced. A cancellation means only part of it was
 * measured, which is the same problem wearing different clothes. The panel's test asserts both with
 * a spy on the client rather than by reading the code, because "we do not call it" is exactly the
 * kind of claim that stays true right up until somebody moves the call.
 *
 * **An unjudgeable limb IS stored, and that is a different case.** The judge declining to produce a
 * verdict is a statement about the verdict; the numbers behind it are real measurements, and the
 * server does not judge anyway (spec D5) — it stores samples and the thresholds beside them, and
 * the verdict is derived on read.
 *
 * Pure: no clock, no clipboard, no network, no `window`. Every value comes from the run or from the
 * one field the operator typed.
 */
export function toProbeBody(
  outcome: ProbeOutcome,
  /** The operator's own note. `null` means not typed — distinct from an empty string. */
  machineLabel: string | null,
): ProbeResultBody | null {
  // A refusal stores nothing: there are no samples, the numbers that do exist are placeholders, and
  // a row would put a reading in the installation's history that no machine ever produced.
  //
  // **A cancellation stores the limbs that finished.** That is the M3 change and it is narrower
  // than it sounds: the runners drop an interrupted limb rather than truncating it, so what arrives
  // here has collected every repeat and is a complete reading in every respect except that the
  // operator did not wait for the next one. Discarding it was throwing away three full repeats of a
  // 500-activity scale because a two-limb press was stopped during its second half.
  //
  // A cancelled press with nothing finished still stores nothing, and that falls out of the same
  // rule rather than needing a branch of its own.
  if (!recordsAnything(outcome)) return null;
  if (outcome.context === null) return null;

  const { context } = outcome;
  const device = context.device;

  return {
    scenarioId: context.scenarioId,
    scenarioVersion: context.scenarioVersion,
    preset: context.preset,
    viewportWidth: context.viewport.width,
    viewportHeight: context.viewport.height,
    devicePixelRatio: device.devicePixelRatio,
    idleIntervalMs: context.idleInterval,
    // A masked or unreported fact is sent as `null`, never omitted into a default and never
    // guessed: NULL means "not captured", and the column exists to keep that distinguishable from
    // a value. Writing "unknown GPU" would put a fiction in the one field a reader trusts to
    // explain an outlier.
    hardwareConcurrency: device.hardwareConcurrency,
    deviceMemoryGb: device.deviceMemoryGb,
    gpuRenderer: device.gpu,
    userAgent: device.userAgent,
    reducedMotion: device.prefersReducedMotion,
    lostFocusDuringRun: context.lostFocusDuringRun,
    machineLabel,
    appVersion: context.appVersion,
    // The protocol this reading ran at, taken from the run's own context. NOT inferred from
    // `samples.length`: that would derive a stored fact from a client-side constant, and a reading
    // whose protocol is unknown should say so rather than be given a plausible one.
    framesPerPhase: context.frames,
    limbs: outcome.limbs.map(toLimb),
  };
}

/**
 * Whether this outcome produces a row at all — **the one place that rule lives.**
 *
 * Exported because the panel asks the same question twice, to decide whether to say a reading was
 * recorded and whether to offer Retry. Before M3 both asked `kind === 'measured'`, which was the
 * same question spelt differently — and when a cancellation began producing a row, the store
 * happened and the screen said nothing about it. The flag-on journey found that on its first run
 * with the path exercised; no unit test could, because each of the three sites was correct in
 * isolation and the disagreement lived only between them (the ADR-0093 shape).
 */
export function recordsAnything(
  outcome: ProbeOutcome,
): outcome is Extract<ProbeOutcome, { kind: 'measured' | 'cancelled' }> {
  // A **type predicate**, so the compiler carries the rule as far as the caller does. Returning a
  // bare boolean left `toProbeBody` reaching for `outcome.limbs` on a union that still included
  // `refused`, and the honest options there are a cast or a second check — one of which lies and
  // the other of which is the duplication this function exists to remove.
  if (outcome.kind === 'refused') return false;
  if (outcome.kind === 'cancelled' && outcome.limbs.length === 0) return false;
  return true;
}

function toLimb(limb: LimbOutcome): ProbeLimbBody {
  const recording = limb.recording;
  return {
    limbId: limb.limbId,
    limbKind: recording.limbKind,
    pxPerDay: limb.pxPerDay,
    activityCount: recording.activityCount,
    edgeCount: recording.edgeCount,
    sceneSummary: limb.sceneSummary,
    counts: recording.counts,
    thresholds: recording.thresholds,
    // Exactly one array, and it is the one the kind names — the same rule the server states as a
    // validator, because sending both is a 422 and sending neither trips a database CHECK.
    ...(recording.limbKind === 'difference'
      ? { pairs: recording.pairs ?? [] }
      : { runs: recording.runs ?? [] }),
  };
}
