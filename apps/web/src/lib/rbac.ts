import type { OrganizationRole } from '@repo/types';

/** Roles allowed to create/update/delete hierarchy rows (mirrors the API's write RBAC). */
export const HIERARCHY_WRITER_ROLES: readonly OrganizationRole[] = ['PLANNER', 'ORG_ADMIN'];

/** Whether a role may manage clients/projects/plans (write). Pure — safe in loaders. */
export function canManageHierarchy(role: OrganizationRole | undefined): boolean {
  return role !== undefined && HIERARCHY_WRITER_ROLES.includes(role);
}
