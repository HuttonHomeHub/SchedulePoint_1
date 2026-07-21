/** Public surface of the schedule-interchange feature (ADR-0050, Stage C2). */
export { ImportScheduleButton } from './components/ImportScheduleButton';
export { ImportScheduleDialog } from './components/ImportScheduleDialog';
export { InterchangeReportTable } from './components/InterchangeReportTable';
export {
  useDryRunImport,
  useCommitImport,
  type InterchangeCommitResult,
} from './api/use-interchange';
export {
  fetchPlanExport,
  parseContentDispositionFilename,
  parseInterchangeReportHeader,
  fallbackExportFilename,
  exportReportFilename,
  exportErrorMessage,
  reportFindingCount,
  EXPORT_FORMAT_LABELS,
  type InterchangeExportFormat,
  type PlanExportResult,
} from './api/use-export-plan';
export {
  toImportError,
  checkUploadSize,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  type ImportError,
} from './lib/interchange-errors';
export { formatReportText, reportFilename, downloadReport } from './lib/report-download';
