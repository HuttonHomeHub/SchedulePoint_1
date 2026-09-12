import type { Verdict } from '../model/judge';
import {
  NOT_RECORDED,
  SITTING_SPREAD_LIMIT_MS,
  describeSpread,
  sittingFromOutcome,
  sittingSpreadMs,
  type Sitting,
  type SittingLimb,
} from '../model/sitting';
import { verdictLabel, verdictNote } from '../model/verdict-copy';
import type { ProbeOutcome } from '../runner/run-probe';

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
export function formatProbeReport(
  outcome: ProbeOutcome,
  machineLabel: string | null = null,
): string {
  const sitting = sittingFromOutcome(outcome, machineLabel);
  if (sitting === null) {
    // No context at all — a refusal that never got as far as reading the machine. The block still
    // says what happened rather than returning empty, because an empty clipboard is the one
    // outcome a reader cannot distinguish from a broken button.
    return outcome.kind === 'refused'
      ? [
          'SchedulePoint performance probe — RUN REFUSED',
          '',
          `  reason   ${outcome.refusal.reason}`,
          `  ${outcome.refusal.sentence}`,
          '',
          'No measurement was taken. This is NOT a pass and NOT a failure.',
        ].join('\n')
      : [
          'SchedulePoint performance probe — RUN CANCELLED',
          '',
          'You stopped this run, so it was not completed and nothing was recorded.',
          'This is NOT a pass and NOT a failure.',
        ].join('\n');
  }
  return formatSitting(sitting);
}

/**
 * The block, from the one presentation model.
 *
 * **`formatProbeReport` is kept as a thin adapter over this**, deliberately: `probe-report.test.ts`
 * is the before/after oracle for the whole re-pointing (M2-T3) and its assertions do not change, so
 * it goes on calling the function it always called, with the outcomes it always passed. A formatter
 * whose own suite had to be rewritten alongside it would prove nothing about the move.
 */
export function formatSitting(sitting: Sitting): string {
  if (sitting.outcome === 'cancelled') {
    // **The kept limbs are printed.** A stopped press keeps every limb that finished (M3), so a
    // block that stopped at the context would hand the operator a sentence about readings it then
    // refused to show them — and the Copy button sits outside this branch, so it is reachable
    // exactly when there is something to copy.
    const kept = sitting.limbs.length;
    return [
      'SchedulePoint performance probe — RUN STOPPED',
      '',
      kept === 0
        ? 'You stopped this run before anything finished, so nothing was measured and nothing was recorded.'
        : `You stopped this run. ${kept === 1 ? 'One reading' : `${String(kept)} readings`} had already finished and ${kept === 1 ? 'was' : 'were'} kept; the rest were not taken.`,
      'This is NOT a pass and NOT a failure.',
      '',
      ...contextLines(sitting),
      ...(kept === 0 ? [] : ['', ...sitting.limbs.flatMap((limb) => [...limbLines(limb), ''])]),
    ]
      .join('\n')
      .trimEnd();
  }

  if (sitting.outcome === 'refused') {
    return [
      'SchedulePoint performance probe — RUN REFUSED',
      '',
      `  reason   ${sitting.refusal?.reason ?? NOT_RECORDED}`,
      `  ${sitting.refusal?.sentence ?? ''}`,
      '',
      'No measurement was taken. This is NOT a pass and NOT a failure.',
      '',
      ...contextLines(sitting),
    ].join('\n');
  }

  return [
    'SchedulePoint performance probe',
    '',
    ...contextLines(sitting),
    '',
    ...sitting.limbs.flatMap((limb) => [...limbLines(limb), '']),
  ]
    .join('\n')
    .trimEnd();
}

function contextLines(sitting: Sitting): string[] {
  const context = sitting.context;
  // **Computed from the readings rather than declared on the context**, because it is a fact about
  // the set and not about the machine — and because it must be absent, not zero, when there is only
  // one reading to time.
  const spread = sittingSpreadMs(sitting);
  return [
    // **Scenario, framing and protocol are NOT here**, and their absence is the point. A sitting is
    // up to four presses under one `sweep_id`, so those three differ from reading to reading; they
    // print on each reading's own block below. Leaving them here would have labelled a whole
    // sitting with whichever reading sorted first, and nothing in the block would look wrong.
    // **`varies` rather than one reading's figure**, when a sitting holds readings taken at more
    // than one canvas. #261 measures 35.2 fps at 1912x948 against 32.2 fps at 1920x1080 INSIDE one
    // sitting, so stating one of two here would settle by accident the confound this line exists to
    // expose. Each reading prints its own below. (This cited that row's 23.3-against-39.5 pair until
    // 2026-09-12; #261 withdrew it as contaminated by machine state rather than size. The surviving
    // figure is smaller and still decides nothing by itself, which is the whole point of `varies`.)
    `  viewport   ${
      context.viewport === null
        ? 'varies between readings — see each below'
        : `${String(context.viewport.width)}x${String(context.viewport.height)} css px`
    }, dpr ${String(context.devicePixelRatio)}`,
    `  display    idle frame interval ${context.idleInterval.toFixed(2)} ms`,
    // A masked adapter is printed AS masked. Writing "unknown GPU" would put a fiction in the one
    // field a reader trusts to explain an outlier (the product owner's Q1, answered 2026-09-07).
    // A STORED row has one nullable column and cannot tell masked from unavailable, so it says
    // neither — `gpuMasked` is null there and the neutral marker is the honest rendering.
    `  gpu        ${context.gpu ?? (context.gpuMasked === null ? NOT_RECORDED : context.gpuMasked ? '(withheld by the browser)' : '(not available)')}`,
    `  threads    ${context.hardwareConcurrency === null ? '(not reported)' : String(context.hardwareConcurrency)}`,
    `  memory     ${context.deviceMemoryGb === null ? '(not reported)' : `~${String(context.deviceMemoryGb)} GiB`}`,
    // Both recorded rather than acted on, and both explain an outlier nothing else would. A blur
    // is NOT a refusal — the window kept painting, something else took the keyboard — so it has to
    // be visible here or the fact is captured and never read.
    // A disjunction over the sitting, and each reading repeats its own below. A blur is NOT a
    // refusal — the window kept painting, something else took the keyboard — so a sweep can hold
    // three clean readings and one suspect, and only saying "held throughout" because the first
    // one was clean is the falsehood this line used to be capable of.
    `  attention  ${context.anyReadingLostFocus ? 'the window lost focus during the run' : 'held throughout'}`,
    `  motion     ${context.prefersReducedMotion ? 'reader prefers reduced motion' : 'no preference'}`,
    `  agent      ${context.userAgent}`,
    `  at         ${context.startedAt}`,
    // **Printed only when it is news.** Every ordinary sitting spans minutes, and a line saying so
    // on all of them would be read past; this fires for the case M6-T4 creates — a reading re-run
    // under the same `sweep_id`, hours or days later — where the facts above were recorded with the
    // earliest reading and the block would otherwise present them as true of all of them.
    ...(spread !== null && spread > SITTING_SPREAD_LIMIT_MS
      ? [`  spread     readings taken ${describeSpread(spread)} apart — NOT one sitting in time`]
      : []),
    `  web        ${context.appVersion}`,
    // Carried where it exists rather than dropped to make the two adapters look symmetrical: the
    // browser does not learn it until the POST returns, and the block is copyable before that.
    // A reading taken across a deploy is one a reader should be able to spot.
    ...(context.apiVersion === null ? [] : [`  api        ${context.apiVersion}`]),
    ...(context.machineLabel === null ? [] : [`  machine    ${context.machineLabel}`]),
  ];
}

/** The verdict line and its sentence, so no verdict ever prints bare. */
function verdictLines(
  limb: SittingLimb,
  verdict: Verdict,
  indeterminateReason?: string,
  saturated?: boolean,
): string[] {
  const note = verdictNote(verdict, {
    gated: limb.gated,
    repeats: limb.repeats,
    indeterminateReason,
    saturated,
  });
  return [`  VERDICT: ${verdictLabel(verdict)}`, ...(note === null ? [] : [`  because ${note}`])];
}

function limbLines(limb: SittingLimb): string[] {
  const head = [
    `  ── ${limb.limbLabel} ──`,
    // **The same three labels the sitting header used to carry, relocated rather than renamed.**
    // Spec §4.6 keeps this file's line vocabulary and its own suite is the before/after oracle; a
    // sitting spanning four presses makes these three per-reading facts, so they move down here and
    // keep their words. A reader who greps a stored block for `framing` still finds it.
    `  scenario   ${limb.scenarioLabel} (${limb.scenarioId})`,
    `  framing    ${limb.preset}`,
    // **`(not recorded)` rather than the default**, on a reading stored before `frames_per_phase`
    // existed and for the size, which is still not a column. The default is exactly what a reader
    // would otherwise assume and exactly what a non-default run would contradict.
    `  run size   ${limb.size ?? NOT_RECORDED} — ${limb.frames === null ? NOT_RECORDED : `${String(limb.frames)} frames`} x ${String(limb.repeats)}`,
    ...(limb.recordedAt === null ? [] : [`  taken      ${limb.recordedAt}`]),
    `  viewport   ${String(limb.viewport.width)}x${String(limb.viewport.height)} css px`,
    // Repeated per reading rather than only summarised on the sitting: the sitting says whether
    // ANY reading lost the window, and this is the one that says which.
    ...(limb.lostFocusDuringRun ? ['  attention  this reading lost focus'] : []),
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
    // The caveat rides ON the delta line, not only after the verdict three lines down. #260's
    // defect is a figure that reads as "the overlay is free"; a reader who takes the number and
    // stops is exactly the reader who needs telling, and they never reach the verdict block.
    `  delta      ${r.deltaPp >= 0 ? '+' : ''}${r.deltaPp.toFixed(2)} pp` +
      (r.saturated
        ? `   [CEILING: only ${r.headroomPp.toFixed(2)} pp of headroom — see VERDICT]`
        : ''),
    ...verdictLines(limb, r.verdict, r.indeterminateReason, r.saturated),
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
function changedOnScreenLine(limb: SittingLimb): readonly string[] {
  const c = limb.counts;
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
