import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { createTransport, type Transporter } from 'nodemailer';

import type { OperationalAlertService } from '../operational/operational-alert.service';

import {
  type EmailVerificationEmail,
  type InvitationEmail,
  MailService,
  type PasswordResetEmail,
} from './mail.service';

/**
 * The one term an operator alerts on. Every mail failure carries it, whichever message failed, so a
 * single grep finds all three and the alert survives a copy edit of the human-readable sentence.
 *
 * It exists because the previously documented signal **cannot fire**. `docs/DEPLOYMENT.md` told
 * operators to watch for Better Auth's `Failed to run background task`, which is emitted by
 * `runInBackgroundOrAwait` when the promise it awaits rejects — but ADR-0074 M5-T1 made this adapter
 * catch first, so the promise resolves and that line is now unreachable from a mail failure. An
 * alert built exactly as instructed would have stayed silent through a total relay outage. See
 * ADR-0075 and `docs/TECH_DEBT.md` #94.
 *
 * A **constant, not a string literal at three call sites** — the whole value is that the three
 * records agree, and three literals drift one edit at a time.
 */
export const MAIL_SEND_FAILED = 'mail.send_failed';

/**
 * Which message failed. Deliberately coarse: an operator wants "reset mail is broken" (users are
 * locked out now) distinguished from "invitations are broken" (they have an in-app fallback), and
 * nothing finer than that.
 */
export type MailFailureKind = 'invitation' | 'email_verification' | 'password_reset';

/**
 * How long the boot-time handshake may take before it is called unreachable (ADR-0075 M1).
 *
 * Five seconds is a deploy-time budget, not a request one: it runs once, off the bootstrap
 * lifecycle, and never blocks readiness — so the only thing it costs is that much of a container
 * start in the worst case. Long enough for a cold TLS handshake to a distant relay; short enough
 * that a black-holed port does not make a restart look hung.
 */
export const VERIFY_TIMEOUT_MS = 5_000;

/**
 * How long a single message may take before the send is abandoned (ADR-0075 M4).
 *
 * **This exists because the milestone's own central claim was wrong.** The spec's risk table said
 * "no request-path cost", and the ADR reasoned about mail as if it were off to one side. It is not:
 * Better Auth's `runInBackgroundOrAwait` **awaits** the promise unless
 * `advanced.backgroundTasks.handler` is configured, this application configures no such handler,
 * and `InvitationsService` awaits its send directly in the request handler. So four endpoints —
 * sign-up, request-password-reset, send-verification-email and invitation-create — sit on a live
 * SMTP round trip, bounded only by nodemailer's defaults: **30 s greeting, 2 min connection,
 * 10 min socket**. A black-holed relay port does not merely fail to deliver mail; it holds the
 * request open for ten minutes and occupies a worker while it does.
 *
 * Ten seconds is chosen against what a healthy send costs rather than what a user will tolerate: a
 * warm relay answers in well under a second, and a cold TLS handshake to a distant one in a couple.
 * Anything past ten is a transport in trouble, and the correct response to a transport in trouble
 * is the same as to one that refused outright — log `mail.send_failed` and let the caller through.
 * The bound is generous enough that it should never fire in ordinary operation, which is the
 * property that makes it safe to apply to all three messages uniformly.
 *
 * **It bounds the wait, not the send.** Nodemailer keeps working after we stop listening, so a
 * message that was merely slow may still arrive. That asymmetry is deliberate: abandoning the wait
 * is free and abandoning the delivery is not.
 */
export const SEND_TIMEOUT_MS = 10_000;

/**
 * SMTP adapter for {@link MailService} — the first real transport (TECH_DEBT: mail transport,
 * Theme B). Selected by {@link MailModule} only when `MAIL_SMTP_URL` is configured; absent, the
 * logging stub stays in place and behaviour is byte-for-byte today's.
 *
 * **SMTP rather than a provider SDK.** Postmark, SES, Resend, Fastmail and a self-hosted relay all
 * speak it, so the provider is an env var rather than a dependency and swapping one costs a config
 * change instead of a new adapter. It is also the boring option, which for something that must work
 * unattended is the point.
 */
@Injectable()
export class SmtpMailService extends MailService {
  private readonly transporter: Transporter;

  /**
   * `alerts` is **optional**, and that is the rollback contract rather than laziness: without it
   * this adapter behaves exactly as it did before staff-console M1 — the failure is logged and
   * nothing else. Every existing test that constructs this class by hand therefore keeps compiling
   * and keeps asserting the same thing, which is what makes those suites a before/after oracle for
   * this change rather than casualties of it.
   */
  constructor(
    private readonly from: string,
    smtpUrl: string,
    @InjectPinoLogger(SmtpMailService.name) private readonly logger: PinoLogger,
    private readonly alerts?: OperationalAlertService,
  ) {
    super();
    this.transporter = createTransport(smtpUrl);
  }

  /**
   * One place the three public methods hand a failure to the operational record, so the three
   * records agree — the `MAIL_SEND_FAILED` reasoning applied one layer out. Three call sites
   * assembling this object independently is how two of them end up carrying a different `kind`.
   */
  private recordFailure(kind: MailFailureKind, to: string, error: unknown): void {
    this.alerts?.recordMailFailure({ kind, outcome: 'FAILED', recipient: to, error });
  }

  /**
   * One bounded SMTP handshake (ADR-0075 M1). See {@link MailService.verifyTransport} for what a
   * success does not prove — that list is load-bearing and is not repeated here.
   *
   * **The timeout is ours, raced, rather than the transport's own setting.** Nodemailer exposes
   * connection/greeting/socket timeouts, but they are three separate options whose defaults differ
   * by transport and any of which a `MAIL_SMTP_URL` query parameter can override — so trusting them
   * means the boot delay is set by whoever wrote the connection string. A relay that accepts the TCP
   * connection and then never speaks is the realistic hang, and it is precisely the case a
   * connection timeout does not cover. `Promise.race` gives one number this file controls.
   */
  override async verifyTransport(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.transporter.verify(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`SMTP verification timed out after ${VERIFY_TIMEOUT_MS} ms`)),
            VERIFY_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      // Without this the pending timer keeps the event loop alive for its full duration on the
      // success path — which in a test run is a hang, and in production delays nothing but is
      // untidy. `finally` covers the throw path too.
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * **A failed send must never fail the invitation.** Until now the port could not fail, because
   * logging cannot fail — so every caller was written against a method that always resolves, and
   * `InvitationsService` creates the row and then calls this. Letting a network error propagate
   * would silently make invitations start failing whenever a mail server hiccuped, and the invite
   * that did get created would be rolled back or orphaned depending on the caller.
   *
   * So the error is logged with enough context to chase and then swallowed. That is safe here and
   * not merely convenient: the accept URL is **also** returned in the create response and shown in
   * the admin UI, so an Org Admin can always hand it over by another route. The email is a
   * convenience over an existing path, not the only way through — which is exactly the property
   * that makes swallowing correct rather than lossy.
   */
  async sendInvitation(email: InvitationEmail): Promise<void> {
    try {
      await this.send({
        kind: 'invitation',
        to: email.to,
        subject: `You have been invited to ${email.organizationName} on SchedulePoint`,
        text: invitationText(email),
      });
      this.logger.info(
        { to: email.to, organizationName: email.organizationName },
        'invitation email sent',
      );
    } catch (error) {
      // Never log `acceptUrl` — it carries the one-time token, and logs are retained and shipped.
      this.logger.error(
        {
          event: MAIL_SEND_FAILED,
          kind: 'invitation',
          err: error,
          to: email.to,
          organizationName: email.organizationName,
        },
        'invitation email failed to send; the invitation itself was created and its accept URL is available in the app',
      );
      this.recordFailure('invitation', email.to, error);
    }
  }

  /**
   * Verification. **Swallows and logs, and that is an enumeration control rather than tidiness**
   * (ADR-0074 M5-T1, security review). It used to throw.
   *
   * **The throw was an account-existence oracle on a route anyone can call anonymously.** Better
   * Auth's `/send-verification-email` goes to real trouble to be uniform: for an unknown or
   * already-verified address it mints a **throwaway token** so the CPU work matches, then holds
   * every response to a 500 ms floor so the timings match
   * (`api/routes/email-verification.mjs:104-117`). And then, at the end of that same block,
   * `if (error) throw error` — so a transport failure reaches `better-call`'s router, which turns a
   * non-`APIError` into a bare **500**, distinguishable from the uniform 200 that every other
   * branch returns. A caller submitting a candidate address gets 200 for "unknown", 200 for
   * "already verified", and an error for "exists, unverified, and delivery to this recipient just
   * failed" — which is precisely the oracle this epic exists to keep closed, handed back by the one
   * branch that was never analysed.
   *
   * The sign-up call site was analysed and is safe (`runInBackgroundOrAwait`, `sign-up.mjs:246`),
   * which is why the previous docblock's reasoning read as sound. It was sound about sign-up and
   * silent about resend — the ADR-0064/0067 shape, one call site examined and its neighbour not.
   *
   * Swallowing costs the operator nothing they had: the error is logged **here**, with context, in
   * the Pino stream — strictly better than the `console.error` fallthrough it previously took
   * (`docs/TECH_DEBT.md` #94). The user-facing recovery path is unchanged: press resend again.
   */
  async sendEmailVerification(email: EmailVerificationEmail): Promise<void> {
    try {
      // Never log `verifyUrl` — it carries the token, and logs are retained and shipped.
      await this.send({
        kind: 'email_verification',
        to: email.to,
        subject: 'Confirm your email address for SchedulePoint',
        text: verificationText(email),
      });
      this.logger.info({ to: email.to }, 'email-verification link sent');
    } catch (error) {
      this.logger.error(
        { event: MAIL_SEND_FAILED, kind: 'email_verification', err: error, to: email.to },
        'email-verification email failed to send; the account exists but cannot be verified until a resend succeeds',
      );
      this.recordFailure('email_verification', email.to, error);
    }
  }

  /**
   * Password reset (ADR-0074). Swallows and logs, matching {@link sendEmailVerification}.
   *
   * **This one is not currently an oracle, and it is swallowed anyway — deliberately.** Better Auth
   * calls `sendResetPassword` through `runInBackgroundOrAwait` (`api/routes/password.mjs:82`), so a
   * rejection here is already caught before it can reach the response, and
   * `/request-password-reset` stays uniform for a known and an unknown address.
   *
   * That safety rests entirely on a **library internal**, one line in a file this repo does not
   * own. Its sibling above was safe by the same reasoning at one call site and an oracle at
   * another, and nothing in this codebase would have said so. Depending on the property rather
   * than holding it is how that happened; holding it here costs one `try` and removes the
   * dependency. The failure is logged with context in the Pino stream either way.
   */
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    try {
      // Never log `resetUrl` — it is a live single-use credential, and logs are retained/shipped.
      await this.send({
        kind: 'password_reset',
        to: email.to,
        subject: 'Reset your SchedulePoint password',
        text: passwordResetText(email),
      });
      this.logger.info({ to: email.to }, 'password-reset link sent');
    } catch (error) {
      this.logger.error(
        { event: MAIL_SEND_FAILED, kind: 'password_reset', err: error, to: email.to },
        'password-reset email failed to send; the caller was answered uniformly and cannot tell',
      );
      this.recordFailure('password_reset', email.to, error);
    }
  }

  /**
   * One message, with a bound this file controls (ADR-0075 M4). Every send goes through here; there
   * is no second path, which is the property that makes the bound a fact rather than a convention.
   *
   * **On timeout the wait is abandoned, not the send.** Nodemailer's promise keeps running, so a
   * `.catch()` is attached to it — without one, a rejection arriving after the race has settled is
   * an *unhandled* rejection, and Node's default for that is to terminate the process. A bound
   * added to keep a mail outage from hanging a request would then have converted the same outage
   * into a crash loop, which is a strictly worse failure than the one it set out to fix.
   *
   * The abandoned send is logged separately (`abandoned: true`), because "we stopped waiting and it
   * later failed anyway" and "it succeeded four minutes after we gave up" are different facts and
   * an operator reading `mail.send_failed` deserves to know which happened.
   */
  private async send(message: {
    kind: MailFailureKind;
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const { kind, ...envelope } = message;
    const pending = this.transporter.sendMail({ from: this.from, ...envelope });
    let timedOut = false;
    // Attached up-front, before anything can reject, so the rejection is handled whichever way the
    // race settles. Attaching it inside the catch would be too late in principle and would also
    // double-log the ordinary failure, which reaches the caller's own catch already.
    pending.catch((late: unknown) => {
      if (!timedOut) return;
      this.logger.warn(
        { event: MAIL_SEND_FAILED, abandoned: true, kind, err: late, to: message.to },
        'an abandoned send later failed; the caller was already answered',
      );
      this.alerts?.recordMailFailure({
        kind,
        outcome: 'ABANDONED',
        recipient: message.to,
        error: late,
      });
    });

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new Error(`SMTP send timed out after ${SEND_TIMEOUT_MS} ms`));
          }, SEND_TIMEOUT_MS);
        }),
      ]);
    } finally {
      // Same reason as `verifyTransport`: a live timer holds the event loop open for its full
      // duration on the success path.
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

/**
 * Mirrors the two above: plain text, one action, no template machinery.
 *
 * The closing line is deliberate. A reset email arriving unrequested is the one signal an account
 * holder gets that somebody is probing their address, and "you can ignore this" alone reads as
 * routine — so it says the password is unchanged, which is the fact that makes ignoring it safe.
 */
function passwordResetText(email: PasswordResetEmail): string {
  return [
    'Choose a new password for your SchedulePoint account:',
    '',
    email.resetUrl,
    '',
    'This link can be used once and expires in about an hour.',
    '',
    'If you did not ask to reset your password, you can ignore this message — your password has ' +
      'not been changed.',
  ].join('\n');
}

/** Mirrors {@link invitationText}: plain text, one action, no template machinery. */
function verificationText(email: EmailVerificationEmail): string {
  return [
    'Confirm your email address to finish setting up your SchedulePoint account:',
    '',
    email.verifyUrl,
    '',
    'If you did not create an account, you can ignore this message.',
  ].join('\n');
}

/**
 * Plain text only, deliberately. An HTML part would need a template, a layout, escaping and a
 * plain-text fallback anyway, and none of that has a consumer yet — the first email this system
 * sends should be the smallest thing that works. Add HTML when there is a second message to justify
 * the machinery.
 */
function invitationText(email: InvitationEmail): string {
  return [
    `You have been invited to join ${email.organizationName} on SchedulePoint as ${email.role}.`,
    '',
    'Accept the invitation:',
    email.acceptUrl,
    '',
    `This invitation expires on ${email.expiresAt.toISOString().slice(0, 10)}.`,
    '',
    'If you were not expecting this invitation, you can ignore this message.',
  ].join('\n');
}
