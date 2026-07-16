import type { ActivityType, ConstraintType, DependencyType } from '@repo/types';

import type { WorkingTimeCalendar } from './working-time-calendar';

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
   * The activity's own working-time calendar (ADR-0037, M5). **Undefined = inherit the plan
   * calendar** (`ComputeOptions.calendar`) — the default, byte-identical path. When set, the
   * activity's duration is advanced, its float measured, and its dates derived on **this**
   * calendar, so e.g. a 24/7 crew activity inside a 5-day plan works across weekends. The
   * service resolves the port from `activity.calendarId` and caches it per recalculation; the
   * engine stays calendar-agnostic (it never sees an id or an enum).
   */
  calendar?: WorkingTimeCalendar;
  /** Schedule constraint kind, if any. Honoured from Task A3 onward. */
  constraintType?: ConstraintType | null;
  /** The constraint's calendar day (`YYYY-MM-DD`); required when a type is set. */
  constraintDate?: string | null;
  /** Visual Planning hand-placement (`YYYY-MM-DD`), ADR-0033. Advisory input to the
   * **effective-Visual pass only** — it never touches the pure forward/backward pass, so
   * `early*`/`late*`/float stay a pure function of the network. Absent = no placement. */
  visualStart?: string | null;
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
  isCritical: boolean;
  isNearCritical: boolean;
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
}

/** Plan-level roll-up of an engine run. */
export interface EngineSummary {
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
  /**
   * How many `MANDATORY_START` / `MANDATORY_FINISH` constraints were treated as
   * their moderate equivalents (`MSO` / `MFO`) in this slice. Zero until A3.
   */
  parkedConstraintCount: number;
  /** The project finish offset (max early-finish offset); null for an empty plan. */
  projectFinishOffset: number | null;
  /** The inclusive project finish display date; null for an empty plan. */
  projectFinish: string | null;
}
