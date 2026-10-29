import { CODE_VALUE_LIMIT, type CodeValueSummary, type PageMeta } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetchEnvelope } from '@/lib/api/client';
import { codeKeys } from '@/lib/query/hierarchy-keys';

/** A stop on the paging loop for a server that never reports the end; 20 pages is 20,000 values. */
const MAX_VALUE_PAGES = 20;

const valuesPath = (orgSlug: string, planId: string, codeTypeId: string): string =>
  `/organizations/${orgSlug}/plans/${planId}/code-types/${codeTypeId}/values`;

/**
 * Every page of one type's values. **Not `apiFetchAllPages`**, which asks for 100 a page: a type holds
 * up to {@link CODE_VALUE_LIMIT} values and the route's own default page is that cap, so a live list is
 * one request. Ten requests for the same thousand rows would spend a tenth of the handler's per-minute
 * budget on one pane.
 */
async function fetchAllValues(path: string): Promise<CodeValueSummary[]> {
  const rows: CodeValueSummary[] = [];
  let cursor: string | null = null;
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 0; page < MAX_VALUE_PAGES; page += 1) {
    const cursorParam: string = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const envelope: { data: CodeValueSummary[]; meta?: PageMeta } = await apiFetchEnvelope<
      CodeValueSummary[],
      PageMeta
    >(`${path}${separator}limit=${String(CODE_VALUE_LIMIT)}${cursorParam}`);
    rows.push(...envelope.data);
    const next = envelope.meta;
    if (!next?.hasMore || next.nextCursor === null) return rows;
    cursor = next.nextCursor;
  }
  return rows;
}

/**
 * One type's live values in `position` order — what a pane, a column or a picker reads when that type
 * is opened. Cached per type, so arrowing back to a type read in the last 30 s costs nothing.
 */
export function codeValuesQueryOptions(orgSlug: string, planId: string, codeTypeId: string) {
  return queryOptions({
    queryKey: codeKeys.values(orgSlug, planId, codeTypeId),
    retry: 1,
    queryFn: () => fetchAllValues(valuesPath(orgSlug, planId, codeTypeId)),
  });
}

export function useCodeValues(
  orgSlug: string,
  planId: string,
  codeTypeId: string | undefined,
  enabled = true,
): UseQueryResult<CodeValueSummary[]> {
  return useQuery({
    ...codeValuesQueryOptions(orgSlug, planId, codeTypeId ?? ''),
    enabled: enabled && codeTypeId !== undefined,
  });
}

/**
 * One type's **deleted** values, for the restore list: read only while that disclosure is open and the
 * reader holds `code:restore`. `include=deleted` adds them to the live ones, which are filtered out.
 */
export function useDeletedCodeValues(
  orgSlug: string,
  planId: string,
  codeTypeId: string,
  enabled: boolean,
  staleTime?: number,
): UseQueryResult<CodeValueSummary[]> {
  return useQuery({
    queryKey: codeKeys.valuesDeleted(orgSlug, planId, codeTypeId),
    retry: 1,
    enabled,
    ...(staleTime === undefined ? {} : { staleTime }),
    queryFn: async () =>
      (await fetchAllValues(`${valuesPath(orgSlug, planId, codeTypeId)}?include=deleted`)).filter(
        (value) => value.deletedAt !== null,
      ),
  });
}
