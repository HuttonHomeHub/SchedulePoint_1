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
export { ActivityFormDialog } from './components/ActivityFormDialog';
export { ActivityProgressDialog } from './components/ActivityProgressDialog';
export { ActivityStepsDialog } from './components/ActivityStepsDialog';
export { ActivityEditorDialog } from './components/ActivityEditorDialog';
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
