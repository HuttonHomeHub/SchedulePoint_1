import type { ProbeLimbBody, ProbeResultBody } from '../api/probe-results';
import type { LimbOutcome, ProbeOutcome } from '../runner/run-probe';

/**
 * Turn a finished run into the POST body — **or refuse to**.
 *
 * `null` for a refused run, and that refusal is why this is a pure function rather than an `if` in
 * the panel. A refusal means **nothing was measured**: there are no samples, the numbers that do
 * exist are placeholders, and storing a row would put a reading in the installation's history that
 * no machine ever produced. The panel's test asserts it with a spy on the client rather than by
 * reading the code, because "we do not call it" is exactly the kind of claim that stays true right
 * up until somebody moves the call.
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
  if (outcome.kind === 'refused') return null;

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
    limbs: outcome.limbs.map(toLimb),
  };
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
