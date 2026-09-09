import type { ProbeResultRow } from '../api/probe-results';
import type { LimbOutcome, ProbeOutcome } from '../runner/run-probe';

import { storedJudgedResult } from './judge-stored';
import { SCENARIOS } from './scenarios';

/**
 * One sitting — the readings from one press, in the shape both the screen and the copied block read.
 *
 * **Why this exists.** `formatProbeReport` took a live `ProbeOutcome`, so the paste-ready block —
 * which `docs/TECH_DEBT.md` #75 calls the deliverable, and which is the artefact anybody actually
 * quotes — could be produced only in the seconds after a run and never again. A reader coming back
 * to a stored reading had a nine-column table and no way to get the block, which is #75's founding
 * failure in miniature: a measurement unreachable by the person who needs it.
 *
 * **The load-bearing rule is that a field a stored row cannot supply is `null`, never a guess and
 * never an omission.** Two of them are real and both are named below. `null` prints as an explicit
 * "(not recorded)" marker, so a reader can tell "this run did not record that" from "this run
 * recorded it and the renderer dropped it" — the distinction this whole milestone is about, and the
 * one a defaulted `0` or a silently missing line destroys.
 *
 * Pure: no clock, no DOM, no network. Every value comes from the run or from the stored row.
 */

/** What a stored row cannot supply, stated once so both the adapter and the formatter agree. */
export const NOT_RECORDED = '(not recorded)';

export interface SittingContext {
  readonly scenarioId: string;
  readonly scenarioLabel: string;
  readonly preset: string;
  /**
   * The run length as the operator chose it, and the frame budget behind it.
   *
   * **`null` on a stored reading, and that is a real gap rather than an oversight**: neither the
   * size nor the frame count is a column on `perf_probe_results` — only `samples.length` survives,
   * which is the repeats. M4 adds `frames_per_phase` and closes half of it. Until then a stored
   * block says so rather than inventing the default, because the default is exactly what a reader
   * would assume and exactly what a non-default run would contradict.
   */
  readonly size: string | null;
  readonly frames: number | null;
  readonly repeats: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly devicePixelRatio: number;
  readonly idleInterval: number;
  /**
   * The adapter as the browser described it, or `null`.
   *
   * On the live path `null` splits two ways — the browser withheld `WEBGL_debug_renderer_info`, or
   * the extension was unavailable — and `gpuMasked` says which. A stored row has one nullable
   * column and cannot, so `gpuMasked` is `null` there and the block prints the neutral marker.
   * Printing "(withheld by the browser)" for a row that does not know would be a fiction in the one
   * field a reader trusts to explain an outlier.
   */
  readonly gpu: string | null;
  readonly gpuMasked: boolean | null;
  readonly hardwareConcurrency: number | null;
  readonly deviceMemoryGb: number | null;
  readonly lostFocusDuringRun: boolean;
  readonly prefersReducedMotion: boolean;
  readonly userAgent: string;
  readonly startedAt: string;
  readonly appVersion: string;
  /**
   * The API release that stored the reading — **absent on the live path by construction.**
   *
   * The browser does not know it until the POST comes back, and the block is copyable before that.
   * A reading taken across a deploy is one a reader should be able to spot, so it is carried where
   * it exists rather than dropped to make the two adapters look symmetrical.
   */
  readonly apiVersion: string | null;
  /** The operator's own note, typed before the run. Never edited afterwards (insert-time only). */
  readonly machineLabel: string | null;
}

export interface SittingLimb {
  readonly limbLabel: string;
  readonly sceneSummary: string;
  readonly visibleBars: number;
  readonly pxPerDay: number;
  readonly minFps: number;
  readonly source: string;
  readonly gated: boolean;
  readonly repeats: number;
  readonly counts: Record<string, number>;
  readonly result: LimbOutcome['result'];
}

export interface Sitting {
  readonly context: SittingContext;
  readonly limbs: readonly SittingLimb[];
  /** `refused` and `cancelled` still produce a block; it says what happened and stores nothing. */
  readonly outcome: 'measured' | 'refused' | 'cancelled';
  readonly refusal?: { readonly reason: string; readonly sentence: string };
}

/** The live adapter — a run that has just finished, before or after it is stored. */
export function sittingFromOutcome(
  outcome: ProbeOutcome,
  machineLabel: string | null = null,
): Sitting | null {
  const context = outcome.kind === 'measured' ? outcome.context : outcome.context;
  if (context === null) return null;

  const limbs = outcome.kind === 'measured' ? outcome.limbs : [];

  return {
    outcome: outcome.kind,
    ...(outcome.kind === 'refused'
      ? { refusal: { reason: outcome.refusal.reason, sentence: outcome.refusal.sentence } }
      : {}),
    context: {
      scenarioId: context.scenarioId,
      scenarioLabel: context.scenarioLabel,
      preset: context.preset,
      size: context.size,
      frames: context.frames,
      repeats: context.repeats,
      viewport: context.viewport,
      devicePixelRatio: context.device.devicePixelRatio,
      idleInterval: context.idleInterval,
      gpu: context.device.gpu,
      gpuMasked: context.device.gpuMasked,
      hardwareConcurrency: context.device.hardwareConcurrency,
      deviceMemoryGb: context.device.deviceMemoryGb,
      lostFocusDuringRun: context.lostFocusDuringRun,
      prefersReducedMotion: context.device.prefersReducedMotion,
      userAgent: context.device.userAgent,
      startedAt: context.startedAt,
      appVersion: context.appVersion,
      apiVersion: null,
      machineLabel,
    },
    limbs: limbs.map((limb) => ({
      limbLabel: limb.limbLabel,
      sceneSummary: limb.sceneSummary,
      visibleBars: limb.visibleBars,
      pxPerDay: limb.pxPerDay,
      minFps: limb.minFps,
      source: limb.source,
      gated: limb.recording.thresholds.gated === true,
      repeats: (limb.recording.pairs ?? limb.recording.runs ?? []).length,
      counts: limb.recording.counts,
      result: limb.result,
    })),
  };
}

/**
 * The stored adapter — rows from one press, newest press first.
 *
 * Grouped by `runId`, which the server mints so the grouping cannot be forged by a client
 * (`schema.prisma` — "Groups the limbs of ONE press"). M4 adds `sweepId` above it, at which point
 * this key becomes `sweepId ?? runId` and a sitting can span several presses; nothing else here
 * changes, which is why the grouping is a single expression rather than spread through the caller.
 *
 * A row this bundle cannot judge still produces a limb: the reading was taken and its raw figures
 * are on the row, so dropping it would hide a measurement because a newer release named a scenario
 * this one does not know.
 */
export function sittingsFromRows(rows: readonly ProbeResultRow[]): readonly Sitting[] {
  const groups = new Map<string, ProbeResultRow[]>();
  for (const row of rows) {
    const key = groupKeyOf(row);
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [row]);
    else existing.push(row);
  }

  return [...groups.values()].map((group) => {
    // The first row carries the context: every row in a press shares its machine, its framing and
    // its clock, so reading them from one row rather than reconciling several is correct AND is
    // what makes a disagreement impossible rather than merely unlikely.
    const first = group[0] as ProbeResultRow;
    return {
      outcome: 'measured' as const,
      context: {
        scenarioId: first.scenarioId,
        scenarioLabel: scenarioLabelOf(first.scenarioId),
        preset: first.preset,
        size: null,
        frames: null,
        repeats: first.samples.length,
        viewport: { width: first.viewportWidth, height: first.viewportHeight },
        devicePixelRatio: first.devicePixelRatio,
        idleInterval: first.idleIntervalMs,
        gpu: first.gpuRenderer,
        gpuMasked: null,
        hardwareConcurrency: first.hardwareConcurrency,
        deviceMemoryGb: first.deviceMemoryGb,
        lostFocusDuringRun: first.lostFocusDuringRun,
        prefersReducedMotion: first.reducedMotion,
        userAgent: first.userAgent,
        startedAt: first.recordedAt,
        appVersion: first.appVersion,
        apiVersion: first.apiVersion,
        machineLabel: first.machineLabel,
      },
      limbs: group.map(limbFromRow),
    };
  });
}

/** The grouping key. One expression, so M4's `sweepId` lands in one place. */
export function groupKeyOf(row: ProbeResultRow): string {
  return row.runId;
}

function limbFromRow(row: ProbeResultRow): SittingLimb {
  const judged = storedJudgedResult(row);
  const counts = numericCounts(row.counts);
  const minFps = numberIn(row.thresholds, 'minFps') ?? 0;

  return {
    limbLabel: limbLabelOf(row.scenarioId, row.limbId),
    sceneSummary: row.sceneSummary,
    visibleBars: counts.visibleBars ?? 0,
    pxPerDay: row.pxPerDay,
    minFps,
    // The bar's provenance is stored on the row for exactly this reason (ADR-0128 D5): a reading
    // stays readable against the bar it was actually taken under, not whatever the bar became.
    source: stringIn(row.thresholds, 'source') ?? NOT_RECORDED,
    gated: row.thresholds.gated === true,
    repeats: row.samples.length,
    counts,
    // A row this bundle cannot read at all still produces a limb: the reading was taken and its
    // raw figures are on the row, so dropping it would hide a measurement because a newer release
    // named a scenario this one does not know.
    result: judged ?? {
      kind: 'unjudgeable',
      message: 'This reading was taken by a newer version of the app and cannot be judged here.',
    },
  };
}

function scenarioLabelOf(scenarioId: string): string {
  return SCENARIOS.find((s) => s.id === scenarioId)?.label ?? scenarioId;
}

function limbLabelOf(scenarioId: string, limbId: string): string {
  const limb = SCENARIOS.find((s) => s.id === scenarioId)?.limbs.find((l) => l.id === limbId);
  return limb === undefined ? limbId : `${String(limb.activities)} activities`;
}

function numericCounts(source: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function numberIn(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringIn(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
