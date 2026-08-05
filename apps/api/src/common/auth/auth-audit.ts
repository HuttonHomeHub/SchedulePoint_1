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
 * **The credential events (ADR-0074) repeat the lesson a third time.** Each of the three was driven
 * against a real running instance before its producer was written, rather than assumed from the two
 * that already worked, and each needed something different:
 *
 * - `/change-password` fires the after-hook and reports failure correctly — but sets **no new
 *   session**, so `newSession?.user` is null on the success path. The user is in
 *   `context.returned` instead (`{ token, user }`). Reusing the sign-in pattern here would have
 *   recorded nothing on every successful password change.
 * - `/request-password-reset` answers `{ status: true, message: 'If this email exists…' }`
 *   **identically** for a known and an unknown address, so `failed` is always false and there is no
 *   user anywhere. It takes the attempted address off the body and the ADR-0073 C2.2 attribution
 *   shape — which is also what keeps the row from becoming the enumeration oracle the endpoint
 *   itself so carefully is not.
 * - `/reset-password` returns `{ status: true }` and nothing else. The after-hook cannot name whose
 *   password changed, so the event is built from `emailAndPassword.onPasswordReset`, which fires on
 *   success with the user in hand — the same shape as `afterEmailVerification`, for the same
 *   reason.
 *
 * Three routes, three different seams, and the naive reading was wrong for all three.
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
  /**
   * The value the endpoint returned, for routes that carry the user there rather than in a new
   * session. `/change-password` is the one that needs it (ADR-0074): it succeeds without minting a
   * session, so `newSession` is null and `{ token, user }` is the only place the user appears.
   */
  returned: unknown;
  /** The request body, for the attempted address on a failed sign-in. Untrusted. */
  body: unknown;
}

/**
 * Pull a user off `context.returned`. Defensive because `returned` is `unknown` by contract and
 * shaped differently per endpoint — a wrong guess here would throw inside a hook that must never
 * break the request it is observing.
 */
function returnedUser(returned: unknown): AuthAuditUser | null {
  if (typeof returned !== 'object' || returned === null) return null;
  const user = (returned as { user?: unknown }).user;
  if (typeof user !== 'object' || user === null) return null;
  const { id, email } = user as { id?: unknown; email?: unknown };
  return typeof id === 'string' && typeof email === 'string' ? { id, email } : null;
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

    case '/change-password': {
      // A failed change is a wrong current password. It is NOT recorded, for the same reason a
      // failed sign-up is not: the session already proves who the caller is, so a rejected attempt
      // says only that somebody mistyped. The blast-radius test catches the *successful* change.
      if (facts.failed) return null;
      // `newSession` is null here even on success — the endpoint mints no session unless
      // `revokeOtherSessions` was sent — so the user comes off `returned`. Reusing the sign-in
      // pattern would silently record nothing on every password change; verified against a running
      // instance before this line was written.
      const changed = returnedUser(facts.returned);
      return changed ? forUser('auth.password_changed', changed) : null;
    }

    case '/request-password-reset':
      // Never `failed`: the endpoint answers `{ status: true, message: 'If this email exists…' }`
      // for a known and an unknown address alike, and there is no user on the context in either
      // case. So this is built entirely from the attempted address — the same shape as a failed
      // sign-in, and for the same reason. `attributeAttemptedAddress` fills `subjectId` when the
      // address is real, which is what makes the row readable by the account it named and by
      // nobody else (ADR-0073 C2.2).
      return {
        action: 'auth.password_reset_requested',
        // SUCCESS, not FAILURE: the request was accepted. Whether it named a real account is not
        // something this row asserts, and must not be — that is the oracle the endpoint avoids.
        outcome: 'SUCCESS',
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
 * Resolve an address to a user id. Bound in `AuthModule` to a single indexed `users` read.
 *
 * **It must never reject** — the same contract as `recordAuthEvent`, for the same reason: this runs
 * on the sign-in path, and turning a lookup fault into a refused sign-in would make an audit
 * nicety an outage. {@link attributeAttemptedAddress} guards it anyway; see there.
 */
export type FindUserIdByEmail = (email: string) => Promise<string | null>;

/**
 * The events whose `subjectLabel` is an **attempted, attacker-supplied address** rather than a
 * proven identity, and which therefore need attribution to become readable at all.
 *
 * Both are ANONYMOUS rows carrying no organisation, so neither read endpoint can reach them without
 * a `subjectId` — they would be visible only from `psql`. `auth.password_reset_requested` joined
 * the set with ADR-0074 for exactly the reason `auth.sign_in_failed` is in it: an unrequested one
 * is the signal that somebody is probing an address, and the person who needs to see it is the
 * account holder.
 */
const ATTEMPTED_ADDRESS_ACTIONS = new Set<AuditAction>([
  'auth.sign_in_failed',
  'auth.password_reset_requested',
]);

/**
 * Fill `subjectId` on an attempted-address event when the address belongs to a real account
 * (ADR-0073 C2.2). Every other event passes through untouched.
 *
 * This is what makes a failed sign-in **readable by the person it was aimed at**: both read
 * endpoints filter on `actor_user_id` / `organization_id`, and this row has neither, so without a
 * subject it is reachable only from `psql` (TECH_DEBT #91).
 *
 * **Forward-only, permanently.** Rows written before this existed cannot be attributed later: the
 * table refuses `UPDATE` at the database (ADR-0072), by design. Nor should a read-time join on the
 * label be added to "fix" them — it would re-derive history from whatever the address maps to
 * *today*, so a reassigned or corrected address would silently reattribute somebody else's probe.
 * The discontinuity is the honest shape.
 *
 * **The lookup runs on both branches and changes no response.** Whether the address exists or not,
 * the same query executes and the sign-in's own reply is untouched — so this cannot be read as an
 * account-existence oracle. The only place the answer surfaces is that account holder's own feed.
 */
export async function attributeAttemptedAddress(
  event: AuthAuditEvent,
  findUserIdByEmail: FindUserIdByEmail,
  normalize: (email: string) => string,
): Promise<AuthAuditEvent> {
  if (!ATTEMPTED_ADDRESS_ACTIONS.has(event.action) || event.subjectLabel === null) return event;

  try {
    const subjectId = await findUserIdByEmail(normalize(event.subjectLabel));
    // A miss is the common and correct outcome — most probes name an address nobody registered —
    // so an unattributed row is evidence, not a failure to attribute.
    return subjectId === null ? event : { ...event, subjectId };
  } catch {
    // Deliberately fail-open, and NOT the fail-closed shape its siblings use. A reader who finds
    // only the behaviour will want to "fix" this: don't. The alternative to an unattributed audit
    // row here is a refused sign-in. The port is contracted never to reject and logs its own
    // faults; this is the second line, not the first.
    return event;
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

/**
 * The completed-reset event, built from `emailAndPassword.onPasswordReset` (ADR-0074).
 *
 * **Not `hooks.after`,** and this was driven rather than assumed: `/reset-password` returns
 * `{ status: true }` and nothing else, so the after-hook fires with no user anywhere on the context
 * and cannot say whose password changed. `onPasswordReset` fires on the success path with the user
 * in hand — the same shape as `afterEmailVerification`, and the third route in this file to need
 * its own seam.
 *
 * The actor is the user, even though the request carried no session: completing a reset proves
 * control of the mailbox, which is the whole basis on which the new password was accepted.
 */
export function passwordResetCompletedEvent(user: AuthAuditUser): AuthAuditEvent {
  return forUser('auth.password_reset_completed', user);
}
