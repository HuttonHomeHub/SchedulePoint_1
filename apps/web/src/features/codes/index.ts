/** Public surface of the codes feature (P6 activity codes, M3). */
export { codeTypesQueryOptions, useCodeTypes } from './api/use-code-types';
export { codeValuesQueryOptions, useCodeValues } from './api/use-code-values';
export { codeKeys } from '@/lib/query/hierarchy-keys';
export { codeValueName, codeValueOptionLabel } from './model/code-names';
export { deriveCodesGate, type CodesGate } from './model/codes-gating';
export { useCodesDialog, type CodesDialogHost } from './model/use-codes-dialog';
export type { CodesDialogProps } from './components/CodesDialog';
