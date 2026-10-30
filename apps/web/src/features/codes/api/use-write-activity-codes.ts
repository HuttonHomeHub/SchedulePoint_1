import type { ActivitySummary } from '@repo/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { activityHistoryKeys, activityKeys } from '@/lib/query/hierarchy-keys';
import { invalidateCodeSwimlaneLanes } from '@/lib/query/invalidate-code-lanes';

/** One activity's part of a codes write: the types it means to touch (`null` clears one). */
export interface ActivityCodesWriteRow {
  id: string;
  version: number;
  codes: { codeTypeId: string; codeValueId: string | null }[];
}

export interface WriteActivityCodesInput {
  activities: ActivityCodesWriteRow[];
}

/**
 * `PATCH …/activities/codes`: set or clear code values on one to 2,000 activities, all or nothing
 * (`docs/API.md` "Codes"). The one write behind the editor's **Save codes**, the table's **Set …** and,
 * from T4, the diagram's selection bars; undo for it is `activityCodesCommand`.
 *
 * **Invalidates, never merges.** The answer carries `codes`, but every other activity response does
 * not, and the house rule is that no response is written into the list (a structural test in this
 * feature pins it). `onSettled` **returns** the awaited invalidation so `mutateAsync` resolves only
 * after the list has refetched: the editor's other scopes then hold the `version` this write bumped,
 * and a second Save from another tab does not 409 against it.
 *
 * Not a schedule input (`NOT_INPUT`), so no recalculation, baseline or schedule key is touched.
 */
export function useWriteActivityCodes(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WriteActivityCodesInput) =>
      apiFetch<ActivitySummary[]>(`/organizations/${orgSlug}/plans/${planId}/activities/codes`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSettled: (_data, _error, input) => {
      // One sweep per family rather than a call per activity: a bulk write names up to 2,000, and a
      // call each would walk the cache 4,000 times. The id is the fourth element of both keys.
      const touched = new Set(input.activities.map((row) => row.id));
      const isTouched = ({ queryKey }: { queryKey: readonly unknown[] }): boolean =>
        touched.has(String(queryKey[3]));
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
        queryClient.invalidateQueries({
          queryKey: activityKeys.details(orgSlug),
          predicate: isTouched,
        }),
        // A code write moves membership and can move lanes, so a plan-wide code lane read is stale.
        invalidateCodeSwimlaneLanes(queryClient, orgSlug, planId),
        // The write recorded a history entry per activity (ADR-0174).
        queryClient.invalidateQueries({
          queryKey: activityHistoryKeys.all(orgSlug),
          predicate: isTouched,
        }),
      ]);
    },
  });
}
