import type { AuditAction } from '@repo/types';

import type { Principal } from '../../common/auth/principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';

import { auditActor } from './audit-actor';
import type { RecordAuditInput } from './audit.service';

/** The three levels the delete/restore vocabulary covers. Activities are deliberately absent. */
export type HierarchyAuditEntity = 'client' | 'project' | 'plan';

/**
 * The action names, keyed so a typo is a compile error rather than a row nobody can query. The
 * literal union also proves at build time that every combination exists in `AUDIT_ACTIONS`.
 */
const ACTIONS: Record<HierarchyAuditEntity, { deleted: AuditAction; restored: AuditAction }> = {
  client: { deleted: 'client.deleted', restored: 'client.restored' },
  project: { deleted: 'project.deleted', restored: 'project.restored' },
  plan: { deleted: 'plan.deleted', restored: 'plan.restored' },
};

export interface HierarchyAuditParams {
  entity: HierarchyAuditEntity;
  kind: 'deleted' | 'restored';
  organizationId: string;
  id: string;
  name: string;
  /** Plans only — a plan's status is worth having beside the fact that it went away. */
  status?: string;
  /**
   * The thread that ties a cascade together. Without it a reader sees forty rows disappear and
   * cannot tell whether that was one action or forty; with it, one delete reads as one delete.
   */
  deleteBatchId: string | null;
  principal: Principal;
  context?: RequestContext | undefined;
}

/**
 * Build the audit input for a hierarchy soft delete or restore.
 *
 * ONE builder for all six events rather than six inline blocks across three services, for the
 * ADR-0065 `routeOrthogonal` reason: three copies of the same shape drift, and the drift here
 * would be invisible — each service looks right on its own, and only someone comparing a deleted
 * client against a deleted project would notice one carries a field the other does not.
 */
export function hierarchyAuditEvent({
  entity,
  kind,
  organizationId,
  id,
  name,
  status,
  deleteBatchId,
  principal,
  context,
}: HierarchyAuditParams): RecordAuditInput {
  const facts = {
    name,
    ...(status === undefined ? {} : { status }),
    ...(deleteBatchId === null ? {} : { deleteBatchId }),
  };

  return {
    action: ACTIONS[entity][kind],
    outcome: 'SUCCESS',
    organizationId,
    subjectType: entity.toUpperCase(),
    subjectId: id,
    subjectLabel: name,
    // The facts go in `before` for a delete and `after` for a restore, which is the direction the
    // change actually ran: a deleted row's name is what it WAS, a restored row's is what it now
    // is again. Putting them on BOTH sides would assert a name change that did not happen.
    //
    // The redactor still normalises the result to `{ before, after }` with an empty object on the
    // side this omits — `AuditChanges` documents both keys as always present so a reader can tell
    // "set from nothing" from "unchanged". Empty is the correct reading here; identical is not.
    ...(kind === 'deleted' ? { before: facts } : { after: facts }),
    ...auditActor(principal, context),
  };
}
