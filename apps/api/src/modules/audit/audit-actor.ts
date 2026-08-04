import type { Principal } from '../../common/auth/principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';

import type { RecordAuditInput } from './audit.service';

/** The actor half of a {@link RecordAuditInput}, plus the request evidence that goes with it. */
type ActorFields = Pick<
  RecordAuditInput,
  'actorType' | 'actorUserId' | 'actorLabel' | 'correlationId' | 'ipAddress' | 'userAgent'
>;

/**
 * Build the actor block for a signed-in caller.
 *
 * `actorLabel` is the caller's email **as it is right now**, copied into the row rather than
 * joined to at read time. A row that renders its actor by following `actorUserId` shows today's
 * name for yesterday's action, so renaming an account silently rewrites history — and a deleted
 * account leaves an audit trail of blanks. Both are the failure an audit log exists to prevent.
 *
 * The email is preferred over the name because it is the identifier an administrator can act on;
 * `Principal` carries both as best-effort display data (never an authorisation input), and either
 * may be absent for a principal built from id and memberships alone.
 */
export function auditActor(principal: Principal, context?: RequestContext): ActorFields {
  return {
    actorType: 'USER',
    actorUserId: principal.userId,
    actorLabel: principal.email ?? principal.name ?? null,
    correlationId: context?.correlationId ?? null,
    ipAddress: context?.ipAddress ?? null,
    userAgent: context?.userAgent ?? null,
  };
}
