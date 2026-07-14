import type { ActivitySummary, ActivityType, ConstraintType } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  isMilestoneType,
  type ActivityFormValues,
  type ProgressFormValues,
} from '../schemas/activity-schemas';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, baselineKeys } from '@/lib/query/hierarchy-keys';

export { activityKeys };

/**
 * The list-plus-detail invalidation a **single-activity** write settles into: the plan's
 * activities list (dates/lane/version moved) and that one activity's detail. Returned so the
 * mutation's `onSettled` can await it (#24e — the shared shape across update/reposition/progress).
 */
function invalidateActivity(
  queryClient: QueryClient,
  orgSlug: string,
  planId: string,
  activityId: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
    queryClient.invalidateQueries({ queryKey: activityKeys.detail(orgSlug, activityId) }),
  ]);
}

/**
 * The list-plus-baseline-variance invalidation a **create/delete** settles into: the variance set
 * itself changed (a new "Added"/"Removed" row), so it is refreshed alongside the activities list.
 */
function invalidatePlanActivities(
  queryClient: QueryClient,
  orgSlug: string,
  planId: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
    queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) }),
  ]);
}

/** A blank optional field is sent as absent. */
function optional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createBody(input: ActivityFormValues) {
  const hasConstraint = Boolean(input.constraintType);
  return {
    name: input.name,
    code: optional(input.code),
    type: input.type,
    // A milestone has no duration — the API rejects a non-zero one.
    durationDays: isMilestoneType(input.type) ? 0 : input.durationDays,
    description: optional(input.description),
    ...(hasConstraint
      ? { constraintType: input.constraintType, constraintDate: input.constraintDate }
      : {}),
  };
}

function updateBody(input: ActivityFormValues & { version: number; laneIndex?: number }) {
  const hasConstraint = Boolean(input.constraintType);
  return {
    name: input.name,
    code: optional(input.code) ?? null,
    type: input.type,
    durationDays: isMilestoneType(input.type) ? 0 : input.durationDays,
    description: optional(input.description) ?? null,
    // Clear both sides together when the constraint is removed (API pairs them).
    constraintType: hasConstraint ? input.constraintType : null,
    constraintDate: hasConstraint ? input.constraintDate : null,
    // Carry a lane change through the same write when a free-2D drag moved both axes (M4); the
    // canvas is the only caller that sets this — the form dialog never sends it.
    ...(input.laneIndex !== undefined ? { laneIndex: input.laneIndex } : {}),
    version: input.version,
  };
}

export function activitiesQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: activityKeys.listByPlan(orgSlug, planId),
    queryFn: () =>
      apiFetch<ActivitySummary[]>(`/organizations/${orgSlug}/plans/${planId}/activities`),
  });
}

export function useActivities(orgSlug: string, planId: string): UseQueryResult<ActivitySummary[]> {
  return useQuery(activitiesQueryOptions(orgSlug, planId));
}

export function useCreateActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityFormValues) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/plans/${planId}/activities`, {
        method: 'POST',
        body: JSON.stringify(createBody(input)),
      }),
    // Adding an activity introduces a new "Added" row in the baseline variance, so refresh it too.
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

/**
 * A canvas-placed create: name + type + duration + **laneIndex** + an optional placement
 * constraint. Reuses `POST /activities` but is shaped for the TSLD create-by-drag gesture
 * (M2), which sets the lane and an SNET constraint the form UI doesn't expose.
 */
export interface PlacedActivityInput {
  name: string;
  type: ActivityType;
  durationDays: number;
  laneIndex: number;
  constraintType?: ConstraintType;
  constraintDate?: string;
  /** Visual-Planning placement (ADR-0033): set instead of an SNET constraint when a bar is drawn in
   * VISUAL mode — the drop hand-places the start, no implicit constraint. */
  visualStart?: string;
}

export function useCreatePlacedActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlacedActivityInput) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/plans/${planId}/activities`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}

export function useUpdateActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { activityId: string; version: number; laneIndex?: number } & ActivityFormValues,
    ) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/activities/${input.activityId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateBody(input)),
      }),
    onSettled: (_data, _error, input) =>
      invalidateActivity(queryClient, orgSlug, planId, input.activityId),
  });
}

/**
 * A canvas Visual-Planning placement (ADR-0033 M3): the minimal `{ visualStart, laneIndex?, version }`
 * PATCH on the single-activity endpoint. In VISUAL mode a day-drag hand-places the bar's start via
 * `visualStart` (never an SNET constraint) and — unlike {@link useRepositionLane} — it *does* feed the
 * effective-Visual pass, so the route recalculates after it (the pass pins this bar and pushes its
 * unplaced successors, server-side). `visualStart: null` clears the placement (revert to computed).
 * It resends no definition fields, so it can never clobber a constraint or duration.
 */
export function useSetActivityVisualStart(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      activityId: string;
      visualStart: string | null;
      laneIndex?: number;
      version: number;
    }) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/activities/${input.activityId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          visualStart: input.visualStart,
          ...(input.laneIndex !== undefined ? { laneIndex: input.laneIndex } : {}),
          version: input.version,
        }),
      }),
    onSettled: (_data, _error, input) =>
      invalidateActivity(queryClient, orgSlug, planId, input.activityId),
  });
}

/**
 * A canvas lane move (TSLD M4): the minimal `{ laneIndex, version }` PATCH on the single-activity
 * endpoint. It changes only vertical layout — no constraint/definition, so the CPM output is
 * untouched and it needs **no recalc**; it therefore invalidates only the activities list (dates,
 * criticality and variance don't move). Backs a pure vertical drag and the `Alt+↑/↓` lane nudge.
 */
export function useRepositionLane(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { activityId: string; laneIndex: number; version: number }) =>
      apiFetch<ActivitySummary>(`/organizations/${orgSlug}/activities/${input.activityId}`, {
        method: 'PATCH',
        body: JSON.stringify({ laneIndex: input.laneIndex, version: input.version }),
      }),
    onSettled: (_data, _error, input) =>
      invalidateActivity(queryClient, orgSlug, planId, input.activityId),
  });
}

/**
 * Batch lane-position write (TSLD M4 auto-arrange): move many activities to new lanes in one
 * all-or-nothing PATCH on the plan's positions endpoint (per-row optimistic lock; no recalc — lane
 * is layout). Layout only, so it invalidates just the activities list. Backs the "Auto-arrange
 * lanes" action; a single stale `version` rejects the whole batch (409).
 */
export function useBatchPositions(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { positions: { id: string; laneIndex: number; version: number }[] }) =>
      apiFetch<ActivitySummary[]>(
        `/organizations/${orgSlug}/plans/${planId}/activities/positions`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ),
    // Activities list only — deliberately NOT per-row `detail` (unlike useRepositionLane): a bulk
    // reorder touches many rows and no open detail view renders laneIndex, so an N-key invalidation
    // would be waste. No variance/summary either — lane is layout, dates don't move.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) }),
  });
}

function progressBody(input: ProgressFormValues & { version: number }) {
  return {
    percentComplete: input.percentComplete,
    // A blank date field clears the value (null), matching the API.
    actualStart: input.actualStart ? input.actualStart : null,
    actualFinish: input.actualFinish ? input.actualFinish : null,
    version: input.version,
  };
}

export function useUpdateActivityProgress(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { activityId: string; version: number } & ProgressFormValues) =>
      apiFetch<ActivitySummary>(
        `/organizations/${orgSlug}/activities/${input.activityId}/progress`,
        {
          method: 'PATCH',
          body: JSON.stringify(progressBody(input)),
        },
      ),
    onSettled: (_data, _error, input) =>
      invalidateActivity(queryClient, orgSlug, planId, input.activityId),
  });
}

export function useDeleteActivity(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/activities/${activityId}`, { method: 'DELETE' }),
    // Removing an activity changes the baseline variance (it reads as "Removed" or drops out).
    onSettled: () => invalidatePlanActivities(queryClient, orgSlug, planId),
  });
}
