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
  // A LIVE cross-plan (inter-project) logic edge (M2, ADR-0045 §6). Linking two activities in
  // DIFFERENT plans of the same org is an explicit, independently-revocable capability granted to
  // Planner + Org Admin (the same "write" roles as `dependency:create`), so cross-plan linking is
  // auditable on its own. Reading/listing cross-plan links reuses `dependency:read` (every member);
  // deleting reuses the pen on the affected (successor) plan — no distinct delete code is needed.
  | 'dependency:link_cross_plan'
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
  | 'calendar:delete'
  // Baselines — named plan-of-record snapshots (M7, ADR-0025). Read/variance is
  // granted to every member (browse the record, see variance); capture/activate/
  // delete ("write") to Planner + Org Admin — the same rule as the hierarchy, and
  // deliberately NOT Contributor (freezing/choosing the plan of record ≠ reporting
  // progress). `activate` is a distinct write code so the taxonomy mirrors the action.
  | 'baseline:read'
  | 'baseline:create'
  | 'baseline:activate'
  | 'baseline:delete'
  // The org-scoped resource library + activity resource assignments (M7.1, ADR-0039).
  // Read is granted to every member (browse the resources a plan can use, see an
  // activity's assignments); create/update/delete of a resource and assign/unassign
  // ("write") to Planner + Org Admin — the same rule as the calendar library, and
  // deliberately NOT Contributor (managing resources / assignments ≠ reporting progress).
  // `resource:assign` covers the assignment lifecycle (assign / update units+driver /
  // unassign) as one code, mirroring how the assignment is one write surface.
  | 'resource:read'
  | 'resource:create'
  | 'resource:update'
  | 'resource:delete'
  | 'resource:assign'
  // Plan edit-lock coordination — the single-editor "pen" (ADR-0028). Acquiring/
  // heartbeating/releasing the lock and handing it off, and requesting control of
  // a live lock (the graceful peer hand-off, Q-A), are Planner + Org Admin — the
  // same "write" roles that can edit the schedule, NOT Contributor (reporting
  // progress is a separate, un-gated path). Immediate override of a *live* lock
  // (skipping the request/grace handshake) is Org Admin only. Reading lock status
  // needs no new code — it rides on `plan:read`, held by every member.
  | 'plan:acquire_lock'
  | 'plan:request_control'
  | 'plan:override_lock'
  // Earned Value / cost (EV2b, ADR-0042). Reading the plan's cost + Earned-Value analysis
  // (`cost:read`) is **Planner + Org Admin only** — commercially sensitive money (rates, budgets,
  // actual cost, BAC/EV/AC and the derived SPI/CPI/EAC) is deliberately NOT part of the
  // every-member `HIERARCHY_READ` schedule reads (a Viewer/Contributor sees dates, never cost).
  // Setting the cost inputs is already gated by the existing hierarchy writes (a cost rate rides
  // on `resource:update`, an activity budget on `activity:update`, an assignment cost on
  // `resource:assign`), so this is a **read** code only.
  | 'cost:read'
  // Notes — attributed, time-ordered note threads on entities (plans + activities now; the Notes
  // feature, ADR-0046). Reading is granted to every member (`note:read`, part of `HIERARCHY_READ`).
  // Writing (`note:create/update/delete`) is granted to **Contributor upward** — like
  // `activity:update_progress`, annotating the record is a non-structural act that reporters do, so
  // it deliberately does NOT ride on `HIERARCHY_WRITE` and needs no edit-lock pen. Edit/delete are
  // further constrained to the note's own author by the service layer (a row-level check RBAC can't
  // express); Org Admin moderation of others' notes is out of v1.
  | 'note:read'
  | 'note:create'
  | 'note:update'
  | 'note:delete';

/** Read the hierarchy — every member (Viewer upward) may browse the tree and its logic. */
const HIERARCHY_READ: readonly OrgPermission[] = [
  'client:read',
  'project:read',
  'plan:read',
  'activity:read',
  'dependency:read',
  'schedule:read',
  'calendar:read',
  'baseline:read',
  'resource:read',
  'note:read',
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
  'dependency:link_cross_plan',
  'schedule:calculate',
  'calendar:create',
  'calendar:update',
  'calendar:delete',
  'baseline:create',
  'baseline:activate',
  'baseline:delete',
  'resource:create',
  'resource:update',
  'resource:delete',
  'resource:assign',
];

/**
 * Update an activity's PROGRESS (status / % complete / actual dates) — Contributor
 * upward. Deliberately separate from `HIERARCHY_WRITE` so a Contributor can report
 * progress without being able to change logic, dates, or structure. Planners/Org
 * Admins also hold it (they can do everything).
 */
const PROGRESS_WRITE: readonly OrgPermission[] = ['activity:update_progress'];

/**
 * Write notes (create / update / delete) — Contributor upward, exactly like `PROGRESS_WRITE`.
 * Annotating an entity is non-structural (it touches no schedule dates/logic), so a Contributor may
 * add/edit/delete notes without the hierarchy write or the plan edit-lock pen (ADR-0046, Notes). The
 * service layer further constrains update/delete to the note's own author (a row-level check RBAC
 * cannot express). Planners/Org Admins also hold it (they can do everything).
 */
const NOTE_WRITE: readonly OrgPermission[] = ['note:create', 'note:update', 'note:delete'];

/**
 * Coordinate the plan edit-lock (ADR-0028) — acquire/heartbeat/release/hand-off own
 * lock and request control of another's live lock (the peer hand-off). Planner +
 * Org Admin (the schedule-editing roles), deliberately NOT Contributor.
 */
const LOCK_COORDINATE: readonly OrgPermission[] = ['plan:acquire_lock', 'plan:request_control'];

/** Immediately override a live edit-lock, skipping the grace handshake — Org Admin only. */
const LOCK_OVERRIDE: readonly OrgPermission[] = ['plan:override_lock'];

/**
 * Read the plan's cost + Earned-Value analysis (EV2b, ADR-0042) — Planner + Org Admin ONLY.
 * Commercially sensitive money is kept out of the every-member hierarchy reads; only these two
 * roles see rates/budgets/actual cost and the derived BAC/EV/AC/SPI/CPI/EAC.
 */
const COST_READ: readonly OrgPermission[] = ['cost:read'];

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
  [OrganizationRole.CONTRIBUTOR]: [
    ...MEMBER_BASELINE,
    ...HIERARCHY_READ,
    ...PROGRESS_WRITE,
    ...NOTE_WRITE,
  ],
  [OrganizationRole.PLANNER]: [
    ...MEMBER_BASELINE,
    ...HIERARCHY_READ,
    ...HIERARCHY_WRITE,
    ...PROGRESS_WRITE,
    ...NOTE_WRITE,
    ...LOCK_COORDINATE,
    ...COST_READ,
  ],
  [OrganizationRole.ORG_ADMIN]: [
    ...ADMIN,
    ...HIERARCHY_READ,
    ...HIERARCHY_WRITE,
    ...PROGRESS_WRITE,
    ...NOTE_WRITE,
    ...LOCK_COORDINATE,
    ...LOCK_OVERRIDE,
    ...COST_READ,
  ],
};

/** Resolve the permissions a role grants (used when building the principal). */
export function permissionsForRole(role: OrganizationRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
