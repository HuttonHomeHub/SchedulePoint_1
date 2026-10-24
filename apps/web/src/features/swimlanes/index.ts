/** Public surface of the swimlanes feature (swimlanes epic). */
export {
  useWriteSwimlaneLanes,
  type PlainLaneRow,
  type SwimlaneLaneRow,
} from '@/features/activities';
export { swimlanesQueryOptions, useSwimlanes } from './api/use-swimlanes';
export { swimlaneKeys } from '@/lib/query/hierarchy-keys';
export { manualSwimlaneInput } from './model/manual-membership';
export {
  SWIMLANE_GROUND,
  swimlanePictureInput,
  swimlanePictureOn,
  useSwimlaneScene,
  type SwimlaneScene,
} from './model/use-swimlane-scene';
export {
  useSwimlaneManagement,
  type SwimlaneDialogState,
  type SwimlaneDialogsProps,
  type SwimlaneManagement,
} from './model/use-swimlane-management';
export { useSwimlaneAssignment } from './model/use-swimlane-assignment';
export { SwimlaneBulkAssignBar } from './components/SwimlaneBulkAssignBar';
export { WbsSwimlaneField } from './components/WbsSwimlaneField';
