import { ApiProperty } from '@nestjs/swagger';
import type { AuditEvent as AuditEventRow } from '@prisma/client';
import type {
  AuditAction,
  AuditActorType,
  AuditChanges,
  AuditEvent,
  AuditOutcome,
} from '@repo/types';
import { AUDIT_ACTIONS, AUDIT_ACTOR_TYPES, AUDIT_OUTCOMES } from '@repo/types';

/**
 * Public representation of one recorded event (ADR-0072).
 *
 * Every field is a **copy taken at the time**, not a join: `actorLabel` and `subjectLabel` are the
 * email/name as they were, so renaming an account cannot rewrite history and deleting one does not
 * leave a trail of blanks. The reader gets what happened, not what is currently true.
 *
 * `ipAddress` and `userAgent` are recorded in the table and deliberately **not exposed**. They are
 * evidence for an investigation, but the log's ordinary readers are Org Admins looking at a
 * membership history, and a colleague's home IP on that screen is a privacy cost with no matching
 * benefit. Exposing them is a decision with its own scope, not a field to add by default.
 *
 * That decision lives in `@repo/types`' `AuditEvent`, which has no such fields — so `implements`
 * enforces it rather than describing it. (This said `Omit<AuditEvent, 'ipAddress' | 'userAgent'>`
 * first, which reads as "the shared type has them and this drops them" and compiled happily
 * because `Omit` of a key that does not exist is a no-op. A guarantee that cannot fail is not one.)
 */
export class AuditEventResponseDto implements AuditEvent {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time', description: 'When it happened (server clock, UTC).' })
  occurredAt!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'The organisation, or null for an event that happened before one was known.',
  })
  organizationId!: string | null;

  @ApiProperty({ enum: AUDIT_ACTIONS, description: 'What happened, from a closed vocabulary.' })
  action!: AuditAction;

  @ApiProperty({
    enum: AUDIT_OUTCOMES,
    description: 'How it ended. DENIED (a refused permission) is distinct from FAILURE (an error).',
  })
  outcome!: AuditOutcome;

  @ApiProperty({ enum: AUDIT_ACTOR_TYPES })
  actorType!: AuditActorType;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'The acting user, or null for an ANONYMOUS event such as a failed sign-in.',
  })
  actorUserId!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "The actor's email **as it was at the time** — a copy, never a live join.",
  })
  actorLabel!: string | null;

  @ApiProperty({ description: 'What was acted on, e.g. `ORG_MEMBER`, `PLAN`, `USER`.' })
  subjectType!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  subjectId!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "The subject's name/email as it was at the time.",
  })
  subjectLabel!: string | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description:
      'Allow-listed, redacted `{ before, after }` — or null where the action records no fields.',
  })
  changes!: AuditChanges | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The request id, so this row joins the log lines for the same request.',
  })
  correlationId!: string | null;

  static from(row: AuditEventRow): AuditEventResponseDto {
    const dto = new AuditEventResponseDto();
    dto.id = row.id;
    dto.occurredAt = row.occurredAt.toISOString();
    dto.organizationId = row.organizationId;
    dto.action = row.action as AuditAction;
    dto.outcome = row.outcome;
    dto.actorType = row.actorType;
    dto.actorUserId = row.actorUserId;
    dto.actorLabel = row.actorLabel;
    dto.subjectType = row.subjectType;
    dto.subjectId = row.subjectId;
    dto.subjectLabel = row.subjectLabel;
    // The column is Prisma `Json`; `redactChanges` is its only writer and normalises every leaf to
    // a scalar before it is stored, so the shape is known even though Prisma's type is not.
    dto.changes = (row.changes as AuditChanges | null) ?? null;
    dto.correlationId = row.correlationId;
    return dto;
  }
}
