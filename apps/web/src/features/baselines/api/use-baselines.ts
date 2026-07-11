import type {
  BaselineDetail,
  BaselineSummary,
  BaselineVarianceRow,
  PlanVarianceSummary,
} from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch, apiFetchEnvelope } from '@/lib/api/client';
import { baselineKeys } from '@/lib/query/hierarchy-keys';

export { baselineKeys };

/** The variance read: the rows plus the plan-level roll-up (from the response `meta`). */
export interface PlanVariance {
  rows: BaselineVarianceRow[];
  summary: PlanVarianceSummary;
}

const EMPTY_SUMMARY: PlanVarianceSummary = {
  baselineId: null,
  baselineName: null,
  capturedAt: null,
  worstFinishSlipDays: null,
  behindCount: 0,
  addedCount: 0,
  removedCount: 0,
};

export function baselinesQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: baselineKeys.listByPlan(orgSlug, planId),
    queryFn: () =>
      apiFetch<BaselineSummary[]>(`/organizations/${orgSlug}/plans/${planId}/baselines`),
  });
}

export function useBaselines(orgSlug: string, planId: string): UseQueryResult<BaselineSummary[]> {
  return useQuery(baselinesQueryOptions(orgSlug, planId));
}

export function baselineQueryOptions(orgSlug: string, planId: string, baselineId: string) {
  return queryOptions({
    queryKey: baselineKeys.detail(orgSlug, planId, baselineId),
    queryFn: () =>
      apiFetch<BaselineDetail>(`/organizations/${orgSlug}/plans/${planId}/baselines/${baselineId}`),
    retry: false,
  });
}

/** A single baseline with its frozen activity snapshots. */
export function useBaseline(
  orgSlug: string,
  planId: string,
  baselineId: string,
): UseQueryResult<BaselineDetail> {
  return useQuery(baselineQueryOptions(orgSlug, planId, baselineId));
}

/**
 * The plan's per-activity variance vs its active baseline, plus the roll-up. Returns
 * an empty result (null baselineId) when the plan has no active baseline, so the UI can
 * simply hide variance. The rows and summary come from the `{ data, meta }` envelope.
 */
export function useBaselineVariance(orgSlug: string, planId: string): UseQueryResult<PlanVariance> {
  return useQuery({
    queryKey: baselineKeys.variance(orgSlug, planId),
    queryFn: async (): Promise<PlanVariance> => {
      const { data, meta } = await apiFetchEnvelope<BaselineVarianceRow[], PlanVarianceSummary>(
        `/organizations/${orgSlug}/plans/${planId}/baselines/variance`,
      );
      return { rows: data, summary: meta ?? EMPTY_SUMMARY };
    },
  });
}

/**
 * Invalidate everything a baseline mutation can affect: the list, the variance read, and
 * any cached single-baseline detail (activate flips the `isActive` flag on a detail row).
 */
function invalidateBaselines(
  queryClient: ReturnType<typeof useQueryClient>,
  orgSlug: string,
  planId: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: baselineKeys.listByPlan(orgSlug, planId) }),
    queryClient.invalidateQueries({ queryKey: baselineKeys.variance(orgSlug, planId) }),
    queryClient.invalidateQueries({
      queryKey: [...baselineKeys.all(orgSlug), 'plan', planId, 'detail'],
    }),
  ]);
}

export function useCaptureBaseline(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      apiFetch<BaselineSummary>(`/organizations/${orgSlug}/plans/${planId}/baselines`, {
        method: 'POST',
        body: JSON.stringify({ name: input.name }),
      }),
    onSuccess: () => invalidateBaselines(queryClient, orgSlug, planId),
  });
}

export function useActivateBaseline(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (baselineId: string) =>
      apiFetch<BaselineSummary>(
        `/organizations/${orgSlug}/plans/${planId}/baselines/${baselineId}/activate`,
        { method: 'POST' },
      ),
    onSuccess: () => invalidateBaselines(queryClient, orgSlug, planId),
  });
}

export function useDeleteBaseline(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (baselineId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/plans/${planId}/baselines/${baselineId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidateBaselines(queryClient, orgSlug, planId),
  });
}
