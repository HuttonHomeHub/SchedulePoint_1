import type { ActivityType, ConstraintType, DependencyType } from '@repo/types';

/**
 * The pure CPM engine's input and output structs.
 *
 * The engine is a **dependency-free domain library**: it knows nothing about
 * HTTP, Prisma, or persistence. The service layer (Feature B) is responsible for
 * loading the plan's active activities and dependencies, translating them into
 * these plain structs, running the engine, and writing the results back. Dates
 * that cross the boundary are calendar days in strict `YYYY-MM-DD` form; the
 * engine works internally in **continuous working-day offsets** from the data
 * date and only maps back to inclusive display dates through the
 * {@link WorkingDayCalendar} port (see ADR-0023).
 */

/** An activity node the engine schedules. */
export interface EngineActivity {
  id: string;
  /** Working days of work. Milestones (START/FINISH_MILESTONE) are 0. */
  durationDays: number;
  type: ActivityType;
  /** Schedule constraint kind, if any. Honoured from Task A3 onward. */
  constraintType?: ConstraintType | null;
  /** The constraint's calendar day (`YYYY-MM-DD`); required when a type is set. */
  constraintDate?: string | null;
}

/** A typed, lagged logic edge from a predecessor to a successor activity. */
export interface EngineEdge {
  /** The dependency's id, carried through so the engine can key its driving output. */
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /** Signed lag in working days: positive is a delay, negative is a lead. */
  lagDays: number;
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
 * The computed schedule for one activity. Offsets are continuous working-day
 * positions from the data date (a start offset of 0 means the activity starts on
 * the data date); the paired dates are the inclusive display dates mapped via the
 * calendar port. Total float is `lateStartOffset − earlyStartOffset`; it may be
 * negative when a constraint cannot be satisfied (surfaced, not an error).
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
