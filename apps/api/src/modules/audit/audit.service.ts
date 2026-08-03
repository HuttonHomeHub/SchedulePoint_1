import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditAction, AuditActorType, AuditOutcome } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { redactChanges } from './audit-redactor';
import { AuditRepository } from './audit.repository';

/** Everything a producer must say about an event. Nothing here is optional by accident. */
export interface RecordAuditInput {
  action: AuditAction;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  /** NULL for an organisation-less event (authentication happens before an org is known). */
  organizationId?: string | null;
  actorUserId?: string | null;
  /** The actor's name or email **at the time**, so a later rename cannot rewrite history. */
  actorLabel?: string | null;
  subjectType: string;
  subjectId?: string | null;
  subjectLabel?: string | null;
  /** Raw before/after. The redactor decides what survives; producers do not pre-filter. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Truncated to the column's practical bound; a spoofed 8 KB UA must not become an 8 KB row. */
const USER_AGENT_MAX = 512;

@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    @InjectPinoLogger(AuditService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Record an event **inside the caller's transaction**, and let a failure roll the whole thing
   * back.
   *
   * This is the opposite of how `MailService.sendInvitation` treats failure, and deliberately so.
   * A swallowed audit write produces the one outcome an audit log cannot survive: an action that
   * happened with no record that it did — and unlike a missing email, nothing on any screen
   * reveals it. Absence is indistinguishable from "nothing happened", so the log would be quietly
   * lying rather than visibly broken. Failing the business action is loud, recoverable by retry,
   * and leaves the database in a state where the record and the fact still agree.
   *
   * The cost is real and worth stating: while `audit_events` is unwritable, the mutations that
   * audit are refused. That is the intended trade for a table with no dependencies, no cascade
   * and one index pair — if it cannot take an INSERT, the database has larger problems than
   * membership changes.
   *
   * Pass `tx` from inside a `$transaction`. Calling without it still records, but the atomicity
   * argument above no longer holds — so the seam catalogue names which producers must pass one.
   */
  async record(input: RecordAuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    await this.repository.create(this.toRow(input), tx);
  }

  /**
   * Record an event that has **no transaction to join and must not fail its caller** — the
   * authentication family, fired from Better Auth's hook chain outside Nest's request pipeline.
   *
   * Here the trade inverts. There is no transaction to roll back, and refusing a sign-in because
   * the audit table is unavailable would turn a logging fault into an outage for everyone. So the
   * error is caught and logged at `error` with the action attached, which is the closest thing to
   * a record that remains available. That gap is named in ADR-0072 rather than hidden: auth rows
   * are best-effort, membership rows are not.
   */
  async recordBestEffort(input: RecordAuditInput): Promise<void> {
    try {
      await this.repository.create(this.toRow(input));
    } catch (error) {
      this.logger.error(
        { err: error, action: input.action, outcome: input.outcome },
        'audit event could not be recorded; the action itself was not affected',
      );
    }
  }

  private toRow(input: RecordAuditInput): Prisma.AuditEventUncheckedCreateInput {
    // Built by spread rather than by assigning `changes: … ?? undefined`, because
    // `exactOptionalPropertyTypes` distinguishes "absent" from "present and undefined" — and so
    // does Prisma: a nullable Json column given an explicit null stores a JSON `null` LITERAL,
    // which is a value, not an absence, and would then satisfy `changes IS NOT NULL`. Omitting the
    // key is the only way to leave the column genuinely NULL.
    const changes = redactChanges(input.action, input.before, input.after);

    return {
      // The cast is to Prisma's `InputJsonObject`, and it is the first Json column in this
      // schema, so the reason is recorded here rather than left to be rediscovered. Prisma types
      // a Json input as a recursive JSON-value union; `AuditChanges` is an interface whose leaves
      // are `unknown`, and neither an interface nor `unknown` is structurally assignable to that
      // union — TypeScript will not accept it however the type is spelt. The cast is safe because
      // `redactChanges` is the ONLY producer of this value and normalises every leaf to a string,
      // number, boolean or null before returning. If that guarantee ever weakens, the redactor's
      // tests fail before this line matters.
      ...(changes === null ? {} : { changes: changes as unknown as Prisma.InputJsonObject }),
      organizationId: input.organizationId ?? null,
      action: input.action,
      outcome: input.outcome,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel ?? null,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      subjectLabel: input.subjectLabel ?? null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
    };
  }
}
