import { OrganizationRole, type Permission } from './principal';

/**
 * The organisation-scoped role → permission mapping for SchedulePoint
 * (ADR-0012, ADR-0016). This is the single source `AuthContextService` uses to
 * populate a principal's per-membership permissions — the reference template
 * anticipates exactly this ("AuthContextService uses a mapping like this").
 *
 * Feature permission codes are namespaced by resource (`member:invite`). Add new
 * codes here as features land, granting them to the roles allowed to use them.
 * `organization:create` is intentionally absent: it is a **non-scoped** capability
 * (any authenticated user may create their first organisation), enforced at the
 * route without a role/scope check.
 */
export type OrgPermission =
  | 'organization:read'
  | 'member:read'
  | 'member:invite'
  | 'member:update_role'
  | 'member:remove'
  | 'invitation:read'
  | 'invitation:revoke';

/** Read access to the organisation and its member roster — every member has it. */
const MEMBER_BASELINE: readonly OrgPermission[] = ['organization:read', 'member:read'];

/** Full member/invitation administration — Org Admin only. */
const ADMIN: readonly OrgPermission[] = [
  'organization:read',
  'member:read',
  'member:invite',
  'member:update_role',
  'member:remove',
  'invitation:read',
  'invitation:revoke',
];

const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrgPermission[]> = {
  // Viewer / Contributor / Planner differ in plan & activity permissions (added
  // by later features); for org membership they are all read-only.
  [OrganizationRole.VIEWER]: MEMBER_BASELINE,
  [OrganizationRole.CONTRIBUTOR]: MEMBER_BASELINE,
  [OrganizationRole.PLANNER]: MEMBER_BASELINE,
  [OrganizationRole.ORG_ADMIN]: ADMIN,
};

/** Resolve the permissions a role grants (used when building the principal). */
export function permissionsForRole(role: OrganizationRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
