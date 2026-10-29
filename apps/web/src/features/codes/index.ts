/** Public surface of the codes feature (P6 activity codes, M3). */
export { codeTypesQueryOptions, useCodeTypes } from './api/use-code-types';
export { codeValuesQueryOptions, useCodeValues } from './api/use-code-values';
export { codeKeys } from '@/lib/query/hierarchy-keys';
export { codeValueName, codeValueOptionLabel } from './model/code-names';
export { deriveCodesGate, type CodesGate } from './model/codes-gating';
export { useCodesDialog, type CodesDialogHost } from './model/use-codes-dialog';
export type { CodesDialogProps } from './components/CodesDialog';
export { CodeColumnsMenu, NO_CODE_TYPES_REASON } from './components/CodeColumnsMenu';
export { useCodeColumns, type CodeColumnsHost } from './model/use-code-columns';
export { useTableCodeColumns } from './model/use-table-code-columns';
export { CodeAssignControl } from './components/CodeAssignControl';
export { CodeBulkAssignBar } from './components/CodeBulkAssignBar';
export { useSetActivityCodes } from './model/use-set-activity-codes';
export { useWriteActivityCodes } from './api/use-write-activity-codes';
export {
  ActivityCodesSection,
  type ActivityCodesSectionState,
} from './components/ActivityCodesSection';
export { useCodeValueNames, type ResolvedCodeValue } from './api/use-code-value-names';
