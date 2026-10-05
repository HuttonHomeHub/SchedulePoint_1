/**
 * **Which plan-authoring writes are undoable, and why each of the others is not** (undo-redo M3,
 * ADR-0176 D6). The authority is this list; `coverage.census.structural.test.ts` computes the set of
 * mutation hooks the plan workspace reaches and fails the build when one is neither here as `recorded`
 * nor here as `excluded` with a written reason.
 *
 * That is the point of it. The dialog create, the outline moves, the steps, the assignments and the
 * cross-plan links were all plan-authoring writes that Undo silently skipped, and nothing connected
 * "somebody added a mutation hook" to "somebody decided whether it is undoable". A new write path now
 * has to take that decision in this file, in the same change, or the unit suite refuses it.
 *
 * It is a tripwire, not a classifier (ADR-0088 D2's stance): the test finds hooks by structure, and
 * what a `recorded` entry's seam actually records is held by the model's own tests.
 */

export type Coverage =
  /** The write is one undo step; `seam` is the command builder that records it. */
  | { readonly status: 'recorded'; readonly seam: string }
  /** The write is deliberately outside undo, for `reason`. */
  | { readonly status: 'excluded'; readonly reason: string };

const recorded = (seam: string): Coverage => ({ status: 'recorded', seam });
const excluded = (reason: string): Coverage => ({ status: 'excluded', reason });

/** Exclusion reasons, written once where several hooks share one. */
const REASON = {
  progress:
    'A progress report is contributor-writable and not pen-gated; folding it in breaks the ' +
    'single-writer assumption the stack rests on (ADR-0048). It is a record of what happened, ' +
    'corrected by reporting again.',
  notes:
    'Notes are non-structural, not pen-gated and author-owned. A comment thread is not plan content.',
  planSettings:
    'Plan settings are not pen-gated and are made in explicit-Save dialogs; the product owner ' +
    'decided they stay outside undo (spec CQ-1, 2026-10-04).',
  planRecord:
    'The plan record itself is hierarchy, not authoring: deleting one is a soft delete that ' +
    'Recently deleted restores (ADR-0096), and creating one opens a new workspace.',
  baselines:
    'A baseline is a snapshot record managed in its own dialog; deleting one is soft and ' +
    'restorable from Recently deleted.',
  calendarLibrary:
    'Calendars are an organisation-scoped library shared across plans. An undo pressed in one ' +
    'plan must never change another plan’s inputs.',
  resourceLibrary:
    'Resources are an organisation-scoped library shared across plans. An undo pressed in one ' +
    'plan must never change another plan’s inputs.',
  engineOutput:
    'This produces engine outputs. Undo replays inputs only and the engine recomputes ' +
    '(ADR-0048); applying levelled dates, which writes inputs, is recorded separately.',
  notThisPlan:
    'Not an edit to this plan’s content: pen, sharing and import (an import creates a new plan).',
  dissolve:
    'Dissolve clears the history today and becomes undoable in M6, which adds the server ' +
    'inverse it needs (spec §4.4). Listed until then so the gap is stated rather than found.',
} as const;

/**
 * Every mutation hook the plan workspace and the feature components it renders can reach, by name.
 * Keys are checked against the code in both directions: a hook with no entry fails, and an entry for
 * a hook nothing reaches any more fails too, so this cannot rot into a list of things that were once
 * true.
 */
export const COVERAGE: Readonly<Record<string, Coverage>> = {
  // Activities
  useCreateActivity: recorded('createActivityCommand'),
  useCreatePlacedActivity: recorded('createActivityCommand'),
  useCreateClonedActivity: recorded('pasteActivitiesCommand'),
  useDeleteActivity: recorded('deleteActivityCommand'),
  useBulkDeleteActivities: recorded('bulkDeleteCommand'),
  useRestoreDeleteBatch: recorded('deleteActivityCommand'),
  useUpdateActivity: recorded('durationResizeCommand'),
  useUpdateActivityFields: recorded('updateCommand'),
  useUpdateActivityParents: recorded('reparentCommand'),
  useRepositionLane: recorded('relaneCommand'),
  useSetActivityVisualStart: recorded('visualStartCommand'),
  useBatchPositions: recorded('autoArrangeCommand'),
  useBatchPlacements: recorded('bulkPlacementCommand'),
  useReplaceActivitySteps: recorded('stepsReplaceCommand'),
  useUpdateActivityProgress: excluded(REASON.progress),
  useDissolveSummary: excluded(REASON.dissolve),

  // Logic
  useCreateDependency: recorded('dependencyAddCommand'),
  useDeleteDependency: recorded('dependencyRemoveCommand'),
  useUpdateDependency: recorded('dependencyEditCommand'),
  useCreateCrossPlanLink: recorded('crossPlanLinkAddCommand'),
  useDeleteCrossPlanLink: recorded('crossPlanLinkRemoveCommand'),

  // Resource assignments (the library itself is excluded below)
  useCreateAssignment: recorded('assignmentAddCommand'),
  useCreateAssignmentOn: recorded('assignmentAddCommand'),
  useUpdateAssignment: recorded('assignmentEditCommand'),
  useDeleteAssignment: recorded('assignmentRemoveCommand'),

  // Notes
  useCreateNote: excluded(REASON.notes),
  useUpdateNote: excluded(REASON.notes),
  useDeleteNote: excluded(REASON.notes),

  // Plan settings and the plan record
  useSetPlanCalendar: excluded(REASON.planSettings),
  useSetPlanExpectedFinish: excluded(REASON.planSettings),
  useSetPlanRecalcMode: excluded(REASON.planSettings),
  useSetPlanScheduleOption: excluded(REASON.planSettings),
  useUpdatePlan: excluded(REASON.planSettings),
  useCreatePlan: excluded(REASON.planRecord),
  useDeletePlan: excluded(REASON.planRecord),

  // Baselines
  useActivateBaseline: excluded(REASON.baselines),
  useCaptureBaseline: excluded(REASON.baselines),
  useDeleteBaseline: excluded(REASON.baselines),

  // Shared libraries
  useAddException: excluded(REASON.calendarLibrary),
  useCreateCalendar: excluded(REASON.calendarLibrary),
  useDeleteCalendar: excluded(REASON.calendarLibrary),
  useMoveCalendarScope: excluded(REASON.calendarLibrary),
  useRemoveException: excluded(REASON.calendarLibrary),
  useUpdateCalendar: excluded(REASON.calendarLibrary),
  useUpdateException: excluded(REASON.calendarLibrary),
  useCreateResource: excluded(REASON.resourceLibrary),
  useDeleteResource: excluded(REASON.resourceLibrary),
  useDissolveResourceGroup: excluded(REASON.resourceLibrary),
  useUpdateResource: excluded(REASON.resourceLibrary),

  // Engine outputs
  useCriticalPathTest: excluded(REASON.engineOutput),
  useRecalculate: excluded(REASON.engineOutput),
  useRecalculateProgramme: excluded(REASON.engineOutput),

  // Not this plan's content
  useCommitImport: excluded(REASON.notThisPlan),
  useCreateShare: excluded(REASON.notThisPlan),
  useDryRunImport: excluded(REASON.notThisPlan),
  useRevokeShare: excluded(REASON.notThisPlan),
};
