import type { AuditAction } from '@repo/types';

import type { Principal } from '../../common/auth/principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import type { CascadeCounts } from '../../common/hierarchy/hierarchy-lifecycle.service';

import { auditActor } from './audit-actor';
import type { RecordAuditInput } from './audit.service';

/**
 * The four levels the delete/restore vocabulary covers.
 *
 * Activities joined with ADR-0073 C3.1. They were absent from M1 not because they are a different
 * shape — they are the same shape, which is why they are here rather than in a second builder —
 * but because M1 deliberately stopped at the hierarchy while the row rate was unmeasured.
 */
export type HierarchyAuditEntity = 'client' | 'project' | 'plan' | 'activity';

/**
 * The action names, keyed so a typo is a compile error rather than a row nobody can query. The
 * literal union also proves at build time that every combination exists in `AUDIT_ACTIONS`.
 */
const ACTIONS: Record<HierarchyAuditEntity, { deleted: AuditAction; restored: AuditAction }> = {
  client: { deleted: 'client.deleted', restored: 'client.restored' },
  project: { deleted: 'project.deleted', restored: 'project.restored' },
  plan: { deleted: 'plan.deleted', restored: 'plan.restored' },
  activity: { deleted: 'activity.deleted', restored: 'activity.restored' },
};

export interface HierarchyAuditParams {
  entity: HierarchyAuditEntity;
  kind: 'deleted' | 'restored';
  organizationId: string;
  id: string;
  name: string;
  /** Plans only — a plan's status is worth having beside the fact that it went away. */
  status?: string;
  /** Activities only — a plan can hold two activities with similar names but not two codes. */
  code?: string | null;
  /** Activities only — `TASK`, `MILESTONE`, `WBS_SUMMARY`… A summary's removal is a different act. */
  type?: string;
  /**
   * Activities only, and on the delete alone. By the time somebody reads "who removed this", the
   * activity is gone from every list they could look its plan up in.
   */
  planName?: string;
  /**
   * The thread that ties a cascade together. Without it a reader sees forty rows disappear and
   * cannot tell whether that was one action or forty; with it, one delete reads as one delete.
   */
  deleteBatchId: string | null;
  /**
   * What the cascade actually touched, taken from the lifecycle's **return value inside the
   * transaction** — so the numbers are the ones that happened, not a count re-derived afterwards
   * from rows a concurrent write could already have moved.
   *
   * Passed whole and flattened below rather than nested: the redactor's `normalise` reduces any
   * non-scalar to a type marker by design, so `counts: { … }` would record `[object]`. That is
   * spec §0.1(1) — the M1 promise that could not have worked.
   */
  counts?: CascadeCounts | undefined;
  principal: Principal;
  context?: RequestContext | undefined;
}

/**
 * Flatten a cascade's counts to scalar fields the allow-list can vet individually.
 *
 * Every level is emitted for every action; {@link ALLOWED_FIELDS} then keeps only the ones that
 * mean something for that action — an activity restore has no `projectCount` worth reading. That
 * is the allow-list doing the job it exists for rather than a second list to keep in step here.
 */
function flattenCounts(counts: CascadeCounts | undefined): Record<string, number> {
  if (!counts) return {};
  return {
    projectCount: counts.projects,
    planCount: counts.plans,
    activityCount: counts.activities,
    dependencyCount: counts.dependencies,
  };
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
  code,
  type,
  planName,
  deleteBatchId,
  counts,
  principal,
  context,
}: HierarchyAuditParams): RecordAuditInput {
  const facts = {
    name,
    ...(status === undefined ? {} : { status }),
    ...(code === undefined || code === null ? {} : { code }),
    ...(type === undefined ? {} : { type }),
    ...(planName === undefined ? {} : { planName }),
    ...(deleteBatchId === null ? {} : { deleteBatchId }),
    ...flattenCounts(counts),
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
