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

/**
 * Roles allowed to write notes (mirrors the API's `note:create/update/delete` — Contributor upward,
 * the `PROGRESS_WRITE` grant surface, NOT `HIERARCHY_WRITE`; ADR-0046). Notes are collaborative
 * annotations, so the lowest write role can add them; edit/delete is further limited to the note's own
 * author (a row-level check the API enforces, surfaced in the UI by showing the controls only to the
 * author). Named separately from {@link canReportProgress} so the gate reads intentfully and the two
 * can diverge later without touching call sites.
 */
export const NOTE_WRITER_ROLES: readonly OrganizationRole[] = [
  'CONTRIBUTOR',
  'PLANNER',
  'ORG_ADMIN',
];

/** Whether a role may write notes (add; edit/delete is author-limited on top). Pure — safe in loaders. */
export function canWriteNotes(role: OrganizationRole | undefined): boolean {
  return role !== undefined && NOTE_WRITER_ROLES.includes(role);
}

/**
 * Whether a role may edit schedule **logic** (create/update/delete dependencies).
 * Mirrors the API's `dependency:create/update/delete` — the same Planner + Org
 * Admin roles as hierarchy write. A named helper so the gate reads intentfully
 * and can diverge later without touching call sites.
 */
export function canManageLogic(role: OrganizationRole | undefined): boolean {
  return canManageHierarchy(role);
}

/**
 * Whether a role may trigger a CPM recalculation (mirrors the API's
 * `schedule:calculate` — Planner + Org Admin, the same write roles). Named for
 * intent so the Recalculate gate reads clearly and can diverge later.
 */
export function canCalculateSchedule(role: OrganizationRole | undefined): boolean {
  return canManageHierarchy(role);
}

/**
 * Whether a role may import a schedule file as a new plan (mirrors the API's
 * `interchange:import` — Planner + Org Admin, the same hierarchy-write roles; ADR-0050).
 * A named helper so the "Import from file…" gate reads intentfully and can diverge later
 * without touching call sites. UX only — the API still enforces the permission + org scope.
 */
export function canImportSchedule(role: OrganizationRole | undefined): boolean {
  return canManageHierarchy(role);
}
