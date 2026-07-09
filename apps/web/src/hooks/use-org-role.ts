import type { OrganizationRole } from '@repo/types';

import { useOrganizations } from '@/features/organizations';

/** Roles allowed to create/update/delete hierarchy rows (mirrors the API's write RBAC). */
const WRITER_ROLES: readonly OrganizationRole[] = ['PLANNER', 'ORG_ADMIN'];

/** Whether a role may manage clients/projects/plans (write). */
export function canManageHierarchy(role: OrganizationRole | undefined): boolean {
  return role !== undefined && WRITER_ROLES.includes(role);
}

/**
 * The current user's role in `orgSlug`, from the already-loaded organisations
 * query. Used to hide write affordances for non-writers — the API still
 * enforces authorisation, so this is UX, not trust.
 */
export function useOrgRole(orgSlug: string): OrganizationRole | undefined {
  const { data } = useOrganizations();
  return data?.find((organization) => organization.slug === orgSlug)?.role;
}
