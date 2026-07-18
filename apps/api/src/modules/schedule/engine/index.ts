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
export { levelSchedule } from './level';
export { computeFloatPaths, type FloatPath } from './float-paths';
export {
  computeResourceHistogram,
  resolveCurveProfile,
  RESOURCE_CURVE_PROFILES,
  MAX_HISTOGRAM_BUCKETS,
  HistogramTooManyBucketsError,
  type HistogramInput,
  type HistogramAssignmentInput,
  type HistogramBucket,
  type HistogramSeries,
  type ResourceHistogramResult,
} from './resource-histogram';
export {
  computeEarnedValue,
  deriveMetrics,
  rollupPhysicalPercent,
  type EvInput,
  type EvActivityInput,
  type EvAssignmentInput,
  type ActivityStepInput,
  type EvMetrics,
  type EvActivityResult,
  type PlanEarnedValueResult,
} from './earned-value';
export type { ProgressMode, ProgressStatus } from './progress';
export { buildGraph, type ScheduleGraph } from './graph';
export { ScheduleGraphNotADagError, UnknownActivityError } from './errors';
export type {
  EngineActivity,
  EngineAssignment,
  EngineEdge,
  EngineEdgeResult,
  EngineResource,
  EngineResult,
  EngineSummary,
  LevelingOptions,
} from './types';
