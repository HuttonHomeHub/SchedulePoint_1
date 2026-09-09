import {
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
  REVISION_FREE_CHANGE_CLASSES,
  REVISION_PAID_CHANGE_CLASSES,
  type RevisionChangeClass,
  type RevisionChangeReport,
  type RevisionChangeRow,
  type RevisionClassAssessment,
  type RevisionFreeChangeClass,
  type RevisionNotAssessableReason,
  type ConstraintType,
  type RevisionPaidChangeClass,
} from '@repo/types';

import type { RevisionEdge, RevisionRow } from './revision-delta';

/**
 * **The change list** — what was added, removed, renamed, re-coded, re-typed, re-durationed,
 * re-dated, re-logicked, re-constrained, re-calendared, re-parented, re-laned, progressed, and what
 * happened to float and criticality, between two of a plan's revisions.
 *
 * One pure function over the same projections the delta reads. No engine, no I/O.
 * `computeSchedule` is not imported here and the ADR-0034 recalculation parity gate is untouched by
 * construction — the structural gate over this file's family asserts it rather than trusting this
 * sentence.
 *
 * ## It says WHAT moved, never WHY
 *
 * The same refusal the delta carries, and it matters more here. A change list puts
 * "Piling 20 d → 35 d" on screen next to a completion that moved nineteen days, and a reader will
 * join them — so will a contributor, in code. Attribution was measured to be order-dependent (the
 * same change scoring 30, 18, 2 or 0 working days by position alone) while the total is order-free,
 * and Tier 3 was withdrawn on that measurement rather than deferred. So rows are ordered by **time,
 * never by magnitude**: a list sorted by "biggest change first" is a ranking, and a ranking of
 * changes beside a slipped date is a causal claim wearing a table's clothes.
 *
 * ## Eight classes free, six paid — and the price is a snapshot, not a computation
 *
 * A baseline freezes the engine's **output** and, until ADR-0126, almost none of its **input**. The
 * eight free classes fall out of columns `BaselineActivity` has always held. The six paid ones —
 * logic, constraints, calendar, WBS parent, lane and progress — need the shape the snapshot
 * extension freezes, and a pair of revisions captured before it will **never** have it: writing
 * today's logic into a historic snapshot would state as history a graph that baseline never saw.
 * So such a pair reports each paid class as **not assessable with a reason**, never as "no change"
 * — see {@link ClassifyOptions.bothSnapshotted}, which is the ONLY thing entitled to answer that
 * question. The row fields themselves cannot: every one of them has a legitimate null on a fully
 * recorded side.
 */

/**
 * **The vocabulary lives in `@repo/types`, not here.** These are re-exported under the names this
 * module and its tests already use, so there is ONE definition of what a change class is — a
 * second copy beside the DTO would drift, and the drift would surface as a class the API can
 * return and the client cannot name.
 */
export const FREE_CHANGE_CLASSES = REVISION_FREE_CHANGE_CLASSES;
export const PAID_CHANGE_CLASSES = REVISION_PAID_CHANGE_CLASSES;
export type FreeChangeClass = RevisionFreeChangeClass;
export type PaidChangeClass = RevisionPaidChangeClass;
export type ChangeClass = RevisionChangeClass;
export type NotAssessableReason = RevisionNotAssessableReason;
/**
 * The classifier's own row: everything a pure function over two projections can know.
 *
 * `existsLive` is deliberately absent — it is a question about the LIVE plan, and this function
 * cannot tell a baseline from the live plan by design (that is what makes baseline-vs-baseline
 * free). The service adds it, exactly as it adds the same flag to the delta's rows
 * (`RevisionMovedRow` → `RevisionMovedActivity`).
 */
export type ChangeRow = Omit<RevisionChangeRow, 'existsLive'>;

export interface ClassAssessment extends Omit<RevisionClassAssessment, 'rows'> {
  readonly rows: readonly ChangeRow[];
}

/** What {@link classifyRevisionChanges} returns; {@link RevisionChangeReport} is the DTO. */
export interface ClassifiedReport extends Omit<RevisionChangeReport, 'classes'> {
  readonly classes: readonly ClassAssessment[];
}
export type { RevisionChangeReport };

/**
 * The paid classes whose subject is an ACTIVITY, so they are decided in the same per-row loop as
 * the free ones. `RELOGICKED` is the exception and is diffed over edges instead — its subject is a
 * link, which is why {@link RevisionChangeRow.subjectId} exists.
 *
 * Derived by exclusion rather than listed, so adding a paid class to the vocabulary puts it here
 * automatically and the compiler then demands a `changed`/`labelOf` branch for it. A hand-written
 * list would let a new class arrive, be reported, and always say "nothing changed".
 */
const PAID_ROW_CHANGE_CLASSES = PAID_CHANGE_CLASSES.filter(
  (c): c is Exclude<PaidChangeClass, 'RELOGICKED'> => c !== 'RELOGICKED',
);

/** Every class decided per activity row. ADDED/REMOVED are presence, handled separately. */
type RowChangeClass =
  Exclude<FreeChangeClass, 'ADDED' | 'REMOVED'> | (typeof PAID_ROW_CHANGE_CLASSES)[number];

/**
 * A duration for display.
 *
 * **Days are refused and hours are not**, and the difference is the point. `hours_per_day_minutes`
 * is frozen per capture (ADR-0068), so two baselines of one plan can carry different day factors
 * and a days figure would be a claim the comparison cannot make. Minutes→hours is exact and
 * calendar-independent, so withholding it bought nothing and cost the reader arithmetic on the
 * field they care about most — the M8 ux review's finding, and the reason this reads
 * `2880 min (48 h)` rather than `2880 min`.
 */
function minutesLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  const hours = minutes / 60;
  if (!Number.isFinite(hours) || minutes === 0) return `${String(minutes)} min`;
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${String(minutes)} min (${rounded} h)`;
}

/** What a reader is shown where a plan states no opinion. Never a blank and never a raw null. */
const NONE = 'None';
const TOP_LEVEL = 'Top level';
const PLAN_CALENDAR = 'Plan calendar';
/**
 * A calendar or parent named by a snapshot that the live plan no longer has. Stated rather than
 * rendered as a UUID: the snapshot deliberately holds correlation ids and no foreign keys
 * (ADR-0025), so this is an expected outcome of the design and not a broken reference.
 */
const GONE_CALENDAR = 'A calendar that no longer exists';
const GONE_PARENT = 'A phase that no longer exists';

function constraintLabel(row: RevisionRow): string {
  // Spelled out, not the planning-tool shorthand. `SNET 2026-02-01` is the form the product only
  // ever shows WITH a spelled-out fallback beside it; here it would have been the only text.
  const one = (type: ConstraintType | null, date: string | null): string | null =>
    type === null
      ? null
      : date === null
        ? CONSTRAINT_TYPE_LABELS[type]
        : `${CONSTRAINT_TYPE_LABELS[type]} ${date}`;
  const primary = one(row.constraintType, row.constraintDate);
  const secondary = one(row.secondaryConstraintType, row.secondaryConstraintDate);
  if (primary === null && secondary === null) return NONE;
  return [primary, secondary].filter((p): p is string => p !== null).join(', then ');
}

function progressLabel(row: RevisionRow): string {
  const parts = [`${String(row.percentComplete ?? 0)}%`];
  if (row.actualStart !== null) parts.push(`started ${row.actualStart}`);
  if (row.actualFinish !== null) parts.push(`finished ${row.actualFinish}`);
  return parts.join(' · ');
}

/**
 * How one side describes a value. Takes the side's OWN row index so a parent resolves to the name
 * it had on THAT side: renaming a phase and moving an activity into it are two edits, and resolving
 * both ends against the new side would report the old parent under its new name.
 */
function labelOf(
  row: RevisionRow,
  changeClass: RowChangeClass | 'ADDED' | 'REMOVED',
  side: ReadonlyMap<string, RevisionRow>,
  calendarName: (id: string) => string | null,
): string | null {
  switch (changeClass) {
    case 'RENAMED':
      return row.name;
    case 'RECODED':
      return row.code;
    case 'RETYPED':
      // The planner's word, from the SAME map every other surface in the product uses. It printed
      // the raw enum (`TASK → WBS_SUMMARY`) until the M8 ux review named the map it should have
      // been reading; it now lives in `@repo/types` so there is one list rather than two.
      return ACTIVITY_TYPE_LABELS[row.type];
    case 'REDURATIONED':
      return minutesLabel(row.durationMinutes);
    case 'REDATED':
      return row.earlyStart === null || row.earlyFinish === null
        ? null
        : `${row.earlyStart} → ${row.earlyFinish}`;
    case 'CRITICALITY':
      return row.isCritical ? 'critical' : `float ${String(row.totalFloatDays ?? '?')} d`;
    case 'RECONSTRAINED':
      return constraintLabel(row);
    case 'RECALENDARED':
      return row.calendarId === null
        ? PLAN_CALENDAR
        : (calendarName(row.calendarId) ?? GONE_CALENDAR);
    case 'REPARENTED':
      return row.parentId === null ? TOP_LEVEL : (side.get(row.parentId)?.name ?? GONE_PARENT);
    case 'RELANED':
      // Rows are one-based on every surface a planner sees; `laneIndex` is a zero-based internal
      // layout index and appears nowhere else in the product's copy.
      return `Row ${String((row.laneIndex ?? 0) + 1)}`;
    case 'PROGRESSED':
      return progressLabel(row);
    case 'ADDED':
    case 'REMOVED':
      return row.name;
  }
}

function changed(from: RevisionRow, to: RevisionRow, changeClass: RowChangeClass): boolean {
  switch (changeClass) {
    case 'RENAMED':
      return from.name !== to.name;
    case 'RECODED':
      return from.code !== to.code;
    case 'RETYPED':
      return from.type !== to.type;
    case 'REDURATIONED':
      // **Minutes, never days.** `hours_per_day_minutes` is frozen per capture, so two baselines of
      // one plan can carry different day-to-minute factors — comparing days would report a pure
      // calendar edit as a duration change (ADR-0068).
      return from.durationMinutes !== to.durationMinutes;
    case 'REDATED':
      return from.earlyStart !== to.earlyStart || from.earlyFinish !== to.earlyFinish;
    case 'CRITICALITY':
      return from.isCritical !== to.isCritical || from.totalFloatDays !== to.totalFloatDays;
    case 'RECONSTRAINED':
      // All four together — a secondary constraint is a constraint, and reporting a change to it
      // under a different heading would put two halves of one edit in two places.
      return (
        from.constraintType !== to.constraintType ||
        from.constraintDate !== to.constraintDate ||
        from.secondaryConstraintType !== to.secondaryConstraintType ||
        from.secondaryConstraintDate !== to.secondaryConstraintDate
      );
    case 'RECALENDARED':
      return from.calendarId !== to.calendarId;
    case 'REPARENTED':
      return from.parentId !== to.parentId;
    case 'RELANED':
      return from.laneIndex !== to.laneIndex;
    case 'PROGRESSED':
      return (
        from.percentComplete !== to.percentComplete ||
        from.actualStart !== to.actualStart ||
        from.actualFinish !== to.actualFinish
      );
  }
}

/** How an edge reads on one side. `FS +480 min`, `SS −120 min (24-hour)`, `FF`. */
function edgeLabel(edge: RevisionEdge): string {
  const lag =
    edge.lagMinutes === 0
      ? ''
      : ` ${edge.lagMinutes > 0 ? '+' : '−'}${String(Math.abs(edge.lagMinutes))} min`;
  // The lag CALENDAR is named only when the lag is non-zero, because it decides what the number
  // means (ADR-0036 §6) and means nothing beside a zero. Naming it anyway would put a difference on
  // screen for an edit — switching the lag calendar of a zero-lag link — that changes no date.
  const on = edge.lagMinutes === 0 ? '' : ` (${edge.lagCalendar})`;
  return `${edge.type}${lag}${on}`;
}

/** True when the two sides of one edge differ in anything a planner authored. */
function edgeChanged(from: RevisionEdge, to: RevisionEdge): boolean {
  return (
    from.type !== to.type ||
    from.lagMinutes !== to.lagMinutes ||
    // The lag calendar counts only ALONGSIDE a lag, exactly as `edgeLabel` renders it. Otherwise a
    // zero-lag link whose calendar was switched produces a row whose two labels are identical,
    // which reads as a defect in the list rather than as a fact about the plan — and it changes no
    // date, because there is no lag for the calendar to measure.
    (to.lagMinutes !== 0 && from.lagCalendar !== to.lagCalendar)
  );
}

function orderKeyOf(from: RevisionRow | null, to: RevisionRow | null): string | null {
  const candidates = [from?.earlyStart, to?.earlyStart].filter(
    (d): d is string => typeof d === 'string',
  );
  if (candidates.length === 0) return null;
  return candidates.sort()[0] ?? null;
}

/** Programme order, with a stable tie-break so two runs cannot disagree. A null date sorts last. */
function byTime(a: ChangeRow, b: ChangeRow): number {
  if (a.orderKey !== b.orderKey) {
    if (a.orderKey === null) return 1;
    if (b.orderKey === null) return -1;
    return a.orderKey < b.orderKey ? -1 : 1;
  }
  return a.subjectId < b.subjectId ? -1 : a.subjectId > b.subjectId ? 1 : 0;
}

/** One revision's activities and its logic. Both sides project to this same shape. */
export interface RevisionSideInput {
  readonly rows: readonly RevisionRow[];
  readonly edges: readonly RevisionEdge[];
}

export interface ClassifyOptions {
  /** Whether each side has a computed schedule. A side without one cannot be compared on dates. */
  readonly fromScheduled: boolean;
  readonly toScheduled: boolean;
  /**
   * Whether both sides recorded the paid classes — `baselines.revision_snapshot_level === 'FULL'`
   * on every frozen side (the live side always has its own shape). False for any baseline captured
   * before the snapshot extension, and **permanently** so for those rows: a backfill would state as
   * history a graph that baseline never saw.
   *
   * This is the ONLY thing entitled to decide whether the shape fields mean anything. Do not
   * replace it with a test of the fields themselves — every one of them has a legitimate null on a
   * fully recorded side, so such a test reads "no constraint" as "never recorded" and back again.
   */
  readonly bothSnapshotted: boolean;
  /**
   * Whether the two sides were matched ON the activity code — true for a cross-plan comparison and
   * false for a plan's own revisions, which are matched on id.
   *
   * When true the `RECODED` class **cannot** report anything: every matched pair has equal codes by
   * construction, so `from.code !== to.code` is unreachable. Saying nothing would print a confident
   * "no changes in this revision" for a question the product structurally cannot answer.
   *
   * **Required, not defaulted**, so every caller has to state which world it is in — a default of
   * `false` would silently give a future cross-plan caller the confident-and-wrong answer.
   */
  readonly codeIsTheCorrelationKey: boolean;
  /** Whether the caller asked for the progress class (opt-in — it changes on nearly every row). */
  readonly includeProgress: boolean;
  /**
   * Resolves a calendar id to its name, or null when the live plan no longer has it. Injected
   * rather than looked up: this function is pure, and the snapshot holds correlation ids precisely
   * so a calendar may be deleted without rotting the baseline (ADR-0025).
   */
  readonly calendarName: (id: string) => string | null;
  readonly cap: number;
}

/**
 * Classify the differences between two revisions of one plan.
 *
 * Both sides are the same projection the delta uses, so this cannot tell which came from
 * `baseline_activities` and which from `activities` — which is what makes baseline-vs-baseline free.
 */
export function classifyRevisionChanges(
  from: RevisionSideInput,
  to: RevisionSideInput,
  options: ClassifyOptions,
): ClassifiedReport {
  const {
    fromScheduled,
    toScheduled,
    bothSnapshotted,
    codeIsTheCorrelationKey,
    includeProgress,
    calendarName,
    cap,
  } = options;
  const fromById = new Map(from.rows.map((r) => [r.activityId, r]));
  const toById = new Map(to.rows.map((r) => [r.activityId, r]));

  /**
   * The row-subject classes actually decided on this comparison.
   *
   * Skipping the paid ones when the shape was not recorded is a **saving, not the guarantee** — and
   * that distinction was established by removing each in turn and running the suite, not by reading
   * the code. `assess` below is what refuses to report them (six cases go red without it); this
   * filter only avoids comparing NULL against NULL for every activity, five times, on a pair whose
   * answer is already fixed. Do not read it as the safety net: if it is ever the only thing left,
   * the report is one `if` away from confidently claiming the logic did not change.
   */
  const rowClasses: RowChangeClass[] = [
    ...FREE_CHANGE_CLASSES.filter(
      (c): c is Exclude<FreeChangeClass, 'ADDED' | 'REMOVED'> => c !== 'ADDED' && c !== 'REMOVED',
    ),
    ...(bothSnapshotted
      ? PAID_ROW_CHANGE_CLASSES.filter((c) => c !== 'PROGRESSED' || includeProgress)
      : []),
  ];

  const bucket = new Map<ChangeClass, ChangeRow[]>();
  for (const c of [...FREE_CHANGE_CLASSES, ...PAID_CHANGE_CLASSES]) bucket.set(c, []);

  for (const toRow of to.rows) {
    const fromRow = fromById.get(toRow.activityId);
    if (!fromRow) {
      bucket.get('ADDED')?.push({
        activityId: toRow.activityId,
        subjectId: toRow.activityId,
        changeClass: 'ADDED',
        code: toRow.code,
        name: toRow.name,
        from: null,
        to: labelOf(toRow, 'ADDED', toById, calendarName),
        orderKey: orderKeyOf(null, toRow),
      });
      continue;
    }
    for (const c of rowClasses) {
      if (!changed(fromRow, toRow, c)) continue;
      bucket.get(c)?.push({
        activityId: toRow.activityId,
        subjectId: toRow.activityId,
        changeClass: c,
        code: toRow.code,
        name: toRow.name,
        from: labelOf(fromRow, c, fromById, calendarName),
        to: labelOf(toRow, c, toById, calendarName),
        orderKey: orderKeyOf(fromRow, toRow),
      });
    }
  }

  for (const fromRow of from.rows) {
    if (toById.has(fromRow.activityId)) continue;
    bucket.get('REMOVED')?.push({
      activityId: fromRow.activityId,
      subjectId: fromRow.activityId,
      changeClass: 'REMOVED',
      code: fromRow.code,
      name: fromRow.name,
      from: labelOf(fromRow, 'REMOVED', fromById, calendarName),
      to: null,
      orderKey: orderKeyOf(fromRow, null),
    });
  }

  if (bothSnapshotted) {
    collectLogicChanges(from, to, fromById, toById, bucket);
  }

  // **A date-bearing class is not assessable when either side has no computed schedule.** Reporting
  // it as "nothing changed" would be a lie whose shape a reader cannot detect: an unscheduled side
  // has NO dates, so every row would look unmoved.
  const datesUnavailable = !fromScheduled || !toScheduled;
  const dateBearing = new Set<ChangeClass>(['REDATED', 'CRITICALITY']);

  const assess = (changeClass: ChangeClass): ClassAssessment => {
    if (datesUnavailable && dateBearing.has(changeClass)) {
      return { changeClass, notAssessableReason: 'SIDE_NOT_SCHEDULED', rows: [], total: 0 };
    }
    if (codeIsTheCorrelationKey && changeClass === 'RECODED') {
      // Reported with a reason, never as zero. The class is unanswerable rather than empty, and
      // the two look identical to a reader without this field.
      return {
        changeClass,
        notAssessableReason: 'CODE_IS_THE_CORRELATION_KEY',
        rows: [],
        total: 0,
      };
    }
    if (!bothSnapshotted && PAID_CHANGE_CLASSES.includes(changeClass as PaidChangeClass)) {
      // Reported, never omitted, and never as zero. `bothSnapshotted` false is permanent for the
      // rows involved, which is what the reader is told.
      return { changeClass, notAssessableReason: 'NOT_SNAPSHOTTED', rows: [], total: 0 };
    }
    const rows = (bucket.get(changeClass) ?? []).sort(byTime);
    return { changeClass, notAssessableReason: null, rows: rows.slice(0, cap), total: rows.length };
  };

  const classes: ClassAssessment[] = [
    ...FREE_CHANGE_CLASSES.map(assess),
    ...PAID_CHANGE_CLASSES.filter((c) => c !== 'PROGRESSED' || includeProgress).map(assess),
  ];

  return { classes, cap };
}

/**
 * Diff the two graphs, ONE row per edge.
 *
 * Keyed on the dependency id, which is what keeps an edge whose endpoints were both deleted to a
 * single "removed" row rather than one per endpoint — and keeps an edge that was re-typed AND
 * re-lagged to one row naming both sides, rather than two rows a reader would count as two edits.
 *
 * The row's `activityId` is the SUCCESSOR (what a planner opens the row to look at); its
 * `subjectId` is the edge, because two changed links into one successor are two rows and keying
 * them by activity would collide.
 */
function collectLogicChanges(
  from: RevisionSideInput,
  to: RevisionSideInput,
  fromById: ReadonlyMap<string, RevisionRow>,
  toById: ReadonlyMap<string, RevisionRow>,
  bucket: Map<ChangeClass, ChangeRow[]>,
): void {
  const fromEdges = new Map(from.edges.map((e) => [e.dependencyId, e]));
  const toEdges = new Map(to.edges.map((e) => [e.dependencyId, e]));
  const rows = bucket.get('RELOGICKED');
  if (!rows) return;

  /**
   * An endpoint's name, preferring the side the edge is being described from and falling back to
   * the other. The fallback is what lets a REMOVED edge name a successor that no longer exists —
   * the snapshot holds both endpoint ids precisely so an edge can describe itself without a join
   * (ADR-0126).
   */
  const nameOf = (id: string, prefer: ReadonlyMap<string, RevisionRow>): string =>
    prefer.get(id)?.name ?? fromById.get(id)?.name ?? toById.get(id)?.name ?? GONE_PARENT;

  const rowFor = (
    edge: RevisionEdge,
    prefer: ReadonlyMap<string, RevisionRow>,
  ): Omit<ChangeRow, 'from' | 'to'> => {
    const successor = prefer.get(edge.successorId) ?? toById.get(edge.successorId) ?? null;
    return {
      // Reveal targets the successor: a link change decides when the successor can start.
      activityId: edge.successorId,
      subjectId: edge.dependencyId,
      changeClass: 'RELOGICKED',
      code: null,
      name: `${nameOf(edge.predecessorId, prefer)} → ${nameOf(edge.successorId, prefer)}`,
      orderKey: orderKeyOf(null, successor),
    };
  };

  for (const [id, toEdge] of toEdges) {
    const fromEdge = fromEdges.get(id);
    if (!fromEdge) {
      rows.push({ ...rowFor(toEdge, toById), from: null, to: edgeLabel(toEdge) });
      continue;
    }
    if (!edgeChanged(fromEdge, toEdge)) continue;
    rows.push({ ...rowFor(toEdge, toById), from: edgeLabel(fromEdge), to: edgeLabel(toEdge) });
  }
  for (const [id, fromEdge] of fromEdges) {
    if (toEdges.has(id)) continue;
    rows.push({ ...rowFor(fromEdge, fromById), from: edgeLabel(fromEdge), to: null });
  }
}
