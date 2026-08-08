/**
 * **Activity copy / paste / duplicate** (`docs/specs/activity-copy-paste/`).
 *
 * M0 is the pure model only — naming, the field census and projection, and the set plan. Nothing
 * here renders, fetches or writes; the hosts arrive in M1. Keeping the whole decision surface
 * pure is what lets the census be a compile-time gate rather than a runtime check.
 */
export { ACTIVITY_NAME_MAX_LENGTH, freeCopyName } from './model/clone-naming';
export {
  CLONE_FIELD_DECISIONS,
  projectClone,
  projectDuplicate,
  shiftIsoDay,
  type CloneCreateBody,
  type CloneDisposition,
  type CloneFieldDecision,
  type CloneMode,
  type ClonePlacement,
} from './model/clone-projection';
export {
  MAX_CLONE_LINK_COUNT,
  MAX_CLONE_SET_SIZE,
  MAX_LANE_INDEX,
  planClone,
  type CloneCreate,
  type CloneLink,
  type ClonePlan,
  type ClonePlanResult,
  type CloneRefusal,
  type PlanCloneInput,
} from './model/clone-graph';
export { refusalMessage } from './model/refusal-copy';
export {
  ASSIGNMENT_FIELD_DECISIONS,
  projectAssignment,
  type AssignmentCloneBody,
} from './model/assignment-projection';
export { STEP_FIELD_DECISIONS, projectSteps } from './model/step-projection';
export {
  useCloneCarriage,
  type CarriageResult,
  type CloneCarriage,
  type SkippedAssignment,
} from './api/use-clone-carriage';
export { bandMembers, type BandCopyCounts } from './model/band-members';
export { bandCopyConfirmation, type BandCopyCopy } from './model/confirm-copy';
