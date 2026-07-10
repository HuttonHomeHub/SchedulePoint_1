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
