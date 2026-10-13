import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '../errors/domain-errors';

/**
 * Lock one active row and read its `version` — the check half of an opt-in, versioned delete
 * (`docs/TECH_DEBT.md` #450): the row is locked inside the delete's own transaction and before any
 * write, so the version compared is the version deleted. The activity form is gone: an activity has
 * descendants that other writers lock in id order, so its version is read from that ordered lock
 * instead (`lockActivityRowsInIdOrder`, #500). One statement per table because a table name cannot
 * be a bind parameter, and the soft-delete gate reads each template's text.
 */
export async function lockDependencyVersion(
  db: Prisma.TransactionClient,
  organizationId: string,
  id: string,
): Promise<number | null> {
  const rows = await db.$queryRaw<{ version: number }[]>`
    SELECT version FROM dependencies
    WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
    FOR NO KEY UPDATE
  `;
  return rows[0]?.version ?? null;
}

export async function lockAssignmentVersion(
  db: Prisma.TransactionClient,
  organizationId: string,
  id: string,
): Promise<number | null> {
  const rows = await db.$queryRaw<{ version: number }[]>`
    SELECT version FROM resource_assignments
    WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
    FOR NO KEY UPDATE
  `;
  return rows[0]?.version ?? null;
}

/**
 * Refuse the delete when the locked row is not at the version the caller read. A row that has gone
 * is a 404 (somebody else deleted it first); a different version is a 409 with the same reason the
 * undo strip reads as "changed" (ADR-0176 D3), and nothing is deleted, audited, stamped or recorded
 * because the throw rolls the transaction back before any of that runs.
 */
export function assertVersionMatches(
  current: number | null,
  expected: number,
  what: string,
  notFound: string,
): void {
  if (current === null) throw new NotFoundError(notFound);
  if (current !== expected) {
    throw new ConflictError(`This ${what} was changed elsewhere. Refresh and try again.`, {
      reason: 'STALE_VERSION',
    });
  }
}
