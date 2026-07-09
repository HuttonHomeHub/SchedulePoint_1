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
