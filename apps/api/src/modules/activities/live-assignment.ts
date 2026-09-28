import type { Prisma } from '@prisma/client';

/**
 * **One meaning of "a live resource assignment"** (spec FC-10, D8; ADR-0162 decision 6).
 *
 * An assignment counts when its own row is not soft-deleted **and** the resource it names is not
 * soft-deleted. An unassigned row and an assignment to a deleted resource both leave an activity
 * unresourced. `is_driving` is not consulted: any live assignment resources the activity.
 *
 * Spread by every Prisma reader of the fact — the health loader (metric 10 and the zero-duration
 * advisory) and, from M4, the activity rows' `resourceAssignmentCount` — so they cannot drift. The
 * staff diagnostic `zero-duration-tasks-resourced` is raw SQL and cannot spread this; it states the
 * same two `deleted_at IS NULL` conditions, and FC-10's agreement test (M4-T1) proves the readings
 * agree on data.
 *
 * The activity side (a live activity, in a given plan or among given ids) is the caller's, because
 * each caller scopes it differently.
 */
export function liveAssignmentWhere(organizationId: string): Prisma.ResourceAssignmentWhereInput {
  return {
    organizationId,
    deletedAt: null,
    resource: { deletedAt: null },
  };
}
