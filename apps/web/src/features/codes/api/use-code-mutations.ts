import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, codeKeys } from '@/lib/query/hierarchy-keys';

/**
 * The code type and value writes (P6 activity codes, M3-T1): create, rename or edit, reorder, delete
 * and restore, for each of the two. Each is a thin REST call (`docs/API.md` "Codes"); every one needs
 * the pen and Planner or Org Admin, which the server enforces and the callers shade for.
 *
 * **What each invalidates** (`m3-ui-design.md` §6.2). Types and values are read separately, so a write
 * sweeps only what it changed. **A delete or a restore also sweeps the activities**: it writes no
 * activity row, yet every carrier's `codes` reads differently afterwards (a deleted value or type is
 * absent from `codes`, and a restore brings it back), and the list is the only place those ids live.
 * A rename or an edit does not: `codes` holds ids, so the names it changes are re-read from the code
 * caches and a 2,000-activity refetch would buy nothing.
 *
 * **Nothing here writes a response into a cache.** The activity list in particular must never be
 * patched from a response that omits `codes`; a structural test in this feature pins that.
 */
function invalidateTypes(queryClient: QueryClient, orgSlug: string, planId: string): void {
  void queryClient.invalidateQueries({ queryKey: codeKeys.types(orgSlug, planId) });
}

function invalidateValues(
  queryClient: QueryClient,
  orgSlug: string,
  planId: string,
  codeTypeId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: codeKeys.values(orgSlug, planId, codeTypeId) });
}

function invalidateNames(queryClient: QueryClient, orgSlug: string, planId: string): void {
  void queryClient.invalidateQueries({ queryKey: codeKeys.namesAll(orgSlug, planId) });
}

function invalidateActivities(queryClient: QueryClient, orgSlug: string, planId: string): void {
  void queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) });
  void queryClient.invalidateQueries({ queryKey: activityKeys.details(orgSlug) });
}

const typesBase = (orgSlug: string, planId: string): string =>
  `/organizations/${orgSlug}/plans/${planId}/code-types`;
const valuesBase = (orgSlug: string, planId: string): string =>
  `/organizations/${orgSlug}/plans/${planId}/code-values`;

export interface CreateCodeTypeInput {
  name: string;
}

export function useCreateCodeType(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCodeTypeInput) =>
      apiFetch<CodeTypeSummary>(typesBase(orgSlug, planId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    // Returned, so `mutateAsync` resolves only after the list has refetched: the dialog selects the
    // new type next, and a type the list does not hold yet cannot be selected. (A delete must NOT do
    // this: its caller arms a focus hand-off that has to be in place before the row leaves the list.)
    onSettled: () => queryClient.invalidateQueries({ queryKey: codeKeys.types(orgSlug, planId) }),
  });
}

export interface RenameCodeTypeInput {
  codeTypeId: string;
  name: string;
  version: number;
}

export function useRenameCodeType(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ codeTypeId, name, version }: RenameCodeTypeInput) =>
      apiFetch<CodeTypeSummary>(`${typesBase(orgSlug, planId)}/${codeTypeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, version }),
      }),
    onSettled: () => invalidateTypes(queryClient, orgSlug, planId),
  });
}

export interface ReorderCodeRowsInput {
  /** Every live row exactly once, in the new order, each with the version it was read at. */
  order: { id: string; version: number }[];
}

export function useReorderCodeTypes(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderCodeRowsInput) =>
      apiFetch<CodeTypeSummary[]>(`${typesBase(orgSlug, planId)}/order`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidateTypes(queryClient, orgSlug, planId),
  });
}

export interface DeleteCodeTypeInput {
  codeTypeId: string;
  /** When sent, a stale one is refused with 409 `STALE_VERSION`. */
  version?: number;
}

export interface DeleteCodeValueInput {
  codeValueId: string;
  /** The type the value belongs to; the value's own caches are keyed by it. */
  codeTypeId: string;
  /** When sent, a stale one is refused with 409 `STALE_VERSION`. */
  version?: number;
}

const versionQuery = (version: number | undefined): string =>
  version === undefined ? '' : `?version=${String(version)}`;

export function useDeleteCodeType(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ codeTypeId, version }: DeleteCodeTypeInput) =>
      apiFetch<void>(`${typesBase(orgSlug, planId)}/${codeTypeId}${versionQuery(version)}`, {
        method: 'DELETE',
      }),
    onSettled: (_data, _error, input) => {
      invalidateTypes(queryClient, orgSlug, planId);
      invalidateValues(queryClient, orgSlug, planId, input.codeTypeId);
      invalidateNames(queryClient, orgSlug, planId);
      invalidateActivities(queryClient, orgSlug, planId);
    },
  });
}

export function useRestoreCodeType(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ codeTypeId }: { codeTypeId: string }) =>
      apiFetch<CodeTypeSummary>(`${typesBase(orgSlug, planId)}/${codeTypeId}/restore`, {
        method: 'POST',
      }),
    onSettled: (_data, _error, input) => {
      invalidateTypes(queryClient, orgSlug, planId);
      invalidateValues(queryClient, orgSlug, planId, input.codeTypeId);
      invalidateNames(queryClient, orgSlug, planId);
      invalidateActivities(queryClient, orgSlug, planId);
    },
  });
}

export interface CreateCodeValueInput {
  codeTypeId: string;
  shortCode: string;
  /** Omitted for none; the server stores a blank one as none too. */
  description?: string;
}

export function useCreateCodeValue(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ codeTypeId, ...body }: CreateCodeValueInput) =>
      apiFetch<CodeValueSummary>(`${typesBase(orgSlug, planId)}/${codeTypeId}/values`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: (_data, _error, input) => {
      invalidateValues(queryClient, orgSlug, planId, input.codeTypeId);
      // `valueCount` rides on the type, so the rail and the pane heading re-read it.
      invalidateTypes(queryClient, orgSlug, planId);
    },
  });
}

export interface EditCodeValueInput {
  codeValueId: string;
  codeTypeId: string;
  shortCode?: string;
  /** `null` clears it. */
  description?: string | null;
  version: number;
}

export function useEditCodeValue(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // `codeTypeId` is for the caches below and is never sent; an absent field is left alone by the
    // server, which is why `undefined` (dropped by `JSON.stringify`) and `null` (a clear) differ.
    mutationFn: ({ codeValueId, shortCode, description, version }: EditCodeValueInput) =>
      apiFetch<CodeValueSummary>(`${valuesBase(orgSlug, planId)}/${codeValueId}`, {
        method: 'PATCH',
        body: JSON.stringify({ shortCode, description, version }),
      }),
    onSettled: (_data, _error, input) => {
      invalidateValues(queryClient, orgSlug, planId, input.codeTypeId);
      invalidateNames(queryClient, orgSlug, planId);
    },
  });
}

export interface ReorderCodeValuesInput extends ReorderCodeRowsInput {
  codeTypeId: string;
}

export function useReorderCodeValues(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ codeTypeId, order }: ReorderCodeValuesInput) =>
      apiFetch<CodeValueSummary[]>(`${typesBase(orgSlug, planId)}/${codeTypeId}/values/order`, {
        method: 'PATCH',
        body: JSON.stringify({ order }),
      }),
    onSettled: (_data, _error, input) =>
      invalidateValues(queryClient, orgSlug, planId, input.codeTypeId),
  });
}

export function useDeleteCodeValue(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ codeValueId, version }: DeleteCodeValueInput) =>
      apiFetch<void>(`${valuesBase(orgSlug, planId)}/${codeValueId}${versionQuery(version)}`, {
        method: 'DELETE',
      }),
    onSettled: (_data, _error, input) => {
      invalidateValues(queryClient, orgSlug, planId, input.codeTypeId);
      invalidateTypes(queryClient, orgSlug, planId);
      invalidateNames(queryClient, orgSlug, planId);
      invalidateActivities(queryClient, orgSlug, planId);
    },
  });
}

export interface RestoreCodeValueInput {
  codeValueId: string;
  codeTypeId: string;
}

export function useRestoreCodeValue(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ codeValueId }: RestoreCodeValueInput) =>
      apiFetch<CodeValueSummary>(`${valuesBase(orgSlug, planId)}/${codeValueId}/restore`, {
        method: 'POST',
      }),
    onSettled: (_data, _error, input) => {
      invalidateValues(queryClient, orgSlug, planId, input.codeTypeId);
      invalidateTypes(queryClient, orgSlug, planId);
      invalidateNames(queryClient, orgSlug, planId);
      invalidateActivities(queryClient, orgSlug, planId);
    },
  });
}
