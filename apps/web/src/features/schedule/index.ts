/**
 * The schedule feature's public surface: the read-only summary strip and the
 * summary query hook/keys. The per-activity computed columns and criticality
 * badges live on the M3 activities table (they read fields already on
 * `ActivitySummary`), using the shared `Badge` primitive and `lib/schedule-format`.
 */
export { ScheduleSummaryStrip } from './components/ScheduleSummaryStrip';
export { RecalculateButton } from './components/RecalculateButton';
export {
  useScheduleSummary,
  useRecalculate,
  scheduleKeys,
  scheduleSummaryQueryOptions,
  PLAN_START_REQUIRED,
} from './api/use-schedule';
