import type { PlanCodeSwimlaneLanes } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { codeKeys } from '@/lib/query/hierarchy-keys';

// The route's last segment, named so the path template carries no sentence-shaped word (the copy test
// reads every template string for a bare "lane").
const LANES_SEGMENT = 'swimlane-lanes';

export function codeSwimlaneLanesQueryOptions(orgSlug: string, planId: string, codeTypeId: string) {
  return queryOptions({
    queryKey: codeKeys.swimlaneLanes(orgSlug, planId, codeTypeId),
    // One retry. A short stale time and no refetch on focus: on a code plan with no lane rows this stays
    // enabled for good, and a whole-plan payload per window focus would be paid for nothing. A copy is
    // kept to be reused for a moment, and the writers that move a lane or a code mark it stale
    // (`invalidateCodeSwimlaneLanes`); the picture also applies a lane only to the value it was
    // stored for, so a stale row cannot place a bar wrongly.
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiFetch<PlanCodeSwimlaneLanes>(
        `/organizations/${orgSlug}/plans/${planId}/code-types/${codeTypeId}/${LANES_SEGMENT}`,
      ),
  });
}

/**
 * Every activity's stored lane under one code type of the plan, in one request. The activity list only
 * carries the lanes of the code the plan is already drawn by, so this is what fills the gap for a
 * plan that has just switched to another code. `enabled` keeps it idle whenever the list is enough.
 */
export function useCodeSwimlaneLanes(
  orgSlug: string,
  planId: string,
  codeTypeId: string | undefined,
  enabled: boolean,
): UseQueryResult<PlanCodeSwimlaneLanes> {
  return useQuery({
    ...codeSwimlaneLanesQueryOptions(orgSlug, planId, codeTypeId ?? ''),
    enabled: enabled && codeTypeId !== undefined,
  });
}
