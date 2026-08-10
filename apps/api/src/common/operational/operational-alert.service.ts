import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

import { postAlert } from './alert-dispatch';

/**
 * Re-exported, not redefined.
 *
 * The constant moved to `alert-dispatch.ts` with the POST it bounds (ADR-0087 M4); this keeps every
 * existing importer working. A second declaration here is how two timeouts drift apart.
 */
export { ALERT_TIMEOUT_MS } from './alert-dispatch';

/**
 * Which message failed.
 *
 * A `const` array rather than a bare union, so the vocabulary is enumerable at runtime — the
 * `AUDIT_ACTIONS` pattern, which buys closedness in TypeScript where `audit_events.action` is TEXT
 * in the database. `ck_mail_events_kind` is the backstop, not the type.
 *
 * `test` is **not** a member of `MailFailureKind` today (that union has three members,
 * `smtp-mail.service.ts:33`); it is the CQ-3 staff send, which does not exist yet. It is permitted
 * by the CHECK from day one, so M3 adds it with no migration at all — which is also why `kind` is
 * TEXT + CHECK rather than a Postgres enum: an enum label costs two migrations, a CHECK costs one.
 */
export const MAIL_EVENT_KINDS = [
  'invitation',
  'email_verification',
  'password_reset',
  'test',
] as const;
export type MailEventKind = (typeof MAIL_EVENT_KINDS)[number];

/** `FAILED` — the send rejected. `ABANDONED` — a send we stopped waiting for later failed anyway. */
export const MAIL_EVENT_OUTCOMES = ['FAILED', 'ABANDONED'] as const;
export type MailEventOutcome = (typeof MAIL_EVENT_OUTCOMES)[number];

export interface MailFailure {
  readonly kind: MailEventKind;
  readonly outcome: MailEventOutcome;
  readonly recipient: string;
  readonly error: unknown;
}

/**
 * An `error_class` the database will accept: a constructor name or an errno, nothing that could
 * carry an address.
 *
 * This is the producer half of `ck_mail_events_error_class_shape`. The constraint is the backstop
 * and reaching it is a bug — a rejected insert inside a `catch` block would turn one failed send
 * into two errors, which is the failure mode this whole service exists to avoid.
 */
const ERROR_CLASS_SHAPE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** RFC 5321: a 64-octet local part, `@`, a 255-octet domain. Matches `ck_mail_events_recipient_length`. */
const MAX_RECIPIENT_LENGTH = 320;

/**
 * Name the failure in a way that cannot leak the recipient.
 *
 * **Never `error.message`.** A transport error routinely embeds the address it failed to reach, in
 * whatever shape the relay chose — `550 5.1.1 <someone@example.com>: Recipient address rejected`.
 * The address belongs in the `recipient` column, where erasure can reach it; the same address inside
 * a free-text blob is a second, unreachable copy.
 *
 * Returns `null` rather than `'Unknown'` when nothing nameable is available: a thrown string or a
 * thrown `null` has no class, and inventing one dresses an absence up as a fact.
 */
export function errorClassOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;

  // `code` first: `ECONNREFUSED` says far more than `Error`, and nodemailer sets it on exactly the
  // transport failures an operator is reading this row to understand.
  const code: unknown = (error as { code?: unknown }).code;
  if (typeof code === 'string' && ERROR_CLASS_SHAPE.test(code)) return code.slice(0, 64);

  const name: unknown = error.constructor?.name;
  if (typeof name === 'string' && ERROR_CLASS_SHAPE.test(name)) return name.slice(0, 64);

  return null;
}

/**
 * Turns mail failures into a durable row and an alert somebody actually receives.
 *
 * **Why this exists.** ADR-0075 decided a failed send is the *operator's* signal and not the
 * caller's — surfacing it to the caller would make "that address was free" distinguishable from
 * "that address is taken" on an unauthenticated endpoint. That decision was right and it left the
 * operator with a log line nobody reads (`docs/TECH_DEBT.md` #100). This closes that half.
 *
 * **Three properties, and each one is a rule rather than a preference:**
 *
 * 1. **Nothing here is ever awaited by a caller.** `recordMailFailure` returns `void`, not a
 *    promise, so there is no way for a caller to accidentally couple a request to it. ADR-0075
 *    rejected a synchronous mail failure because it would create an enumeration oracle on sign-up;
 *    an awaited *alert* reintroduces exactly that latency and failure coupling one layer out.
 * 2. **It swallows its own failures.** Both the insert and the POST are wrapped. This runs inside a
 *    `catch` block that has already handled a failed send — a throw from here converts one handled
 *    failure into an unhandled one, which is strictly worse than the silence it replaced.
 * 3. **It is not an audit producer and must never call `AuditService.record()`.** A mail failure is
 *    an act by a machine, not by a person, so it does not belong in `audit_events` — and `record()`
 *    fails its caller when used outside a transaction, which is verbatim the defect ADR-0073 C4
 *    found in the interchange producer. Stated because the instinct will be to reach for it.
 *
 * **With `MAIL_ALERT_URL` absent, no POST is ever attempted** — but the row is still written, which
 * is deliberate: the durable history is useful on its own and costs nothing, while the alert is the
 * part that needs somewhere to go.
 *
 * **The coalescing window is per process, so N replicas would send N summaries for one incident.**
 * `HeartbeatService` already records the same caveat for pings and calls it harmless; here it is
 * less obviously so — an operator would get one message per replica rather than the single summary
 * the window exists to produce, which is a worse outcome than no coalescing at all if it ever
 * became the norm. Not reachable today: this deploys as one container (`CLAUDE.md` §17). Stated so
 * that whoever adds the second replica meets the consequence here rather than in their inbox.
 */
@Injectable()
export class OperationalAlertService implements OnApplicationShutdown {
  /** Total failures observed in the open window, including the one that opened it. */
  private windowTotal = 0;
  /** Which kinds failed in the open window, so the summary can name them. */
  private readonly windowKinds = new Set<MailEventKind>();
  /** Set while a window is open; `undefined` means the next failure alerts immediately. */
  private windowTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @InjectPinoLogger(OperationalAlertService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Record a failed send. **Returns `void` on purpose** — see the class docblock, property 1.
   */
  recordMailFailure(failure: MailFailure): void {
    void this.persist(failure);

    // **Only `FAILED` counts toward an alert, and one timed-out send produces BOTH outcomes.**
    // `send()` races the transport against `SEND_TIMEOUT_MS`: on timeout the caller's `catch` fires
    // immediately (FAILED, `error_class` from our own timeout `Error`) and the real transport error
    // may arrive minutes later, from a detached `.catch()`, as ABANDONED. Two rows, deliberately —
    // "we stopped waiting and it later failed anyway" and "it succeeded after we gave up" are
    // different facts and only the second row distinguishes them (ADR-0075's `send()` docblock).
    //
    // But they are ONE failed send. Counting both would inflate every alert during exactly the
    // outage the count is meant to size, and a number an operator learns to halve is worse than no
    // number. So the table records what happened and the alert counts sends that failed.
    if (failure.outcome === 'FAILED') this.noteForAlert(failure.kind);
  }

  /**
   * A window's timer must not outlive the process, and a leaked one fails silently — the test
   * process simply never exits, which reads as a hang rather than as a bug.
   */
  onApplicationShutdown(): void {
    if (this.windowTimer !== undefined) {
      clearTimeout(this.windowTimer);
      this.windowTimer = undefined;
    }
  }

  /**
   * The durable half. Failures are swallowed to a log line: an insert that rejects inside a `catch`
   * block would become the second error of one failed send.
   *
   * `correlationId` is deliberately **not** populated. The id exists — `genReqId` mints one per
   * request (`app.module.ts`) — but it is reachable only through nestjs-pino's request-scoped child
   * logger, and that module's `storage` is **not a public export** (verified against its
   * `index.d.ts`, which exports eight names and not that one). Threading it instead would mean
   * changing all three `MailService` port methods and every caller, which is a larger change than
   * this milestone. The column is nullable for exactly this reason and the `ABANDONED` path could
   * never carry one anyway, firing from a detached `.catch()` after the response has been sent.
   */
  private async persist(failure: MailFailure): Promise<void> {
    try {
      await this.prisma.mailEvent.create({
        data: {
          kind: failure.kind,
          outcome: failure.outcome,
          recipient: failure.recipient.slice(0, MAX_RECIPIENT_LENGTH),
          errorClass: errorClassOf(failure.error),
        },
      });
    } catch (error) {
      this.logger.warn(
        { event: 'mail_event.persist_failed', err: error, kind: failure.kind },
        'could not record a mail failure; the send failure itself was already handled',
      );
    }
  }

  /**
   * The coalescing half.
   *
   * A broken relay fails **every** send, so the useful message is "mail has been failing for ten
   * minutes, 43 times" and not forty-three copies of "a send failed". An alert channel that cries
   * wolf gets muted, and a muted channel is worth less than no channel, because it is believed to
   * be working.
   *
   * The **first** failure alerts immediately — the window bounds the repeats, never the
   * notification. If more arrive before it closes, one summary follows naming the total and the
   * kinds; if none do, nothing further is sent, so a single transient failure produces exactly one
   * message.
   */
  private noteForAlert(kind: MailEventKind): void {
    this.windowTotal += 1;
    this.windowKinds.add(kind);

    if (this.windowTimer !== undefined) return;

    void this.post(`SchedulePoint: ${kind} mail failed to send.`, { kind, count: 1 });

    this.windowTimer = setTimeout(() => {
      this.windowTimer = undefined;
      const total = this.windowTotal;
      const kinds = [...this.windowKinds].sort().join(', ');
      this.windowTotal = 0;
      this.windowKinds.clear();

      // Nothing further to say when the opening failure was the only one — a lone transient blip
      // should cost exactly one message, not one and a summary of it.
      if (total <= 1) return;

      const minutes = Math.round(this.config.mailAlertWindowMs / 60_000);
      void this.post(
        `SchedulePoint: ${total} mail sends failed in the last ${minutes} minutes (${kinds}).`,
        { kind: kinds, count: total },
      );
      // `unref` so a pending window cannot hold the process open. Without it a 10-minute timer keeps
      // Node alive for 10 minutes after the work is done, which in a test run reads as a hang.
    }, this.config.mailAlertWindowMs).unref();
  }

  /**
   * The mail half of one bounded, unawaited POST.
   *
   * The transport itself moved to {@link postAlert} in M4, so the retention sweep could reach the
   * operator's webhook without a `recordRetentionFailure` method inside a service whose whole
   * vocabulary is mail — which would make the name a lie. It went as a **function** rather than as
   * an injected service specifically so this class's constructor did not change: that is what let
   * `operational-alert.service.spec.ts` stay the before/after oracle with every assertion intact.
   *
   * What is left here is the only mail-specific part: which URL, which event name, and the
   * allow-listed `{ kind, count }` context. The body never names a recipient — this leaves the
   * system for a third-party chat service, which is data egress, and the address lives in
   * `mail_events` behind the staff guard where reading it is an audited act.
   */
  private async post(text: string, context: { kind: string; count: number }): Promise<void> {
    await postAlert({
      url: this.config.mailAlertUrl,
      text,
      event: 'mail.send_failed',
      alertName: 'mail_alert',
      context,
      logger: this.logger,
    });
  }
}
