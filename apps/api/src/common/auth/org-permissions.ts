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
  | 'plan:restore'
  // Activities are the leaf of the hierarchy. Read/create/update/delete/restore
  // follow the same Planner+Admin "write" rule as clients/projects/plans, BUT
  // `activity:update_progress` is separate: it is granted to Contributor upward so
  // a Contributor can move progress (status / % / actual dates) WITHOUT the logic
  // and definition write the full `activity:update` implies (brief §5).
  | 'activity:read'
  | 'activity:create'
  | 'activity:update'
  | 'activity:delete'
  | 'activity:restore'
  | 'activity:update_progress'
  // Dependencies (activity logic ties) are the edges of the schedule network.
  // Read is granted to every member (browse the logic); create/update/delete
  // ("write") to Planner + Org Admin — the same rule as the hierarchy, and
  // deliberately NOT Contributor (reporting progress ≠ editing the network).
  | 'dependency:read'
  | 'dependency:create'
  | 'dependency:update'
  | 'dependency:delete'
  // The CPM schedule (M6). Reading the computed schedule/summary is granted to
  // every member (`schedule:read`); triggering a recalculation (`schedule:calculate`)
  // is a Planner + Org Admin action — it rewrites the engine-owned columns of the
  // whole plan, so it follows the same "write" rule as the hierarchy, NOT Contributor.
  | 'schedule:read'
  | 'schedule:calculate'
  // The org-scoped working-day calendar library (M5, ADR-0024). Read is granted to
  // every member (browse the calendars a plan can use); create/update/delete
  // ("write") to Planner + Org Admin — the same rule as the hierarchy, and
  // deliberately NOT Contributor (managing calendars ≠ reporting progress).
  | 'calendar:read'
  | 'calendar:create'
  | 'calendar:update'
  | 'calendar:delete';

/** Read the hierarchy — every member (Viewer upward) may browse the tree and its logic. */
const HIERARCHY_READ: readonly OrgPermission[] = [
  'client:read',
  'project:read',
  'plan:read',
  'activity:read',
  'dependency:read',
  'schedule:read',
  'calendar:read',
];

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
  'activity:create',
  'activity:update',
  'activity:delete',
  'activity:restore',
  'dependency:create',
  'dependency:update',
  'dependency:delete',
  'schedule:calculate',
  'calendar:create',
  'calendar:update',
  'calendar:delete',
];

/**
 * Update an activity's PROGRESS (status / % complete / actual dates) — Contributor
 * upward. Deliberately separate from `HIERARCHY_WRITE` so a Contributor can report
 * progress without being able to change logic, dates, or structure. Planners/Org
 * Admins also hold it (they can do everything).
 */
const PROGRESS_WRITE: readonly OrgPermission[] = ['activity:update_progress'];

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
  // Every member can read the org, its roster, and browse the hierarchy.
  // Contributor adds activity-progress updates; Planner adds full hierarchy write;
  // Org Admin adds member/invitation administration on top.
  [OrganizationRole.VIEWER]: [...MEMBER_BASELINE, ...HIERARCHY_READ],
  [OrganizationRole.CONTRIBUTOR]: [...MEMBER_BASELINE, ...HIERARCHY_READ, ...PROGRESS_WRITE],
  [OrganizationRole.PLANNER]: [
    ...MEMBER_BASELINE,
    ...HIERARCHY_READ,
    ...HIERARCHY_WRITE,
    ...PROGRESS_WRITE,
  ],
  [OrganizationRole.ORG_ADMIN]: [
    ...ADMIN,
    ...HIERARCHY_READ,
    ...HIERARCHY_WRITE,
    ...PROGRESS_WRITE,
  ],
};

/** Resolve the permissions a role grants (used when building the principal). */
export function permissionsForRole(role: OrganizationRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
