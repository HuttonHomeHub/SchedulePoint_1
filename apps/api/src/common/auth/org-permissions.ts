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
  | 'invitation:revoke'
  // Client → Project → Plan hierarchy (feature: hierarchy CRUD). Read is granted
  // to every member; create/update/delete/restore ("write") to Planner + Org
  // Admin, matching the brief's "Planner has full CRUD on clients/projects/plans".
  | 'client:read'
  | 'client:create'
  | 'client:update'
  | 'client:delete'
  | 'client:restore'
  | 'project:read'
  | 'project:create'
  | 'project:update'
  | 'project:delete'
  | 'project:restore'
  | 'plan:read'
  | 'plan:create'
  | 'plan:update'
  | 'plan:delete'
  | 'plan:restore';

/** Read the hierarchy — every member (Viewer upward) may browse the tree. */
const HIERARCHY_READ: readonly OrgPermission[] = ['client:read', 'project:read', 'plan:read'];

/** Mutate the hierarchy (create/update/delete/restore) — Planner + Org Admin. */
const HIERARCHY_WRITE: readonly OrgPermission[] = [
  'client:create',
  'client:update',
  'client:delete',
  'client:restore',
  'project:create',
  'project:update',
  'project:delete',
  'project:restore',
  'plan:create',
  'plan:update',
  'plan:delete',
  'plan:restore',
];

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
  // Every member can read the org, its roster, and browse the hierarchy. Planner
  // adds hierarchy write; Org Admin adds member/invitation administration too.
  [OrganizationRole.VIEWER]: [...MEMBER_BASELINE, ...HIERARCHY_READ],
  [OrganizationRole.CONTRIBUTOR]: [...MEMBER_BASELINE, ...HIERARCHY_READ],
  [OrganizationRole.PLANNER]: [...MEMBER_BASELINE, ...HIERARCHY_READ, ...HIERARCHY_WRITE],
  [OrganizationRole.ORG_ADMIN]: [...ADMIN, ...HIERARCHY_READ, ...HIERARCHY_WRITE],
};

/** Resolve the permissions a role grants (used when building the principal). */
export function permissionsForRole(role: OrganizationRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
