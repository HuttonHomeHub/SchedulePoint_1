import type { AuditAction, AuditActorType, AuditOutcome } from '@repo/types';

/**
 * The authentication events (ADR-0072), classified from Better Auth's own seams.
 *
 * **Why hooks and not a Nest interceptor.** The auth handler is mounted as a raw Node handler
 * outside Nest's DI and request pipeline (ADR-0003), so no guard, interceptor or decorator ever
 * sees these requests. Better Auth's own seams are the only ones that do.
 *
 * **Three seams, not one, and the reason is the point.** The obvious design — one `hooks.after`
 * switching on `ctx.path` — was written first and then read against `better-auth@1.6.25`'s
 * actual endpoints, where two of the four events turned out to be invisible to it:
 *
 * - `/sign-out` (`api/routes/sign-out.mjs`) reads the session **cookie** directly and never
 *   resolves a session onto the context, so an after-hook has no idea WHO signed out. It must be
 *   a `before` hook that resolves the session while the cookie is still valid.
 * - `/verify-email` (`api/routes/email-verification.mjs`) returns `{ status: true, user: null }`
 *   — the user is deliberately withheld — and, when a `callbackURL` is present (which is how the
 *   emailed link works), succeeds by **throwing a redirect**. An after-hook would see no user and
 *   a thrown error on the success path, and would record nothing while looking correct.
 *
 * Both would have been the ADR-0064 failure exactly: a producer that runs, looks right, and
 * silently records nothing. `emailVerification.afterEmailVerification(user)` fires on success
 * with the user in hand, so that is the seam used instead.
 *
 * Sign-up and sign-in DO work from `hooks.after`, including their failures: verified in
 * `dispatchAuthEndpoint`, when an endpoint throws an `APIError` the dispatcher catches it, assigns
 * it to `context.returned`, and still runs the after-hooks. A failed sign-in is therefore
 * observable — which matters more than the successes, because the row nobody can produce is the
 * one showing somebody trying.
 *
 * This module is pure so the classification can be tested without an auth instance, an HTTP
 * request or a database: the seam that is hardest to exercise end to end is the one whose rules
 * most need to be checkable.
 */

/** What a producer hands `AuditService.recordBestEffort` for an authentication event. */
export interface AuthAuditEvent {
  action: AuditAction;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorUserId: string | null;
  actorLabel: string | null;
  subjectType: 'USER';
  subjectId: string | null;
  subjectLabel: string | null;
}

/** The minimum an authenticated auth event needs to name its actor. */
export interface AuthAuditUser {
  id: string;
  email: string;
}

/** The subset of the after-hook context this reads. Narrowed so a test need not fake an instance. */
export interface AuthHookFacts {
  /** The endpoint path, e.g. `/sign-in/email`. Better Auth strips the `basePath`. */
  path: string;
  /** True when `context.returned` is an APIError — i.e. the endpoint refused. */
  failed: boolean;
  /** Set by `setNewSession` on a successful sign-in/sign-up. */
  newSession: { user: AuthAuditUser } | null;
  /** The request body, for the attempted address on a failed sign-in. Untrusted. */
  body: unknown;
}

/**
 * The address a failed sign-in was attempted against is **attacker-supplied**, and it is recorded
 * anyway — it is the entire content of the event, and "someone tried to sign in" without saying as
 * whom is not worth writing down. It is capped at the longest legal email address so a hostile
 * body cannot inflate the row, and it lands in `subject_label`, a first-class text column, rather
 * than in `changes` (whose allow-list deliberately records nothing for the auth family).
 */
const ATTEMPTED_LABEL_MAX = 320;

function attemptedEmail(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const email = (body as { email?: unknown }).email;
  if (typeof email !== 'string' || email === '') return null;
  return email.slice(0, ATTEMPTED_LABEL_MAX);
}

function forUser(action: AuditAction, user: AuthAuditUser): AuthAuditEvent {
  return {
    action,
    outcome: 'SUCCESS',
    actorType: 'USER',
    actorUserId: user.id,
    actorLabel: user.email,
    subjectType: 'USER',
    // The subject IS the actor for every authentication event: nobody else's account is touched.
    // Both are filled rather than one left null, so a reader querying by subject finds them too.
    subjectId: user.id,
    subjectLabel: user.email,
  };
}

/**
 * Map one `hooks.after` firing to an audit event, or `null` when there is nothing to record.
 *
 * `null` is the common case and deliberately so — every auth route fires this hook, including
 * `/get-session` on more or less every page load. Recording those would bury the events that
 * matter under traffic nobody will ever read.
 */
export function classifyAuthEvent(facts: AuthHookFacts): AuthAuditEvent | null {
  const user = facts.newSession?.user ?? null;

  switch (facts.path) {
    case '/sign-up/email':
      // A failed sign-up is a validation error, not a security event, and is not in the ADR-0072
      // vocabulary. Adding it would need a decision about what a rejected registration says.
      return facts.failed || !user ? null : forUser('auth.signed_up', user);

    case '/sign-in/email':
      if (!facts.failed) return user ? forUser('auth.signed_in', user) : null;
      return {
        action: 'auth.sign_in_failed',
        outcome: 'FAILURE',
        // ANONYMOUS, not USER: the whole point of a failed sign-in is that the claim was not
        // proven. `ck_audit_events_actor_shape` rejects an ANONYMOUS row carrying an actor id, so
        // this is not merely tidy — filling it in would lose the row.
        actorType: 'ANONYMOUS',
        actorUserId: null,
        actorLabel: null,
        subjectType: 'USER',
        subjectId: null,
        subjectLabel: attemptedEmail(facts.body),
      };

    default:
      return null;
  }
}

/**
 * The sign-out event, built from the session resolved in a **`before`** hook.
 *
 * Recorded on the way in rather than on the way out, because by the time the endpoint returns the
 * session is gone and nothing on the context says whose it was. The cost is that the row means "a
 * sign-out was requested by X" rather than "…completed"; the endpoint swallows its own
 * delete-session error and always returns success, so the distinction is not one a reader could
 * act on anyway.
 */
export function signedOutEvent(user: AuthAuditUser): AuthAuditEvent {
  return forUser('auth.signed_out', user);
}

/**
 * The email-verification event, built from `emailVerification.afterEmailVerification`.
 *
 * That callback fires only on the success path and receives the user, which is what makes it the
 * right seam — see the module docblock for why the after-hook is not.
 */
export function emailVerifiedEvent(user: AuthAuditUser): AuthAuditEvent {
  return forUser('auth.email_verified', user);
}
