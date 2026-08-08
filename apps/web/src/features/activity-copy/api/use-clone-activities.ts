import type { ActivitySummary } from '@repo/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CloneCreateBody } from '../model/clone-projection';

import { invalidatePlanActivities } from '@/features/activities/api/use-activities';
import { apiFetch } from '@/lib/api/client';

/**
 * Create one clone from a census-derived body (`docs/specs/activity-copy-paste/` M1).
 *
 * **Why this does not reuse `useCreateActivity`.** That hook takes the *form*-shaped
 * `ActivityDefinitionInput` and runs it through `createBody`, which differs from a clone body in two
 * ways that matter:
 *
 * 1. `createBody` **does not send `laneIndex`** — read at `use-activities.ts:98-155` rather than
 *    assumed. The endpoint has always accepted it (`create-activity.dto.ts:290-296`); the form
 *    simply has no lane field. A clone must land in a chosen lane, and a follow-up relane would
 *    leave it visibly in the wrong place for a round trip.
 * 2. `activityDefinitionInput` carries `expectedFinish`, `externalEarlyStart`, `externalLateFinish`
 *    and `actualExpense` — all of which the clone census deliberately **withholds**, because a copy
 *    is the same work and not the same commitments. Round-tripping through the form shape would
 *    quietly re-add them, and `activity-field-census.test.ts` would still pass, because it asserts
 *    against `projectClone` rather than against whatever the network finally sent.
 *
 * So the clone posts its own body. The census stays the single decision about what a copy carries,
 * and the form path is untouched — no existing caller changes shape.
 */
export function useCreateClonedActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CloneCreateBody) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/plans/${planId}/activities`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    // Same invalidation as every other activity write: a clone adds an "Added" row to the baseline
    // variance too, so the shared helper is the right one rather than a narrower key.
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}
