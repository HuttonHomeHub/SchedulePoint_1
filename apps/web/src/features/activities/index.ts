/** Public surface of the activities feature. */
export {
  useActivities,
  useCreateActivity,
  useCreatePlacedActivity,
  useUpdateActivity,
  useRepositionLane,
  useSetActivityVisualStart,
  useBatchPositions,
  useUpdateActivityParents,
  useDissolveSummary,
  useUpdateActivityProgress,
  useDeleteActivity,
  useBulkDeleteActivities,
  useRestoreDeleteBatch,
  useBatchPlacements,
  activitiesQueryOptions,
  activityKeys,
  type PlacedActivityInput,
} from './api/use-activities';
export {
  useActivitySteps,
  useReplaceActivitySteps,
  activityStepsQueryOptions,
  stepKeys,
} from './api/use-activity-steps';
export { ActivitiesTable } from './components/ActivitiesTable';
export { CreateActivityButton } from './components/CreateActivityButton';
export { ActivityCreateDialog } from './components/ActivityCreateDialog';
export { ActivityEditorDialog } from './components/ActivityEditorDialog';
// The same editor without a modal around it (Graphite M6-T1). `ActivityEditorDialog` is this
// component plus a `shell` that returns a `<Dialog>`; the context drawer supplies a shell that
// returns its children, so the drawer inherits no focus trap by construction rather than by
// discipline. The file keeps its `ActivityEditorDialog` name deliberately: renaming it would
// rewrite the imports of the eight suites whose passing UNCHANGED is this milestone's proof.
export { ActivityEditor, type ActivityEditorShell } from './components/ActivityEditorDialog';
export {
  deriveActivityEditorGating,
  type ActivityEditorGating,
} from './lib/activity-editor-gating';
export { deleteActivityDescription, dissolveSummaryDescription } from './lib/delete-activity-copy';
export {
  openActivityEditor,
  type ActivityEditorIntent,
  type ActivityEditorPurpose,
  type ActivityEditorTab,
} from './lib/activity-editor-intent';
export {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_STATUS_LABELS,
  CONSTRAINT_TYPE_LABELS,
  isMilestoneType,
  isDurationDerivedType,
} from './schemas/activity-schemas';
export { rollupPhysicalPercent, stepsFormSchema } from './schemas/step-schemas';
