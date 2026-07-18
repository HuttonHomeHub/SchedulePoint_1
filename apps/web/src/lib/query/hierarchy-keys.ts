/**
 * TanStack Query key factories for the Client → Project → Plan hierarchy.
 *
 * These live in `lib` (shared), not inside any one feature, so cross-cutting
 * consumers — e.g. the recycle bin, which invalidates all three lists when it
 * restores a row — depend *downward* on shared code rather than *sideways* on a
 * sibling feature (docs/FRONTEND_ARCHITECTURE.md: "features → shared, never the
 * reverse; no feature → feature imports"). Each feature re-exports its own
 * factory from its public surface, so callers still import `clientKeys` from
 * `@/features/clients` as before.
 */

import type { HistogramGranularity } from '@repo/types';

export const clientKeys = {
  all: (orgSlug: string) => ['clients', orgSlug] as const,
  list: (orgSlug: string) => [...clientKeys.all(orgSlug), 'list'] as const,
  detail: (orgSlug: string, clientId: string) =>
    [...clientKeys.all(orgSlug), 'detail', clientId] as const,
};

export const projectKeys = {
  all: (orgSlug: string) => ['projects', orgSlug] as const,
  listByClient: (orgSlug: string, clientId: string) =>
    [...projectKeys.all(orgSlug), 'client', clientId] as const,
  detail: (orgSlug: string, projectId: string) =>
    [...projectKeys.all(orgSlug), 'detail', projectId] as const,
};

export const planKeys = {
  all: (orgSlug: string) => ['plans', orgSlug] as const,
  listByProject: (orgSlug: string, projectId: string) =>
    [...planKeys.all(orgSlug), 'project', projectId] as const,
  detail: (orgSlug: string, planId: string) =>
    [...planKeys.all(orgSlug), 'detail', planId] as const,
};

export const activityKeys = {
  all: (orgSlug: string) => ['activities', orgSlug] as const,
  listByPlan: (orgSlug: string, planId: string) =>
    [...activityKeys.all(orgSlug), 'plan', planId] as const,
  detail: (orgSlug: string, activityId: string) =>
    [...activityKeys.all(orgSlug), 'detail', activityId] as const,
};

export const stepKeys = {
  all: (orgSlug: string) => ['activity-steps', orgSlug] as const,
  // Keyed by the activity the steps hang off — the bulk replace invalidates the one
  // activity's step list (ADR-0044 §2), alongside the activity list/detail whose rolled-up
  // physical % moved.
  listByActivity: (orgSlug: string, activityId: string) =>
    [...stepKeys.all(orgSlug), 'activity', activityId] as const,
};

export const dependencyKeys = {
  all: (orgSlug: string) => ['dependencies', orgSlug] as const,
  byPlan: (orgSlug: string, planId: string) =>
    [...dependencyKeys.all(orgSlug), 'plan', planId] as const,
  predecessors: (orgSlug: string, activityId: string) =>
    [...dependencyKeys.all(orgSlug), 'activity', activityId, 'predecessors'] as const,
  successors: (orgSlug: string, activityId: string) =>
    [...dependencyKeys.all(orgSlug), 'activity', activityId, 'successors'] as const,
};

export const calendarKeys = {
  all: (orgSlug: string) => ['calendars', orgSlug] as const,
  list: (orgSlug: string) => [...calendarKeys.all(orgSlug), 'list'] as const,
  detail: (orgSlug: string, calendarId: string) =>
    [...calendarKeys.all(orgSlug), 'detail', calendarId] as const,
};

export const resourceKeys = {
  all: (orgSlug: string) => ['resources', orgSlug] as const,
  list: (orgSlug: string) => [...resourceKeys.all(orgSlug), 'list'] as const,
  detail: (orgSlug: string, resourceId: string) =>
    [...resourceKeys.all(orgSlug), 'detail', resourceId] as const,
};

export const assignmentKeys = {
  all: (orgSlug: string) => ['assignments', orgSlug] as const,
  // Keyed by the activity the assignments hang off — assign / edit / unassign all
  // invalidate the one activity's list (ADR-0039).
  listByActivity: (orgSlug: string, activityId: string) =>
    [...assignmentKeys.all(orgSlug), 'activity', activityId] as const,
};

export const scheduleKeys = {
  all: (orgSlug: string) => ['schedule', orgSlug] as const,
  summary: (orgSlug: string, planId: string) =>
    [...scheduleKeys.all(orgSlug), 'plan', planId, 'summary'] as const,
  // The Earned-Value read-model (EV4b, ADR-0042): a pure GET over the live schedule + cost inputs,
  // keyed under the same schedule namespace as the summary so a recalc's schedule invalidation can
  // sweep it too (dates move EV's PV/EV).
  earnedValue: (orgSlug: string, planId: string) =>
    [...scheduleKeys.all(orgSlug), 'plan', planId, 'earned-value'] as const,
  // The resource-loading histogram read-model (M7 rung 5, ADR-0044 §3): a pure GET over the live
  // schedule + resource assignments, keyed under the same schedule namespace as the summary so a
  // recalc's schedule invalidation sweeps it too (dates move each assignment's units-over-time).
  // Omit `granularity` to get the plan-scoped prefix — invalidating it sweeps every bucket size at
  // once (Day/Week/Month), so an assignment or recalc change refreshes whichever the user is viewing.
  resourceHistogram: (orgSlug: string, planId: string, granularity?: HistogramGranularity) =>
    [
      ...scheduleKeys.all(orgSlug),
      'plan',
      planId,
      'resource-histogram',
      ...(granularity ? [granularity] : []),
    ] as const,
};

export const planLockKeys = {
  all: (orgSlug: string) => ['plan-lock', orgSlug] as const,
  // One key per plan — the edit-lock is 1:1 with a plan (ADR-0028). Acquire /
  // release / heartbeat / request / handoff / take-over all invalidate this key.
  status: (orgSlug: string, planId: string) =>
    [...planLockKeys.all(orgSlug), 'plan', planId] as const,
};

export const baselineKeys = {
  all: (orgSlug: string) => ['baselines', orgSlug] as const,
  listByPlan: (orgSlug: string, planId: string) =>
    [...baselineKeys.all(orgSlug), 'plan', planId, 'list'] as const,
  detail: (orgSlug: string, planId: string, baselineId: string) =>
    [...baselineKeys.all(orgSlug), 'plan', planId, 'detail', baselineId] as const,
  variance: (orgSlug: string, planId: string) =>
    [...baselineKeys.all(orgSlug), 'plan', planId, 'variance'] as const,
};
