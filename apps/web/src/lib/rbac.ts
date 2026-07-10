import type { OrganizationRole } from '@repo/types';

/** Roles allowed to create/update/delete hierarchy rows (mirrors the API's write RBAC). */
export const HIERARCHY_WRITER_ROLES: readonly OrganizationRole[] = ['PLANNER', 'ORG_ADMIN'];

/** Whether a role may manage clients/projects/plans (write). Pure — safe in loaders. */
export function canManageHierarchy(role: OrganizationRole | undefined): boolean {
  return role !== undefined && HIERARCHY_WRITER_ROLES.includes(role);
}

/**
 * Roles allowed to report activity progress (mirrors the API's
 * `activity:update_progress` — Contributor upward). Contributor is the lowest
 * role with any write capability, so this is broader than {@link HIERARCHY_WRITER_ROLES}.
 */
export const PROGRESS_REPORTER_ROLES: readonly OrganizationRole[] = [
  'CONTRIBUTOR',
  'PLANNER',
  'ORG_ADMIN',
];

/** Whether a role may report progress (status / % / actual dates). Pure — safe in loaders. */
export function canReportProgress(role: OrganizationRole | undefined): boolean {
  return role !== undefined && PROGRESS_REPORTER_ROLES.includes(role);
}
