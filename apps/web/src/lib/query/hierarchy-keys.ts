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

import type { ArchivedFilter, HistogramGranularity, ResourceKind } from '@repo/types';

/**
 * The library list filters that take part in a cache key (ADR-0053 §4 / US-8) — free-text `q`,
 * archive state, and (resources only) `kind`. Shared by the calendar and resource key factories so
 * "the default filter" means one thing on both.
 */
export interface LibraryFilterKey {
  q?: string | undefined;
  archived?: ArchivedFilter | undefined;
  kind?: ResourceKind | undefined;
}

/**
 * The key segments a filter set contributes — and **nothing at all** for the default filter (no
 * search, active rows only, every kind). That is deliberate, and mirrors `calendarKeys.scoped`'s
 * `org` case: the default filter is the same request returning the same rows as the pre-ADR-0053
 * read, so it must share ONE cache entry with every existing caller rather than double-fetch it —
 * which is also what keeps the flag-off surface on exactly today's key.
 */
function libraryFilterSegments(filters?: LibraryFilterKey): readonly string[] {
  const q = filters?.q?.trim() ?? '';
  const archived = filters?.archived ?? 'exclude';
  const kind = filters?.kind ?? '';
  if (q === '' && archived === 'exclude' && kind === '') return [];
  return ['filter', q, archived, kind];
}

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

export const crossPlanDependencyKeys = {
  all: (orgSlug: string) => ['cross-plan-dependencies', orgSlug] as const,
  // Keyed by the activity the links are incident to — the list-by-activity read returns BOTH
  // directions (ADR-0045), and create/delete invalidate the whole org namespace (a link touches two
  // activities in two plans, so a coarse-but-correct sweep, mirroring `dependencyKeys` invalidation).
  byActivity: (orgSlug: string, activityId: string) =>
    [...crossPlanDependencyKeys.all(orgSlug), 'activity', activityId] as const,
};

export const noteKeys = {
  all: (orgSlug: string) => ['notes', orgSlug] as const,
  // A per-entity thread (newest-first, cursor-paginated). Plan and activity notes are separate caches
  // (separate endpoints), so keyed by the entity they hang off (ADR-0046). A create/edit/delete
  // invalidates the one thread it touched.
  planThread: (orgSlug: string, planId: string) =>
    [...noteKeys.all(orgSlug), 'plan', planId, 'thread'] as const,
  activityThread: (orgSlug: string, activityId: string) =>
    [...noteKeys.all(orgSlug), 'activity', activityId, 'thread'] as const,
  // The batch per-activity counts for a plan's row badges — ONE grouped query for the whole table (not
  // per-row). Keyed by the plan; an activity-note create/delete invalidates it so the badge tracks.
  activityCounts: (orgSlug: string, planId: string) =>
    [...noteKeys.all(orgSlug), 'plan', planId, 'activity-counts'] as const,
};

export const calendarKeys = {
  all: (orgSlug: string) => ['calendars', orgSlug] as const,
  /**
   * The shared **organisation** library — the endpoint's default result set (`?scope=org`), and the
   * only list that existed before ADR-0053. Every other calendar list nests UNDER this key, so a
   * create/update/delete keeps invalidating exactly `list(orgSlug)` and TanStack Query's prefix
   * match sweeps the scoped and per-project lists with it.
   */
  list: (orgSlug: string) => [...calendarKeys.all(orgSlug), 'list'] as const,
  /**
   * A tier-filtered organisation list (ADR-0053 §1, `?scope=org|project|all`). `org` deliberately
   * returns {@link list} itself rather than a sibling key: it is the same request and the same rows,
   * so the default filter shares one cache entry with every pre-existing `useCalendars` caller
   * instead of double-fetching it — and the flag-off surface keeps hitting exactly today's key.
   */
  scoped: (
    orgSlug: string,
    scope: 'org' | 'project' | 'all',
    filters?: LibraryFilterKey,
  ): readonly unknown[] => [
    ...(scope === 'org'
      ? calendarKeys.list(orgSlug)
      : ([...calendarKeys.list(orgSlug), 'scope', scope] as const)),
    ...libraryFilterSegments(filters),
  ],
  /**
   * The calendars **usable in** a project (its own + every organisation one) — the
   * `…/projects/:projectId/calendars` read that feeds the project section and the scope-aware plan /
   * activity pickers. Keyed per project so one project's list can never stomp another's, nor the
   * org list (the picker-regression risk in the M2 plan).
   */
  forProject: (
    orgSlug: string,
    projectId: string,
    filters?: LibraryFilterKey,
  ): readonly unknown[] => [
    ...calendarKeys.list(orgSlug),
    'project',
    projectId,
    ...libraryFilterSegments(filters),
  ],
  detail: (orgSlug: string, calendarId: string) =>
    [...calendarKeys.all(orgSlug), 'detail', calendarId] as const,
};

export const resourceKeys = {
  all: (orgSlug: string) => ['resources', orgSlug] as const,
  /**
   * The whole organisation library — the endpoint's default result set, and the only list that
   * existed before ADR-0053 §4. Every filtered list nests UNDER this key, so a create/update/
   * delete/archive keeps invalidating exactly `list(orgSlug)` and the prefix match sweeps the
   * filtered lists and the picker searches with it.
   */
  list: (orgSlug: string) => [...resourceKeys.all(orgSlug), 'list'] as const,
  /**
   * A search/kind/archive-filtered library list (ADR-0053 §4). The DEFAULT filter deliberately
   * returns {@link list} itself rather than a sibling key — same request, same rows — so the
   * unfiltered screen and every pre-existing `useResources` caller share one cache entry, exactly
   * as `calendarKeys.scoped` does for `org`.
   */
  filtered: (orgSlug: string, filters?: LibraryFilterKey): readonly unknown[] => [
    ...resourceKeys.list(orgSlug),
    ...libraryFilterSegments(filters),
  ],
  /**
   * The picker's cursor-paginated server search (ADR-0053 §4 / US-8) — a DIFFERENT read from the
   * library list (one page at a time, "Load more" for the rest), so it gets its own key under the
   * same `list` prefix: a library write still sweeps it, but a picker page can never be mistaken
   * for the whole library and truncate a screen that needs every row.
   */
  search: (orgSlug: string, filters?: LibraryFilterKey): readonly unknown[] => [
    ...resourceKeys.list(orgSlug),
    'search',
    ...libraryFilterSegments(filters),
  ],
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
  // The multiple-float-paths analysis (ADR-0035 §19, audit F4). It lives in the **schedule**
  // namespace for the same reason as its two siblings above and one sharper one: unlike them it is
  // not a persisted read-model at all — the service runs a full `computeSchedule` per request, so
  // its answer is a function of the live network. A recalc's `scheduleKeys.all(orgSlug)` sweep is
  // therefore not an optimisation here but the correctness rule, and it already covers this key by
  // construction with no new invalidation to remember.
  //
  // `target` and `maxPaths` are both in the key: paths are computed INTO one activity, and a
  // **Show more** that reused a 10-path cache entry for a 25-path request would silently show the
  // short list back to the planner who just asked for more.
  floatPaths: (orgSlug: string, planId: string, targetActivityId: string, maxPaths: number) =>
    [
      ...scheduleKeys.all(orgSlug),
      'plan',
      planId,
      'float-paths',
      targetActivityId,
      maxPaths,
    ] as const,
};

export const shareKeys = {
  all: (orgSlug: string) => ['shares', orgSlug] as const,
  // A plan's External-Guest share links (ADR-0051 F-M4) — a bounded, unpaginated list keyed by the
  // plan. Create / revoke invalidate the one plan's list.
  listByPlan: (orgSlug: string, planId: string) =>
    [...shareKeys.all(orgSlug), 'plan', planId, 'list'] as const,
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
