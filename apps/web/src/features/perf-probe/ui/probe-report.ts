import type { Verdict } from '../model/judge';
import { verdictLabel, verdictNote } from '../model/verdict-copy';
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
  if (outcome.kind === 'cancelled') {
    return [
      'SchedulePoint performance probe — RUN CANCELLED',
      '',
      'You stopped this run, so it was not completed and nothing was recorded.',
      'This is NOT a pass and NOT a failure.',
      ...(outcome.context ? ['', ...contextLines(outcome.context)] : []),
    ].join('\n');
  }

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

/** Repeats behind a limb's figures — a difference limb counts pairs, an absolute one counts runs. */
function repeatsOf(limb: LimbOutcome): number {
  return (limb.recording.pairs ?? limb.recording.runs ?? []).length;
}

/** The verdict line and its sentence, so no verdict ever prints bare. */
function verdictLines(limb: LimbOutcome, verdict: Verdict, indeterminateReason?: string): string[] {
  const note = verdictNote(verdict, {
    gated: limb.recording.thresholds.gated === true,
    repeats: repeatsOf(limb),
    indeterminateReason,
  });
  return [`  VERDICT: ${verdictLabel(verdict)}`, ...(note === null ? [] : [`  because ${note}`])];
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
      ...verdictLines(limb, r.verdict, r.indeterminateReason),
    ];
  }

  const r = limb.result.judged;
  return [
    ...head,
    // The non-vacuity evidence, printed on a PASS and not only on a refusal. `judgeRun` throws
    // before it judges, so a verdict here already implies the floors were met — but the block is
    // the deliverable, and a reader a month later should not have to know that to audit it. The
    // CLI has always printed this line (`measure-revision-diff.mjs:177-180`) and `m0-condition.md`'s
    // N condition requires it; only this rendering dropped it.
    ...changedOnScreenLine(limb),
    `  baseline   ${r.baselineMeanPp.toFixed(2)} pp   (run-to-run spread ${r.baselineSpreadPp.toFixed(2)} pp)`,
    `  treatment  ${r.treatmentMeanPp.toFixed(2)} pp   ${r.treatmentFps.toFixed(1)} fps`,
    `  delta      ${r.deltaPp >= 0 ? '+' : ''}${r.deltaPp.toFixed(2)} pp`,
    ...verdictLines(limb, r.verdict, r.indeterminateReason),
  ];
}

/**
 * `N/M bars (x%), N/M links (y%)` — the numerators the non-vacuity floors are actually about.
 *
 * Returns no line at all when the counts are absent rather than printing zeros: a zero here is a
 * claim that nothing changed on screen, and an absent count is a claim about the recording. The
 * head line's `visibleBars` answers a different question (ADR-0066's cull), which is why both are
 * printed and neither substitutes for the other.
 */
function changedOnScreenLine(limb: LimbOutcome): readonly string[] {
  const c = limb.recording.counts;
  const { visibleChangedBars, visibleBars, visibleChangedLinks, visibleLinks } = c;
  if (
    visibleChangedBars === undefined ||
    visibleBars === undefined ||
    visibleChangedLinks === undefined ||
    visibleLinks === undefined
  ) {
    return [];
  }
  const pct = (n: number, d: number): string => (d === 0 ? '0.0' : ((n / d) * 100).toFixed(1));
  return [
    `  changed    ${String(visibleChangedBars)}/${String(visibleBars)} bars ` +
      `(${pct(visibleChangedBars, visibleBars)}%), ` +
      `${String(visibleChangedLinks)}/${String(visibleLinks)} links ` +
      `(${pct(visibleChangedLinks, visibleLinks)}%)`,
  ];
}
