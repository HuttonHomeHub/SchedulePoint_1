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

export abstract class MailService {
  abstract sendInvitation(email: InvitationEmail): Promise<void>;
}
