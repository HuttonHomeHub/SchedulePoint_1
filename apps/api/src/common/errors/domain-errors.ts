/**
 * Domain errors — framework-agnostic error types thrown by services. The global
 * exception filter maps them to HTTP status codes and the standard error
 * envelope, so services never depend on HTTP concerns.
 * See docs/BACKEND_ARCHITECTURE.md (Error handling).
 */

/** Base for all expected domain errors. `code` is stable and machine-readable. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The requested resource does not exist (→ 404). */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

/** A uniqueness or state conflict, incl. optimistic-lock failure (→ 409). */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

/** The principal is authenticated but not allowed to perform the action (→ 403). */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}

/** The request is semantically invalid beyond DTO validation (→ 422). */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

/** The target resource existed but is no longer available, e.g. expired (→ 410). */
export class GoneError extends DomainError {
  readonly code = 'GONE';
}

/**
 * A verification link whose token has aged out (→ 410). Its own code, not `GONE`, because the page
 * answering it offers a different remedy — send a new link — than any other expired thing does.
 */
export class VerificationLinkExpiredError extends DomainError {
  readonly code = 'VERIFICATION_LINK_EXPIRED';
}

/**
 * A verification link that cannot be used and is not merely old: malformed, forged, or naming an
 * account that no longer exists (→ 400, the default). One error for all three, so the answer never
 * narrates whether an account exists.
 */
export class VerificationLinkInvalidError extends DomainError {
  readonly code = 'VERIFICATION_LINK_INVALID';
}

/**
 * The action requires holding the plan edit-lock (the "pen") and the caller does
 * not, or the caller's lease was taken over / expired (→ 423 Locked). Distinct
 * from {@link ConflictError} (409): a 409 is a lost-update / uniqueness clash on a
 * specific row; a 423 is a coordination-layer refusal — someone else holds the
 * single-writer lock. See ADR-0028. The specific condition is carried in `details`
 * via a machine-readable `reason` (see `@repo/types` PlanEditLockReason).
 */
export class LockedError extends DomainError {
  readonly code = 'LOCKED';
}
