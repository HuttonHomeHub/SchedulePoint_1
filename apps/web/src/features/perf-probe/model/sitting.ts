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

/**
 * The facts that are **constant across a sitting** — and nothing else.
 *
 * That is a requirement rather than a tidy-up. A sitting is now up to four presses under one
 * `sweep_id`, so the measurement, the framing and the protocol differ from reading to reading;
 * the spec's own definition (§4.6 / CQ-5) is "a short definition list of the facts that are
 * constant across the sitting" beside "one table of the readings that vary", and the varying half
 * is exactly measurement / scale / framing / protocol.
 *
 * The tempting shortcut was to read them off the first row of the group. For a single press that
 * is correct and for a sweep it is a confident falsehood: it would label a four-reading sitting
 * with whichever scenario happened to sort first, and nothing on screen would look wrong.
 */
export interface SittingContext {
  /**
   * The canvas every reading was taken at, or `null` when they disagree.
   *
   * `null` is not "unknown" — it is "this sitting has more than one", which the rows then say
   * individually. Collapsing it to the first reading's value would state a confound the register
   * calls the most decision-relevant one it has (#261) as if it were settled.
   */
  readonly viewport: { readonly width: number; readonly height: number } | null;
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
  /**
   * Whether **any** reading in this sitting lost the window.
   *
   * Derived rather than copied, and it is the one sitting fact that is a disjunction instead of a
   * shared value: focus is lost per reading, so a sweep can hold three clean readings and one
   * suspect. Reporting the first row's value would call the whole sitting clean on the strength of
   * a reading that happened to sort first. Each reading carries its own beside it.
   */
  readonly anyReadingLostFocus: boolean;
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
  /**
   * Who took the readings — **absent on the live path by construction**, like `apiVersion`.
   *
   * The browser does not learn the label until the POST comes back, and the block is copyable
   * before that. `null` on a stored row means the account was scrubbed (ADR-0085's anonymisation),
   * which is a different fact from "not yet known" and reads as one at the call site.
   */
  readonly recordedByLabel: string | null;
}

/**
 * One row of the sitting's table — a limb, carrying the reading it belongs to.
 *
 * Measurement, framing and protocol are denormalised onto it rather than left on the sitting,
 * because a sitting spans up to four presses and those three differ across them. The spec's table
 * columns (§4.6) are exactly these plus the figures, so a row is self-describing and a reader can
 * sort or scan it without holding a header in their head.
 */
export interface SittingLimb {
  readonly scenarioId: string;
  readonly scenarioLabel: string;
  readonly preset: string;
  /**
   * The run length as the operator chose it, and the frame budget behind it.
   *
   * **`null` on a reading stored before M4**, and that is a real gap rather than an oversight: the
   * size is still not a column, and `frames_per_phase` only exists from M4 on. A block says so
   * rather than inventing the default, because the default is exactly what a reader would assume
   * and exactly what a non-default run would contradict.
   */
  readonly size: string | null;
  readonly frames: number | null;
  /**
   * When this reading was taken, per reading rather than per sitting.
   *
   * A sitting's `startedAt` is its earliest; a sweep spans minutes, and one re-run under the same
   * `sweep_id` (M6-T4) can span rather more. Keeping each reading's own is what lets the block
   * report a spread instead of implying the whole sitting happened at one instant.
   */
  readonly recordedAt: string | null;
  /** Focus is lost per reading, so the sitting's disjunction is not a substitute for this. */
  readonly lostFocusDuringRun: boolean;
  /**
   * The canvas this reading was taken at.
   *
   * On the limb as well as the sitting, because it is the single most decision-relevant confound
   * in the register (`docs/TECH_DEBT.md` #261: measured inside one sitting, the same plan on the
   * same machine drew at 35.2 fps at 1912x948 and 32.2 fps at 1920x1080 — this comment cited that
   * row's 23.3-against-39.5 pair until 2026-09-12, and #261 has withdrawn it as contaminated by
   * machine state; the conclusion below is unchanged, on evidence that survives) and because a
   * sitting can no longer promise it is
   * constant — M6-T4 re-runs a missing reading under the SAME `sweep_id`, and nothing stops the
   * operator resizing the window in between. The sitting states it when its readings agree and
   * says so when they do not; a row that differs is flagged against the sitting's.
   */
  readonly viewport: { readonly width: number; readonly height: number };
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
  /** The grouping key — stable, and the React key the list needs. */
  readonly id: string;
  /**
   * Whether this sitting was one deliberate act or a single press.
   *
   * Derived from WHICH id space grouped it rather than from the row count, because those answer
   * different questions: a sweep whose other three readings were refused stores exactly one row,
   * and counting rows would call it a single press. Only `sweep_id` records the operator's intent.
   */
  readonly kind: 'sweep' | 'run';
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
  const context = outcome.context;
  if (context === null) return null;

  const limbs = outcome.kind === 'measured' ? outcome.limbs : [];

  return {
    // A live outcome is always one press. It has no server-minted `runId` yet — the POST has not
    // returned — so the id is the run's own start instant, which is unique per press and stable
    // for as long as this object lives.
    id: `run:${context.startedAt}`,
    kind: 'run' as const,
    outcome: outcome.kind,
    ...(outcome.kind === 'refused'
      ? { refusal: { reason: outcome.refusal.reason, sentence: outcome.refusal.sentence } }
      : {}),
    context: {
      viewport: context.viewport,
      devicePixelRatio: context.device.devicePixelRatio,
      idleInterval: context.idleInterval,
      gpu: context.device.gpu,
      gpuMasked: context.device.gpuMasked,
      hardwareConcurrency: context.device.hardwareConcurrency,
      deviceMemoryGb: context.device.deviceMemoryGb,
      // One press, so the disjunction is that press's own value — but it is computed by the same
      // rule the stored adapter uses rather than passed through, so the two cannot drift.
      anyReadingLostFocus: context.lostFocusDuringRun,
      prefersReducedMotion: context.device.prefersReducedMotion,
      userAgent: context.device.userAgent,
      startedAt: context.startedAt,
      appVersion: context.appVersion,
      apiVersion: null,
      machineLabel,
      recordedByLabel: null,
    },
    limbs: limbs.map((limb) => ({
      scenarioId: context.scenarioId,
      scenarioLabel: context.scenarioLabel,
      preset: context.preset,
      size: context.size,
      frames: context.frames,
      recordedAt: context.startedAt,
      lostFocusDuringRun: context.lostFocusDuringRun,
      viewport: context.viewport,
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

  return [...groups.entries()].map(([key, group]) => {
    // **The first row carries the MACHINE, and nothing that varies.** It used to carry the framing
    // and the protocol too, under a comment claiming every row in a press shares them — true of one
    // press and false of a sweep, which is four presses under one id. Those moved to the limb; what
    // is left here is genuinely constant, because it describes the computer rather than the run.
    const first = group[0] as ProbeResultRow;
    return {
      id: key,
      kind: key.startsWith('sweep:') ? ('sweep' as const) : ('run' as const),
      outcome: 'measured' as const,
      context: {
        // Stated when the readings agree, `null` when they do not — never the first row's value,
        // which would print one reading's canvas over a sitting that holds two.
        viewport: sharedViewport(group),
        devicePixelRatio: first.devicePixelRatio,
        idleInterval: first.idleIntervalMs,
        gpu: first.gpuRenderer,
        gpuMasked: null,
        hardwareConcurrency: first.hardwareConcurrency,
        deviceMemoryGb: first.deviceMemoryGb,
        // A disjunction over the whole sitting, not the first row's value: one suspect reading
        // among four makes the sitting suspect, and a reader looking at the facts list needs to
        // know to go and find which.
        anyReadingLostFocus: group.some((row) => row.lostFocusDuringRun),
        prefersReducedMotion: first.reducedMotion,
        userAgent: first.userAgent,
        // The EARLIEST, not the first row's — the rows arrive newest-first from the API, so taking
        // `first` would date a sitting by its last reading.
        startedAt: group.reduce(
          (earliest, row) => (row.recordedAt < earliest ? row.recordedAt : earliest),
          first.recordedAt,
        ),
        appVersion: first.appVersion,
        apiVersion: first.apiVersion,
        machineLabel: first.machineLabel,
        recordedByLabel: first.recordedByLabel,
      },
      limbs: group.map(limbFromRow),
    };
  });
}

/**
 * The grouping key — **namespaced, never `sweepId ?? runId`.**
 *
 * The obvious expression is wrong for a reason that has nothing to do with likelihood: the two
 * columns are separate id spaces and nothing makes them disjoint. `run_id` is minted by the server
 * per POST and `sweep_id` by the client per press, so a bare coalesce puts values from two
 * generators into one keyspace and asks a `Map` to tell them apart. The prefix makes a collision
 * unrepresentable rather than improbable, which is the only version of that claim worth writing
 * down.
 *
 * It also carries a fact the caller needs: a key beginning `sweep:` is a sitting somebody pressed
 * as one act, and `run:` is a single press or a reading taken before the column existed. That is
 * the difference between "one of four readings" and "the only reading", and it is not recoverable
 * from the row count — a sweep whose other three steps were refused stores exactly one row.
 */
export function groupKeyOf(row: ProbeResultRow): string {
  return row.sweepId === null || row.sweepId === undefined
    ? `run:${row.runId}`
    : `sweep:${row.sweepId}`;
}

function limbFromRow(row: ProbeResultRow): SittingLimb {
  const judged = storedJudgedResult(row);
  const counts = numericCounts(row.counts);
  const minFps = numberIn(row.thresholds, 'minFps') ?? 0;

  return {
    scenarioId: row.scenarioId,
    scenarioLabel: scenarioLabelOf(row.scenarioId),
    preset: row.preset,
    // Still not a column, and still `null` rather than the default a reader would assume.
    size: null,
    frames: row.framesPerPhase ?? null,
    recordedAt: row.recordedAt,
    lostFocusDuringRun: row.lostFocusDuringRun,
    viewport: { width: row.viewportWidth, height: row.viewportHeight },
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

/** The viewport the whole group shares, or `null` when it holds more than one. */
function sharedViewport(
  group: readonly ProbeResultRow[],
): { width: number; height: number } | null {
  const first = group[0];
  if (first === undefined) return null;
  const same = group.every(
    (row) =>
      row.viewportWidth === first.viewportWidth && row.viewportHeight === first.viewportHeight,
  );
  return same ? { width: first.viewportWidth, height: first.viewportHeight } : null;
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

/**
 * How long a sitting's readings span, in milliseconds — or `null` when the question does not arise.
 *
 * `null` means fewer than two readings carry a time, which is a different fact from a spread of
 * zero and is rendered as nothing rather than as "0 minutes". A single reading has no spread; a
 * sitting whose rows predate the column has none that can be computed.
 */
export function sittingSpreadMs(sitting: Sitting): number | null {
  const times = sitting.limbs
    .map((limb) => limb.recordedAt)
    .filter((at): at is string => at !== null)
    .map((at) => Date.parse(at))
    .filter((ms) => Number.isFinite(ms));
  if (times.length < 2) return null;
  return Math.max(...times) - Math.min(...times);
}

/**
 * When a sitting stops being one sitting in time.
 *
 * **An hour is a threshold rather than a measurement, and it is chosen for what it excludes.** A
 * full sweep takes about two minutes and a stopped-and-resumed one perhaps ten, so an hour clears
 * every ordinary sitting by a wide margin; what it catches is the case M6-T4 creates — a reading
 * re-run under the same `sweep_id` days later, on a machine that has since been rebooted, updated
 * or plugged into a different display. The grouping is still right (the operator meant them as one
 * act) and the claim "these were taken together" is not, so the block says so rather than choosing
 * between the two.
 */
export const SITTING_SPREAD_LIMIT_MS = 60 * 60 * 1000;

/**
 * A spread in words.
 *
 * Deliberately **not** `describeDuration` from `sweep-duration.ts`: that one forecasts how long a
 * press will take and tops out in minutes by design ("about two minutes"), so a two-day gap would
 * print as "about 2880 minutes". A spread is elapsed fact rather than forecast, and it is unbounded
 * above — one of the two things this sentence exists to make visible.
 */
export function describeSpread(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${String(hours)} hour${hours === 1 ? '' : 's'}`;
  return `${String(Math.round(ms / 86_400_000))} days`;
}
