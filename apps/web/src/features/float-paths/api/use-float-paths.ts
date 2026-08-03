import type { PlanFloatPaths } from '@repo/types';
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ApiFetchError, apiFetch } from '@/lib/api/client';
import { scheduleKeys } from '@/lib/query/hierarchy-keys';

/** The endpoint's declared ceiling (`FloatPathsQueryDto`, `@Max(50)`). */
export const MAX_FLOAT_PATHS = 50;

/** What the panel asks for first. **Show more** raises it to {@link MAX_FLOAT_PATHS}. */
export const DEFAULT_FLOAT_PATHS = 10;

/**
 * True when the request failed because the plan has never been scheduled — the API's **422
 * `PLAN_START_REQUIRED`**. There are no float paths to rank before a first recalculation, and that
 * is a state to explain rather than an error to report.
 */
export function isPlanNotScheduled(error: unknown): boolean {
  return error instanceof ApiFetchError && error.status === 422;
}

/**
 * True when the target activity is not in this plan (or was deleted under the panel) — a **404**.
 * The target is deliberately sticky (it does not follow the canvas selection), so it can outlive the
 * activity it names; the panel branches on this to say so and offer the current selection instead.
 */
export function isTargetMissing(error: unknown): boolean {
  return error instanceof ApiFetchError && error.status === 404;
}

export function floatPathsQueryOptions(
  orgSlug: string,
  planId: string,
  targetActivityId: string,
  maxPaths: number,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: scheduleKeys.floatPaths(orgSlug, planId, targetActivityId, maxPaths),
    queryFn: () =>
      apiFetch<PlanFloatPaths>(
        `/organizations/${orgSlug}/plans/${planId}/schedule/float-paths?target=${encodeURIComponent(targetActivityId)}&maxPaths=${String(maxPaths)}`,
      ),
    // `enabled` is the whole of the cost story and is NOT optional. Unlike the earned-value and
    // resource-histogram reads beside it, this endpoint is not a persisted read-model: the service
    // runs a full `computeSchedule` per request. A hook that fetched on mount would run a CPM
    // computation for every plan a planner opens, whether or not they ever asked this question.
    enabled: enabled && orgSlug !== '' && planId !== '' && targetActivityId !== '',
    // Zero, deliberately, with the query kept mounted while the panel is open. The analysis is
    // derived from the LIVE network — a stale float path is a wrong float path, not an old one —
    // and a recalculate already sweeps `scheduleKeys.all(orgSlug)`, which covers this key by
    // construction. The measured cost that makes this affordable is in the flag's docblock.
    staleTime: 0,
    // 404 (target gone) and 422 (never scheduled) are stable outcomes describing the plan, not
    // transport failures. Retrying them three times delays a state the panel can render immediately.
    retry: (failureCount, error) =>
      !isPlanNotScheduled(error) && !isTargetMissing(error) && failureCount < 3,
  });
}

/**
 * The ranked contiguous driving chains into one activity (ADR-0035 §19, audit F4) — read from
 * `GET …/schedule/float-paths`. A pure read: it schedules nothing, writes nothing, and needs no pen.
 *
 * Path **0** is the driving path (relative float 0); each later path is the next chain that binds,
 * with `relativeFloatMinutes` saying by how much it sits above the driving one. Read that field and
 * never `relativeFloat` — the day figure divides by a flat 1440 while total float is measured on the
 * activity's own calendar (ADR-0037 §4), so on an eight-hour calendar it under-reports threefold and
 * renders the first working day as `0`.
 */
export function useFloatPaths(
  orgSlug: string,
  planId: string,
  targetActivityId: string,
  maxPaths: number,
  enabled: boolean,
): UseQueryResult<PlanFloatPaths> {
  return useQuery(floatPathsQueryOptions(orgSlug, planId, targetActivityId, maxPaths, enabled));
}
