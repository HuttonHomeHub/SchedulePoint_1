import type { PlanSummary, SwimlaneSource, SwimlaneSummary } from '@repo/types';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, planKeys, swimlaneKeys } from '@/lib/query/hierarchy-keys';

/**
 * The swimlane writes (swimlanes M2-T9): create, rename, reorder, delete and restore, then the plan's
 * source. Each is a thin REST call (`docs/API.md` "Swimlanes"); every write needs the pen and Planner
 * or Org Admin, which the server enforces and the callers shade for.
 *
 * **What each invalidates.** The swimlane list always. The activity list only for a delete and a
 * restore: a swimlane is *drawn from* the activities' `swimlaneId`, and a delete (or its undo) changes
 * which swimlane every member reads as belonging to without a single activity row being written. A
 * create, a rename and a reorder move no member, and a 2,000-activity refetch is not free.
 */
function invalidateSwimlanes(
  queryClient: QueryClient,
  orgSlug: string,
  planId: string,
  options: { activities: boolean },
): void {
  void queryClient.invalidateQueries({ queryKey: swimlaneKeys.byPlan(orgSlug, planId) });
  if (options.activities) {
    void queryClient.invalidateQueries({ queryKey: activityKeys.listByPlan(orgSlug, planId) });
  }
}

const base = (orgSlug: string, planId: string): string =>
  `/organizations/${orgSlug}/plans/${planId}/swimlanes`;

export interface CreateSwimlaneInput {
  name: string;
  /** Insert directly after this active swimlane. Omitted: append at the end. */
  after?: string;
}

export function useCreateSwimlane(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSwimlaneInput) =>
      apiFetch<SwimlaneSummary>(base(orgSlug, planId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidateSwimlanes(queryClient, orgSlug, planId, { activities: false }),
  });
}

export interface RenameSwimlaneInput {
  swimlaneId: string;
  name: string;
  version: number;
}

export function useRenameSwimlane(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ swimlaneId, name, version }: RenameSwimlaneInput) =>
      apiFetch<SwimlaneSummary>(`${base(orgSlug, planId)}/${swimlaneId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, version }),
      }),
    onSettled: () => invalidateSwimlanes(queryClient, orgSlug, planId, { activities: false }),
  });
}

export interface ReorderSwimlanesInput {
  /** Every active swimlane exactly once, in the new order, with the version it was read at. */
  order: { id: string; version: number }[];
}

export function useReorderSwimlanes(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderSwimlanesInput) =>
      apiFetch<SwimlaneSummary[]>(`${base(orgSlug, planId)}/order`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidateSwimlanes(queryClient, orgSlug, planId, { activities: false }),
  });
}

export interface DeleteSwimlaneInput {
  swimlaneId: string;
  /** When sent, a stale one is refused with 409 `STALE_VERSION`. */
  version?: number;
}

export function useDeleteSwimlane(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ swimlaneId, version }: DeleteSwimlaneInput) =>
      apiFetch<void>(
        `${base(orgSlug, planId)}/${swimlaneId}${version === undefined ? '' : `?version=${String(version)}`}`,
        { method: 'DELETE' },
      ),
    onSettled: () => invalidateSwimlanes(queryClient, orgSlug, planId, { activities: true }),
  });
}

export function useRestoreSwimlane(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ swimlaneId }: { swimlaneId: string }) =>
      apiFetch<SwimlaneSummary>(`${base(orgSlug, planId)}/${swimlaneId}/restore`, {
        method: 'POST',
      }),
    onSettled: () => invalidateSwimlanes(queryClient, orgSlug, planId, { activities: true }),
  });
}

export interface SetPlanSwimlaneSourceInput {
  planId: string;
  version: number;
  source: SwimlaneSource;
  /**
   * The WBS level, 1 to 3, sent only with source `WBS`. The server clears it when the source leaves
   * `WBS`, so a switch back to hand-made names no level.
   */
  level?: number | null;
}

/**
 * Write the plan's swimlane source (the setup dialog's last step, and the manage dialog's switch). A
 * targeted PATCH of the source, its level and the version, like `useSetPlanCalendar`, so it needs no plan form. Presentation only: it never
 * marks the schedule stale (API.md "Swimlane placement"), so the schedule keys are left alone. The
 * returned plan goes straight into the detail cache so the next write sees the fresh `version`.
 */
export function useSetPlanSwimlaneSource(orgSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetPlanSwimlaneSourceInput) =>
      apiFetch<PlanSummary>(`/organizations/${orgSlug}/plans/${input.planId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          swimlaneSource: input.source,
          ...(input.source === 'WBS' && input.level != null
            ? { swimlaneWbsLevel: input.level }
            : {}),
          version: input.version,
        }),
      }),
    onSuccess: (updated, input) => {
      queryClient.setQueryData(planKeys.detail(orgSlug, input.planId), updated);
    },
    onSettled: (_data, _error, input) =>
      queryClient.invalidateQueries({ queryKey: planKeys.detail(orgSlug, input.planId) }),
  });
}
