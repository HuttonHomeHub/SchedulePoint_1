/**
 * Transactional email port (ADR-0016). Features depend on this abstract class, never on a concrete
 * provider — the same seam pattern as Storage/Cache. Messages are always sent AFTER the owning
 * transaction commits (no external I/O inside a DB transaction).
 *
 * **Two adapters exist**, and which one is bound is decided by `MAIL_SMTP_URL` alone
 * ({@link MailModule}): `SmtpMailService` when a transport is configured, `LoggingMailService`
 * otherwise. This docblock said "v1 ships a logging stub" until 2026-08-04, long after the SMTP
 * adapter landed — the exact drift ADR-0058 exists to catch, and the reading that leads someone to
 * build a second mail path.
 */
export interface InvitationEmail {
  to: string;
  organizationName: string;
  role: string;
  /** Absolute URL the invitee follows to accept. */
  acceptUrl: string;
  expiresAt: Date;
}

/**
 * The address-ownership proof (Theme B2). Better Auth mints the URL and token; this port only
 * carries them, so the token's lifetime, single-use and hashing stay the library's business.
 */
export interface EmailVerificationEmail {
  to: string;
  /** Absolute URL that marks the address verified when followed. */
  verifyUrl: string;
}

/**
 * The account-recovery link (ADR-0074). Like {@link EmailVerificationEmail}, Better Auth mints the
 * URL and the token; this port only carries them.
 *
 * **The URL is a live credential.** Following it lets the holder set a new password, so unlike the
 * invitation's `acceptUrl` — which an Org Admin can legitimately read off a screen and hand over —
 * this one has no audience but the mailbox owner, and no adapter may write it to a log.
 */
export interface PasswordResetEmail {
  to: string;
  /** Absolute URL that lets the holder choose a new password. Single-use, ~1 hour. */
  resetUrl: string;
}

export abstract class MailService {
  abstract sendInvitation(email: InvitationEmail): Promise<void>;

  /**
   * Send the address-verification link.
   *
   * **Unlike an invitation, this message has no in-app fallback.** An Org Admin can always read an
   * invitation's accept URL off the screen and pass it on by another route. Nobody can do that
   * here — the URL exists only in the email. The recovery path is Better Auth's own resend endpoint.
   *
   * **That asymmetry is about RECOVERY, not about error handling, and this docblock said otherwise
   * until 2026-08-05.** It claimed the asymmetry "is the reason the two adapters treat failure
   * differently rather than sharing one rule". They do not treat it differently: all three messages
   * are swallowed and logged (`SmtpMailService`), and have been since ADR-0074 M5-T1 inverted this
   * one. What survives is that an undelivered verification is *worse* than an undelivered
   * invitation even though the code path is identical — which is a reason to watch the logs, not a
   * reason for the adapter to behave differently.
   *
   * The swallow sits at the **adapter** rather than at the call sites because two of the three
   * callers are Better Auth's, reached through `runInBackgroundOrAwait`, which would swallow it
   * anyway — depending on that library internal rather than holding the property here is how a
   * rejection became an existence oracle on `/send-verification-email` once already. See ADR-0075.
   */
  abstract sendEmailVerification(email: EmailVerificationEmail): Promise<void>;

  /**
   * Send the password-reset link.
   *
   * Shares `sendEmailVerification`'s asymmetry and for the same reason: there is **no in-app
   * fallback**. The URL exists only in the email, so an adapter that cannot deliver it has left the
   * account with no way back in — which is precisely why account recovery had to exist before
   * `AUTH_REQUIRE_EMAIL_VERIFICATION` could be turned on (ADR-0074).
   *
   * A send failure is **not** visible to the requester, and must not be: the endpoint answers
   * identically for a known and an unknown address, so any difference the caller can observe is an
   * enumeration oracle. That makes the operator-facing signal the only one there is —
   * `docs/TECH_DEBT.md` #94, whose cheap half (Better Auth's logger routed into Pino) is paid by
   * this milestone.
   */
  abstract sendPasswordReset(email: PasswordResetEmail): Promise<void>;
}
