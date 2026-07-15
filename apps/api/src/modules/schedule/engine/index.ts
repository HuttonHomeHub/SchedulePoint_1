/**
 * The pure CPM/GPM scheduling engine — a dependency-free domain library (no HTTP,
 * no Prisma). The service layer builds the plain input structs, runs the engine,
 * and persists the results. Works in continuous working-**minute** offsets over an
 * intraday-shift calendar (ADR-0036); see ADR-0023 for the date convention.
 */
export { NEAR_CRITICAL_THRESHOLD_MINUTES } from './constants';
export {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
  type ShiftWindow,
  type TimeException,
  type WeeklyPattern,
} from './working-time-calendar';
export { computeSchedule, type ComputeOptions, type EngineOutput } from './compute';
export { buildGraph, type ScheduleGraph } from './graph';
export { ScheduleGraphNotADagError, UnknownActivityError } from './errors';
export type {
  EngineActivity,
  EngineEdge,
  EngineEdgeResult,
  EngineResult,
  EngineSummary,
} from './types';
