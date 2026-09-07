import type { LimbOutcome, ProbeOutcome, RunContext } from '../runner/run-probe';

/**
 * The paste-ready block a **Copy** button produces.
 *
 * **This is the deliverable, not the panel.** A number that stays on one operator's screen answers
 * nothing: `docs/TECH_DEBT.md` #75's single real-hardware reading is useful a month later only
 * because somebody wrote down the machine, the framing and the adapter alongside it. So the block
 * carries everything needed to argue with it — and in particular it carries the **refusals** and
 * the **visible-bar counts**, which are the two things a summary is most tempted to drop and the
 * two that decide whether the figures mean anything.
 *
 * Pure: no clipboard, no DOM, no clock beyond what the run already recorded. That is what lets
 * every line below be asserted from a literal.
 */
export function formatProbeReport(outcome: ProbeOutcome): string {
  if (outcome.kind === 'refused') {
    return [
      'SchedulePoint performance probe — RUN REFUSED',
      '',
      `  reason   ${outcome.refusal.reason}`,
      `  ${outcome.refusal.sentence}`,
      '',
      'No measurement was taken. This is NOT a pass and NOT a failure.',
      ...(outcome.context ? ['', ...contextLines(outcome.context)] : []),
    ].join('\n');
  }

  return [
    'SchedulePoint performance probe',
    '',
    ...contextLines(outcome.context),
    '',
    ...outcome.limbs.flatMap((limb) => [...limbLines(limb), '']),
  ]
    .join('\n')
    .trimEnd();
}

function contextLines(context: RunContext): string[] {
  const d = context.device;
  return [
    `  scenario   ${context.scenarioLabel} (${context.scenarioId})`,
    `  framing    ${context.preset}`,
    `  run size   ${context.size} — ${String(context.frames)} frames x ${String(context.repeats)}`,
    `  viewport   ${String(context.viewport.width)}x${String(context.viewport.height)} css px, dpr ${String(d.devicePixelRatio)}`,
    `  display    idle frame interval ${context.idleInterval.toFixed(2)} ms`,
    // A masked adapter is printed AS masked. Writing "unknown GPU" would put a fiction in the one
    // field a reader trusts to explain an outlier (the product owner's Q1, answered 2026-09-07).
    `  gpu        ${d.gpu ?? (d.gpuMasked ? '(withheld by the browser)' : '(not available)')}`,
    `  threads    ${d.hardwareConcurrency === null ? '(not reported)' : String(d.hardwareConcurrency)}`,
    `  memory     ${d.deviceMemoryGb === null ? '(not reported)' : `~${String(d.deviceMemoryGb)} GiB`}`,
    // Both recorded rather than acted on, and both explain an outlier nothing else would. A blur
    // is NOT a refusal — the window kept painting, something else took the keyboard — so it has to
    // be visible here or the fact is captured and never read.
    `  attention  ${context.lostFocusDuringRun ? 'the window lost focus during the run' : 'held throughout'}`,
    `  motion     ${d.prefersReducedMotion ? 'reader prefers reduced motion' : 'no preference'}`,
    `  agent      ${d.userAgent}`,
    `  at         ${context.startedAt}`,
    `  web        ${context.appVersion}`,
  ];
}

function limbLines(limb: LimbOutcome): string[] {
  const head = [
    `  ── ${limb.limbLabel} ──`,
    `  scene      ${limb.sceneSummary}`,
    // Reported on every limb, never only when it fails. A reading taken on an almost-empty canvas
    // is a reading about the cull, and ADR-0066 records that looking exactly like a good result.
    `  on screen  ${String(limb.visibleBars)} bars at ${limb.pxPerDay.toFixed(2)} px/day`,
    `  floor      ${String(limb.minFps)} fps — ${limb.source}`,
  ];

  if (limb.result.kind === 'unjudgeable') {
    return [
      ...head,
      '  RESULT: CANNOT BE JUDGED',
      ...limb.result.message.split('\n').map((l) => `  ${l}`),
    ];
  }

  if (limb.result.kind === 'absolute') {
    const r = limb.result.judged;
    return [
      ...head,
      `  fps        mean ${r.meanFps.toFixed(1)} (slowest ${r.slowestRunFps.toFixed(1)}, fastest ${r.fastestRunFps.toFixed(1)})`,
      `  dropped    ${r.meanDroppedPct.toFixed(2)} pp   worst p95 ${r.worstIntervalP95.toFixed(2)} ms`,
      `  VERDICT: ${r.verdict}`,
      ...(r.indeterminateReason ? [`  because ${r.indeterminateReason}`] : []),
    ];
  }

  const r = limb.result.judged;
  return [
    ...head,
    `  baseline   ${r.baselineMeanPp.toFixed(2)} pp   (run-to-run spread ${r.baselineSpreadPp.toFixed(2)} pp)`,
    `  treatment  ${r.treatmentMeanPp.toFixed(2)} pp   ${r.treatmentFps.toFixed(1)} fps`,
    `  delta      ${r.deltaPp >= 0 ? '+' : ''}${r.deltaPp.toFixed(2)} pp`,
    `  VERDICT: ${r.verdict}`,
    ...(r.indeterminateReason ? [`  because ${r.indeterminateReason}`] : []),
  ];
}
