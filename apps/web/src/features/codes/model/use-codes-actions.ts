import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { useCallback, useMemo } from 'react';

import {
  useCreateCodeType,
  useCreateCodeValue,
  useDeleteCodeType,
  useDeleteCodeValue,
  useEditCodeValue,
  useRenameCodeType,
  useReorderCodeTypes,
  useReorderCodeValues,
  useRestoreCodeType,
  useRestoreCodeValue,
} from '../api/use-code-mutations';

import { movedRow, orderBody } from './code-order';

import {
  codeTypeAddCommand,
  codeTypeDeleteCommand,
  codeTypeRenameCommand,
  codeTypeReorderCommand,
  codeValueAddCommand,
  codeValueDeleteCommand,
  codeValueEditCommand,
  codeValueReorderCommand,
  type Command,
} from '@/features/undo-redo';

export interface CodeActions {
  addType: (name: string) => Promise<CodeTypeSummary>;
  renameType: (type: CodeTypeSummary, name: string) => Promise<CodeTypeSummary>;
  /** Move one place up or down within `list`. Resolves `false` when it is already at that end. */
  moveType: (list: readonly CodeTypeSummary[], id: string, delta: -1 | 1) => Promise<boolean>;
  removeType: (type: CodeTypeSummary) => Promise<void>;
  restoreType: (type: CodeTypeSummary) => Promise<void>;
  addValue: (
    type: CodeTypeSummary,
    input: { shortCode: string; description: string },
  ) => Promise<CodeValueSummary>;
  editValue: (
    value: CodeValueSummary,
    input: { shortCode: string; description: string },
  ) => Promise<CodeValueSummary>;
  moveValue: (
    list: readonly CodeValueSummary[],
    typeId: string,
    id: string,
    delta: -1 | 1,
  ) => Promise<boolean>;
  removeValue: (value: CodeValueSummary) => Promise<void>;
  /** Restore a deleted value; `type` is the type it belongs to, whose name the undo step's label uses. */
  restoreValue: (type: CodeTypeSummary, value: CodeValueSummary) => Promise<void>;
}

/**
 * The code type and value writes, each recorded for undo (ADR-0048, ADR-0176; `coverage.ts`).
 *
 * `record` is the workspace's history seam, or absent where there is no history (the unit tests).
 * **A history fault must never break a write that already succeeded** — the change is on the server
 * and the planner has been told so, and losing its undo step is the smaller failure — so recording is
 * the last thing each write does, inside its own try. The returned object is stable across renders
 * with equal inputs, because `mutateAsync` of a TanStack Query mutation is.
 */
export function useCodesActions(
  orgSlug: string,
  planId: string,
  record?: (command: Command) => void,
): CodeActions {
  const createTypeFn = useCreateCodeType(orgSlug, planId).mutateAsync;
  const renameTypeFn = useRenameCodeType(orgSlug, planId).mutateAsync;
  const reorderTypesFn = useReorderCodeTypes(orgSlug, planId).mutateAsync;
  const deleteTypeFn = useDeleteCodeType(orgSlug, planId).mutateAsync;
  const restoreTypeFn = useRestoreCodeType(orgSlug, planId).mutateAsync;
  const createValueFn = useCreateCodeValue(orgSlug, planId).mutateAsync;
  const editValueFn = useEditCodeValue(orgSlug, planId).mutateAsync;
  const reorderValuesFn = useReorderCodeValues(orgSlug, planId).mutateAsync;
  const deleteValueFn = useDeleteCodeValue(orgSlug, planId).mutateAsync;
  const restoreValueFn = useRestoreCodeValue(orgSlug, planId).mutateAsync;

  const remember = useCallback(
    (command: Command): void => {
      try {
        record?.(command);
      } catch (error) {
        console.error('Could not record a code change for undo', error);
      }
    },
    [record],
  );

  return useMemo<CodeActions>(
    () => ({
      addType: async (name) => {
        const created = await createTypeFn({ name });
        remember(codeTypeAddCommand({ created, remove: deleteTypeFn, restore: restoreTypeFn }));
        return created;
      },
      renameType: async (type, name) => {
        const after = await renameTypeFn({ codeTypeId: type.id, name, version: type.version });
        remember(
          codeTypeRenameCommand({
            codeTypeId: type.id,
            before: type.name,
            after,
            rename: renameTypeFn,
          }),
        );
        return after;
      },
      moveType: async (list, id, delta) => {
        const next = movedRow(list, id, delta);
        const moved = list.find((type) => type.id === id);
        if (next === null || moved === undefined) return false;
        const after = await reorderTypesFn({ order: orderBody(next) });
        remember(
          codeTypeReorderCommand({
            before: list,
            after,
            movedName: moved.name,
            reorder: reorderTypesFn,
          }),
        );
        return true;
      },
      removeType: async (type) => {
        await deleteTypeFn({ codeTypeId: type.id, version: type.version });
        remember(
          codeTypeDeleteCommand({ deleted: type, remove: deleteTypeFn, restore: restoreTypeFn }),
        );
      },
      restoreType: async (type) => {
        const restored = await restoreTypeFn({ codeTypeId: type.id });
        remember(
          codeTypeAddCommand({
            created: restored,
            remove: deleteTypeFn,
            restore: restoreTypeFn,
            restored: true,
          }),
        );
      },
      addValue: async (type, input) => {
        const created = await createValueFn({
          codeTypeId: type.id,
          shortCode: input.shortCode.trim(),
          ...(input.description.trim() === '' ? {} : { description: input.description.trim() }),
        });
        remember(
          codeValueAddCommand({
            created,
            typeName: type.name,
            remove: deleteValueFn,
            restore: restoreValueFn,
          }),
        );
        return created;
      },
      editValue: async (before, input) => {
        const after = await editValueFn({
          codeValueId: before.id,
          codeTypeId: before.codeTypeId,
          shortCode: input.shortCode.trim(),
          // A blank description is a clear, and the server reads `null` as one.
          description: input.description.trim() === '' ? null : input.description.trim(),
          version: before.version,
        });
        remember(codeValueEditCommand({ before, after, edit: editValueFn }));
        return after;
      },
      moveValue: async (list, typeId, id, delta) => {
        const next = movedRow(list, id, delta);
        const moved = list.find((value) => value.id === id);
        if (next === null || moved === undefined) return false;
        const after = await reorderValuesFn({ codeTypeId: typeId, order: orderBody(next) });
        remember(
          codeValueReorderCommand({
            codeTypeId: typeId,
            before: list,
            after,
            movedName: moved.shortCode,
            reorder: reorderValuesFn,
          }),
        );
        return true;
      },
      removeValue: async (value) => {
        await deleteValueFn({
          codeValueId: value.id,
          codeTypeId: value.codeTypeId,
          version: value.version,
        });
        remember(
          codeValueDeleteCommand({
            deleted: value,
            remove: deleteValueFn,
            restore: restoreValueFn,
          }),
        );
      },
      restoreValue: async (type, value) => {
        const restored = await restoreValueFn({
          codeValueId: value.id,
          codeTypeId: value.codeTypeId,
        });
        remember(
          codeValueAddCommand({
            created: restored,
            typeName: type.name,
            remove: deleteValueFn,
            restore: restoreValueFn,
            restored: true,
          }),
        );
      },
    }),
    [
      createTypeFn,
      renameTypeFn,
      reorderTypesFn,
      deleteTypeFn,
      restoreTypeFn,
      createValueFn,
      editValueFn,
      reorderValuesFn,
      deleteValueFn,
      restoreValueFn,
      remember,
    ],
  );
}
