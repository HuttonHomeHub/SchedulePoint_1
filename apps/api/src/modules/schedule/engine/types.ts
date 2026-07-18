import type { ActivityType, ConstraintType, DependencyType } from '@repo/types';

import type { WorkingTimeCalendar } from './working-time-calendar';

/**
 * How the engine decides which activities are **critical** (M6-F2, ADR-0035 §17–§20).
 * `TOTAL_FLOAT` (the P6 default, behaviour-preserving) marks an activity critical when its total float
 * is ≤ the plan's threshold (default 0). `LONGEST_PATH` instead marks the contiguous chain of driving
 * ties running back from the latest-finishing activities — so an open-ended, hugely-negative-float
 * activity is **not** critical under Longest Path though it is under `TOTAL_FLOAT ≤ 0` (the fixture's
 * A12700, scenario S07). The engine stays dependency-free; the service maps the plan enum to this union.
 */
export type CriticalPathDefinition = 'TOTAL_FLOAT' | 'LONGEST_PATH';

/**
 * How total float is measured (M6-F3, ADR-0035 §18). `FINISH` (the P6 default) is late-finish minus
 * early-finish; `START` is late-start minus early-start; `SMALLEST` is the lesser of the two. On the
 * all-inherit, unprogressed path the start- and finish-side spans are equal, so the three coincide
 * (the byte-identical default) — they diverge only when an activity runs on a **different calendar**
 * from its logic neighbours (ADR-0037) or is progressed. Measured on the activity's own calendar.
 */
export type TotalFloatMode = 'START' | 'FINISH' | 'SMALLEST';

/**
 * The pure CPM engine's input and output structs.
 *
 * The engine is a **dependency-free domain library**: it knows nothing about
 * HTTP, Prisma, or persistence. The service layer (Feature B) is responsible for
 * loading the plan's active activities and dependencies, translating them into
 * these plain structs, running the engine, and writing the results back. Dates
 * that cross the boundary are calendar days in strict `YYYY-MM-DD` form; the
 * engine works internally on the **absolute working-instant** axis (ADR-0037) so
 * each activity schedules on its own {@link WorkingTimeCalendar} port, mapping back
 * to inclusive display dates on that calendar (ADR-0023). The exposed `*Offset`
 * fields project onto a common plan-calendar frame; float is on the activity's own.
 */

/** An activity node the engine schedules. */
export interface EngineActivity {
  id: string;
  /** Working **minutes** of work (ADR-0036). Milestones (START/FINISH_MILESTONE) are 0. */
  durationMinutes: number;
  type: ActivityType;
  /**
   * The activity's **WBS parent** (ADR-0038), for the summary-rollup pass (ADR-0035 §24). The engine
   * rolls a `WBS_SUMMARY` activity's dates up from the activities whose `parentId` points at it — its
   * DIRECT children — deepest-first, so nested summaries resolve child-before-parent. Absent/null = a
   * top-level node. This is **orthogonal to the dependency graph**: it is a containment tree, never a
   * logic edge (a summary carries no dependencies), so on a plan with no summary it is inert and the
   * schedule is byte-identical.
   */
  parentId?: string | null;
  /**
   * The activity's own working-time calendar (ADR-0037, M5). **Undefined = inherit the plan
   * calendar** (`ComputeOptions.calendar`) — the default, byte-identical path. When set, the
   * activity's duration is advanced, its float measured, and its dates derived on **this**
   * calendar, so e.g. a 24/7 crew activity inside a 5-day plan works across weekends. The
   * service resolves the port from `activity.calendarId` and caches it per recalculation; the
   * engine stays calendar-agnostic (it never sees an id or an enum).
   */
  calendar?: WorkingTimeCalendar;
  /**
   * External / inter-project **early-start** bound (ADR-0043, ADR-0035 §30.1). An imported commitment
   * from another project (a vendor delivery, an IFC release), a calendar day (`YYYY-MM-DD`). It acts as
   * an **SNET-shaped** forward lower bound, floored at the data date — the *later* of logic and this
   * drives the early start. **Soft:** it is never a mandatory pin and never sets `constraintViolated`,
   * and a hard pin (`MSO`/`MFO`/`MANDATORY_*`) still overrides it (§30.3). Dropped when
   * {@link ComputeOptions.ignoreExternalRelationships} is on. Absent/null = none — the byte-identical
   * parity default (a plan with no external data schedules identically with the option on or off).
   */
  externalEarlyStart?: string | null;
  /**
   * External / inter-project **late-finish** bound (ADR-0043, ADR-0035 §30.2). An imported downstream
   * commitment (a commissioning window), a calendar day (`YYYY-MM-DD`). It acts as an **FNLT-shaped**
   * backward upper bound (the *tighter* of logic and this). If it is earlier than logic can achieve,
   * total float goes **negative** on the driving chain (surfaced, not an error). Soft like
   * {@link externalEarlyStart}: it coexists with an internal finish constraint on the same activity, and
   * a hard pin still wins (§30.3). Dropped when ignore-external is on. Absent/null = none (parity).
   */
  externalLateFinish?: string | null;
  /** Primary schedule constraint kind, if any. Drives the **forward** pass (early dates). */
  constraintType?: ConstraintType | null;
  /** The primary constraint's calendar day (`YYYY-MM-DD`); required when a type is set. */
  constraintDate?: string | null;
  /**
   * Optional **secondary** constraint (ADR-0035 §10, M4). It drives the **backward** pass (late
   * dates) only — the primary owns the forward pass unchanged. A secondary of a forward-only kind
   * (`SNET`/`FNET`) is a documented no-op on the backward clamp (matches the clamp table); the
   * intended pairing is a forward primary + a backward secondary (e.g. A5200: SNET + FNLT). Absent =
   * no secondary (the byte-identical single-constraint path). Required together with its date.
   */
  secondaryConstraintType?: ConstraintType | null;
  /** The secondary constraint's calendar day (`YYYY-MM-DD`); required when a secondary type is set. */
  secondaryConstraintDate?: string | null;
  /** Visual Planning hand-placement (`YYYY-MM-DD`), ADR-0033. Advisory input to the
   * **effective-Visual pass only** — it never touches the pure forward/backward pass, so
   * `early*`/`late*`/float stay a pure function of the network. Absent = no placement. */
  visualStart?: string | null;
  /**
   * As-Late-As-Possible placement preference (ADR-0035 §11, M4-F4). A **display-only** hint, not a
   * date constraint: it never touches the pure forward/backward pass, so `early*`/`late*`/float stay a
   * pure function of the network. A flagged activity is rendered at its late-based position (its late
   * dates, already computed here); the zero-**free**-float refinement (place only as late as successors
   * allow) lands in M6. Absent/false = the ordinary early-based placement.
   */
  scheduleAsLateAsPossible?: boolean;
  /**
   * Progress actuals (M2, ADR-0035 §1–§2). Calendar days (`YYYY-MM-DD`). A **complete** activity
   * (`actualFinish` set) freezes on its actuals; an **in-progress** one (`actualStart` set, no
   * finish) keeps its frozen start while its remaining work reschedules forward from the data date.
   * Both absent = the ordinary planned activity (the byte-identical unprogressed path).
   */
  actualStart?: string | null;
  actualFinish?: string | null;
  /**
   * Resolved remaining working **minutes** for an in-progress activity — the service resolves it
   * (explicit `remainingDurationMinutes`, else `percentComplete × durationMinutes`) and passes it
   * here. Ignored unless the activity is in progress (started, not finished); absent then, the
   * engine falls back to the full `durationMinutes`.
   */
  remainingMinutes?: number;
  /**
   * Resume date (`YYYY-MM-DD`) for a suspended in-progress activity (M2, ADR-0035 §4). When set, the
   * remaining work is floored at `max(data date, resume date)` — a resume date after the data date
   * pushes the remaining out to it. Ignored for a not-started/complete activity.
   */
  resumeDate?: string | null;
  /**
   * Expected-finish target (`YYYY-MM-DD`) for an **incomplete** activity (M4, ADR-0035 §9). Honoured
   * only when {@link ComputeOptions.useExpectedFinishDates} is on: the forward pass then **recomputes**
   * the work remaining from the scheduled start so the early finish lands on this date — for an
   * in-progress activity its remaining, for a not-started one its full duration (the ADR §9 example
   * A6200 is not-started). Floored at the start (a past target collapses to zero). Ignored for a
   * complete activity or when the option is off, so the byte-identical path is unchanged.
   */
  expectedFinish?: string | null;
  /**
   * Resource-dependent driver-missing input (M7.2, ADR-0035 §23 / ADR-0039). Set by the **service**
   * for a `RESOURCE_DEPENDENT` activity that has no driving resource assignment, so no resource
   * calendar could be resolved (the DB guarantees ≤1 driver, so the only missing case is zero). The
   * engine does not compute it — it carries this flag straight to {@link EngineResult.resourceDriverMissing}
   * (produce-and-flag) and schedules the activity on the fallback calendar the service still supplies
   * via {@link calendar}. Absent/false for every other case (the byte-identical path). §23 is about the
   * driving *calendar*; the engine treats `RESOURCE_DEPENDENT` exactly like `TASK` for logic.
   */
  resourceDriverMissing?: boolean;
  /**
   * Levelling priority (ADR-0041 §1), client-settable — **lower = higher priority** (placed first by
   * the serial priority-list pass). Consumed only by {@link levelSchedule} (the opt-in second pass),
   * never by the pure CPM network pass, so it never affects `early*`/`late*`/float. **NULL/undefined
   * sorts LAST** (treated as +∞) in the composite ordering key. Ignored when levelling is off.
   */
  levelingPriority?: number | null;
}

/**
 * A single unit of resource **demand** for the levelling pass (ADR-0041 §2): one active assignment of
 * a resource to an activity, contributing `unitsPerHour` of concurrent demand while the activity runs.
 * **Every** assignment consumes capacity (not only the schedule-driving one). Built by the service from
 * the plan's active `ResourceAssignment` rows; the pure engine never touches Prisma.
 */
export interface EngineAssignment {
  activityId: string;
  resourceId: string;
  /** The per-working-hour demand rate (ADR-0040). The service resolves a NULL DB rate to 0 (no demand). */
  unitsPerHour: number;
}

/**
 * A resource's **capacity** input for the levelling pass (ADR-0041 §2): the per-working-hour ceiling
 * (`resource.max_units_per_hour`) and the resource's own resolved working calendar (ADR-0037/0039). A
 * `null` capacity is **UNCAPPED** — the parity-preserving default: an uncapped resource never
 * constrains, so a plan whose resources are all uncapped levels to byte-identical network dates.
 */
export interface EngineResource {
  id: string;
  /** Max units per working hour; **null = uncapped** (never over-allocated). */
  capacity: number | null;
  /** The resource's own working calendar (ADR-0037); undefined = the plan calendar. Used to detect a
   * window-only resource running out of availability (`levelingWindowExceeded`, ADR-0041 §6). */
  calendar?: WorkingTimeCalendar;
}

/** Options governing the levelling pass ({@link levelSchedule}). */
export interface LevelingOptions {
  /**
   * Level **within total float only** (ADR-0041 §4). When `true`, an activity is never delayed past its
   * total float: if the earliest capacity-feasible slot would push its finish beyond `lateFinishOffset`,
   * it is left at its within-float cap and the residual over-allocation is left **unresolved** (see
   * {@link levelSchedule} for the exact contract). Default `false` (P6 "level only within float" off).
   */
  levelWithinFloatOnly: boolean;
  /** The data date (`YYYY-MM-DD`) — the schedule's earliest instant, matching {@link EngineOutput}. */
  dataDate: string;
  /** The **plan** working-time calendar — the frame the exposed `*Offset` fields project onto. */
  planCalendar: WorkingTimeCalendar;
}

/** A typed, lagged logic edge from a predecessor to a successor activity. */
export interface EngineEdge {
  /** The dependency's id, carried through so the engine can key its driving output. */
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /** Signed lag in working **minutes** (ADR-0036): positive is a delay, negative is a lead. */
  lagMinutes: number;
  /**
   * The calendar the lag term is measured on (ADR-0036 §6, M3). **Undefined = the plan
   * calendar** — the fast, default path where the lag is a literal offset add (`anchor +
   * lag`), so the golden suite stays byte-identical. A distinct calendar (e.g. the 24-Hour
   * `allMinutesWorkCalendar`, for an elapsed lag like concrete cure) makes the lag walk on
   * that calendar instead — see `applyLag` in `compute.ts`. Today only `TWENTY_FOUR_HOUR`
   * resolves to a distinct calendar; Predecessor/Successor coincide with the plan calendar
   * until per-activity calendars land (M5).
   */
  lagCalendar?: WorkingTimeCalendar;
}

/**
 * The engine's per-edge output: whether the edge is **driving** — i.e. its forward
 * timing bound is exactly what set its successor's early start, so it is the binding
 * logic tie (CPM/GPM "driver"). An edge with slack (a later predecessor could move
 * without delaying the successor) is non-driving; when a constraint clamps the start
 * above every incoming bound, none of the successor's edges drive.
 */
export interface EngineEdgeResult {
  edgeId: string;
  isDriving: boolean;
}

/**
 * The computed schedule for one activity. The `*Offset` fields are working-**minute**
 * positions from the data date projected onto the **plan** calendar (ADR-0036/ADR-0037) — a
 * common frame across activities; the paired dates are the inclusive display dates mapped on the
 * activity's **own** calendar. Total float is measured on the activity's **own** calendar
 * (ADR-0037 §4, P6) — equal to `lateStartOffset − earlyStartOffset` when the activity inherits
 * the plan calendar; it may be negative when a constraint cannot be satisfied (surfaced, not an
 * error). The service maps these minute quantities back to the day-denominated public API.
 */
export interface EngineResult {
  activityId: string;
  earlyStartOffset: number;
  earlyFinishOffset: number;
  lateStartOffset: number;
  lateFinishOffset: number;
  totalFloat: number;
  /**
   * Free float (M6-F1, ADR-0035 §17–§20): the working time this activity can slip **without delaying the
   * early start of any successor** — measured on the activity's **own** calendar (ADR-0037 §4, P6),
   * like total float. It is the tightest gap, across the outgoing edges, between this activity's early
   * finish and the point at which it would begin pushing that successor's early start. An **open end**
   * (no successors) takes its total float (the standard tail identity FF = TF). Always ≤ total float.
   */
  freeFloat: number;
  isCritical: boolean;
  isNearCritical: boolean;
  /**
   * Mandatory produce-and-flag (ADR-0035 §7): true when a `MANDATORY_START`/`MANDATORY_FINISH` pin
   * overrode a stronger logic bound (drove the start earlier than the network-earliest). The schedule
   * is produced as-pinned; this flags that it broke logic — engine-owned, never repaired.
   */
  constraintViolated: boolean;
  /**
   * External-driven (ADR-0043, ADR-0035 §30) — **optional/absent** on the no-external path (the
   * byte-identical parity default, like the levelling overlay below). Present (`true`) only when an
   * external bound was the **binding** bound for this activity: its {@link EngineActivity.externalEarlyStart}
   * raised the early start above pure logic, or its {@link EngineActivity.externalLateFinish} clamped the
   * late finish below it (and no hard pin discarded either). Observability only, mirroring
   * `constraintViolated` — it changes no dates the schedule didn't already produce.
   */
  externalDriven?: boolean;
  /**
   * LOE no-span produce-and-flag (N12, ADR-0035 §21): true when a `LEVEL_OF_EFFORT` activity has no
   * resolvable span — it is missing an SS predecessor or an FF successor (or both). The engine places it
   * at a defined fallback (its SS end if present, else the data date; zero length) and flags it rather
   * than rejecting, mirroring the mandatory §7 produce-and-flag. Always false for a non-LOE activity and
   * for an LOE with a complete span.
   */
  loeNoSpan: boolean;
  /**
   * Resource-dependent driver-missing produce-and-flag (M7.2, ADR-0035 §23 / ADR-0039): true when a
   * `RESOURCE_DEPENDENT` activity has no driving resource assignment, so its driving calendar could not
   * be resolved. The activity is still scheduled (on the fallback calendar — activity own → plan
   * default) and flagged rather than rejected, mirroring the LOE §21 / mandatory §7 produce-and-flag.
   * Carried straight from {@link EngineActivity.resourceDriverMissing}; always false for a non-resource-
   * dependent activity and for a resource-dependent one with a driver.
   */
  resourceDriverMissing: boolean;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  /**
   * Effective-Visual pass output (ADR-0033), for canvas rendering in `VISUAL` mode.
   * `visualEffective{Start,Finish}` are the inclusive display dates a bar sits at: a
   * placed activity renders exactly on its `visualStart` (**even when infeasible** —
   * stay-and-flag); an unplaced one renders at its effective-earliest, pushed by any
   * placed predecessors. `visualConflict` flags a placement earlier than logic/an
   * explicit constraint allows. `visualDriftMinutes = visualStart − pure-network
   * earlyStart` (working minutes, ADR-0036), or null when unplaced. These never
   * affect the pure `early*`/`late*`/float above.
   */
  visualEffectiveStart: string;
  visualEffectiveFinish: string;
  visualConflict: boolean;
  visualDriftMinutes: number | null;
  /**
   * Resource-levelling overlay (ADR-0041 §3, Q2) — **additive**: produced by the opt-in
   * {@link levelSchedule} second pass and merged onto the network result; the pure
   * `early*`/`late*`/`totalFloat`/`isCritical` above are **never recomputed** on the leveled dates
   * (the network float stays authoritative). These fields are **OPTIONAL and absent** on a plain
   * `computeSchedule` result (the byte-identical parity path — the network pass never emits them);
   * they are present only after levelling runs, and even then are non-null only for an activity that
   * assigns a **finite-capacity** resource (a levelling participant). `leveledStartOffset` /
   * `leveledFinishOffset` are plan-frame working-minute offsets from the data date (like `early*`);
   * `levelingDelay` is the applied delay in working minutes on the activity's own calendar (0 when not
   * delayed); `leveledStart`/`leveledFinish` are the inclusive display dates (same mapping as `early*`).
   */
  leveledStartOffset?: number | null;
  leveledFinishOffset?: number | null;
  levelingDelay?: number;
  leveledStart?: string | null;
  leveledFinish?: string | null;
  /** Produce-and-flag (ADR-0041 §6, Q1): serialising pushed this activity past a resource's window. */
  levelingWindowExceeded?: boolean;
  /** Produce-and-flag (ADR-0041 §2): this activity's own single-activity demand exceeds a capacity. */
  selfOverAllocated?: boolean;
}

/** Plan-level roll-up of an engine run. */
export interface EngineSummary {
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
  /**
   * How many activities a mandatory pin drove into a broken relationship (`constraintViolated`) —
   * the produce-and-flag count (ADR-0035 §7), replacing the old parked-mandatory count.
   */
  constraintViolationCount: number;
  /**
   * How many soft constraint warnings the plan carries — the N15 case: a Start-No-Earlier-Than dated
   * before the data date (honoured, but can't pull work before it, ADR-0035 §12); and **N25**
   * (ADR-0043, ADR-0035 §30): an external early start dated before the data date, honoured but clamped
   * to the data-date floor. Both are the same "date before the data date" warning class.
   */
  constraintWarningCount: number;
  /**
   * How many Level-of-Effort activities had no resolvable span this run (N12, ADR-0035 §21) — the
   * produce-and-flag count. Zero unless the plan has an LOE missing an SS predecessor or FF successor.
   */
  loeNoSpanCount: number;
  /**
   * How many `RESOURCE_DEPENDENT` activities had no driving resource assignment this run (ADR-0035 §23 /
   * ADR-0039) — the produce-and-flag count. Zero unless the plan has a resource-dependent activity with
   * no driver.
   */
  resourceDriverMissingCount: number;
  /**
   * How many activities were **external-driven** this run (ADR-0043, ADR-0035 §30) — an external
   * early-start or late-finish bound was their binding bound. **Optional/absent** (⇔ 0) on the
   * no-external path so existing summaries stay byte-identical. Observability only, mirroring
   * `constraintViolationCount`.
   */
  externalDrivenCount?: number;
  /**
   * How many incomplete activities had their remaining work resized to an **expected finish** this run
   * (ADR-0035 §9) — zero unless the plan's `useExpectedFinishDates` option is on. Observability only.
   */
  expectedFinishAppliedCount: number;
  /** The project finish offset (max early-finish offset); null for an empty plan. */
  projectFinishOffset: number | null;
  /** The inclusive project finish display date; null for an empty plan. */
  projectFinish: string | null;
  /**
   * Resource-levelling roll-up (ADR-0041) — **optional/absent** on a plain `computeSchedule` result
   * (the parity path), populated by {@link levelSchedule} and merged in by the service. `null` when
   * levelling did not run.
   */
  /** How many activities the levelling pass delayed (`levelingDelay > 0`). */
  leveledActivityCount?: number | null;
  /** How many activities were pushed past a resource's availability window (ADR-0041 §6). */
  levelingWindowExceededCount?: number | null;
  /** How many activities carry an unfixable single-activity over-allocation (ADR-0041 §2). */
  selfOverAllocatedCount?: number | null;
  /** The leveled project finish offset (max leveled/early finish under levelling); null when off. */
  leveledProjectFinishOffset?: number | null;
  /** The inclusive leveled project finish display date; null when off. */
  leveledProjectFinish?: string | null;
}
