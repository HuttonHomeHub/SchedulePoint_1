/**
 * The pure CPM/GPM scheduling engine — a dependency-free domain library (no HTTP,
 * no Prisma). The service layer (Feature B) builds the plain input structs, runs
 * the engine, and persists the results. See ADR-0023 for the date convention.
 */
export { NEAR_CRITICAL_THRESHOLD_WORKING_DAYS } from './constants';
export { allDaysWorkCalendar, type WorkingDayCalendar } from './calendar';
export { computeSchedule, type ComputeOptions, type EngineOutput } from './compute';
export { buildGraph, type ScheduleGraph } from './graph';
export { ScheduleGraphNotADagError, UnknownActivityError } from './errors';
export type { EngineActivity, EngineEdge, EngineResult, EngineSummary } from './types';
