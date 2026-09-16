import type { ClientSummary, PlanSummary, ProjectSummary } from '@repo/types';
import { queryOptions } from '@tanstack/react-query';

import { apiFetch, apiFetchAllPages } from '@/lib/api/client';
import { clientKeys, planKeys, projectKeys } from '@/lib/query/hierarchy-keys';

/**
 * Shared **read** query options for the Client → Project → Plan hierarchy, co-located
 * with the key factories in `lib` (shared), so cross-cutting consumers — the
 * navigator rail, the recycle bin — depend *downward* on a shared read contract
 * rather than *sideways* on a sibling feature (no feature → feature imports;
 * ADR-0029 §8, docs/FRONTEND_ARCHITECTURE.md). Each feature re-exports these from its
 * own `api/` so existing call sites (`@/features/clients` …) keep importing as before,
 * and everything shares one cache key, so page mutations refresh the tree for free.
 */

/**
 * Each hierarchy level pages through EVERY row (`apiFetchAllPages`) rather than taking the list
 * endpoints' default 20-row page: the navigator rail, the breadcrumb resolvers and the
 * client → project → plan pickers all render a level in full, so a partial page silently hid the
 * 21st client/project/plan — unreachable, not merely unlisted.
 */
/**
 * `search` narrows the list server-side (page-consistency M7) and is **keyed**, so a searched view
 * and the full list are separate cache entries rather than one overwriting the other.
 *
 * **Absent ⇒ byte-identical to before**: no query string, the same key, the same cached list every
 * other consumer already shares. That matters because this query is not the Clients screen's alone
 * — the navigator rail, the breadcrumb resolvers and the pickers all read it, and none of them
 * should inherit somebody's search term.
 */
export function clientsQueryOptions(orgSlug: string, search?: string) {
  const q = search?.trim() ?? '';
  const suffix = q === '' ? '' : `?q=${encodeURIComponent(q)}`;
  return queryOptions({
    queryKey: q === '' ? clientKeys.list(orgSlug) : [...clientKeys.list(orgSlug), 'q', q],
    queryFn: () => apiFetchAllPages<ClientSummary>(`/organizations/${orgSlug}/clients${suffix}`),
  });
}

export function projectsQueryOptions(orgSlug: string, clientId: string) {
  return queryOptions({
    queryKey: projectKeys.listByClient(orgSlug, clientId),
    queryFn: () =>
      apiFetchAllPages<ProjectSummary>(`/organizations/${orgSlug}/clients/${clientId}/projects`),
  });
}

/** A single project — also used to resolve a deep-linked node's ancestor client. */
export function projectQueryOptions(orgSlug: string, projectId: string) {
  return queryOptions({
    queryKey: projectKeys.detail(orgSlug, projectId),
    queryFn: () => apiFetch<ProjectSummary>(`/organizations/${orgSlug}/projects/${projectId}`),
    retry: false,
  });
}

export function plansQueryOptions(orgSlug: string, projectId: string) {
  return queryOptions({
    queryKey: planKeys.listByProject(orgSlug, projectId),
    queryFn: () =>
      apiFetchAllPages<PlanSummary>(`/organizations/${orgSlug}/projects/${projectId}/plans`),
  });
}

/** A single plan — also used to resolve a deep-linked plan's ancestor project. */
export function planQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: planKeys.detail(orgSlug, planId),
    queryFn: () => apiFetch<PlanSummary>(`/organizations/${orgSlug}/plans/${planId}`),
    retry: false,
  });
}
