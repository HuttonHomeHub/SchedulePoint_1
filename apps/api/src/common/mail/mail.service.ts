/**
 * Transactional email port (ADR-0016). Features depend on this abstract class,
 * never on a concrete provider — the same seam pattern as Storage/Cache. A
 * provider-backed adapter can be swapped in later without touching callers; v1
 * ships a logging stub. Messages are always sent AFTER the owning transaction
 * commits (no external I/O inside a DB transaction).
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

export abstract class MailService {
  abstract sendInvitation(email: InvitationEmail): Promise<void>;

  /**
   * Send the address-verification link.
   *
   * **Unlike an invitation, this message has no in-app fallback.** An Org Admin can always read an
   * invitation's accept URL off the screen and pass it on by another route, which is what makes
   * swallowing a failed invitation send safe. Nobody can do that here — the URL exists only in the
   * email. The recovery path is Better Auth's own resend endpoint, and that asymmetry is the reason
   * the two adapters treat failure differently rather than sharing one rule.
   */
  abstract sendEmailVerification(email: EmailVerificationEmail): Promise<void>;
}
