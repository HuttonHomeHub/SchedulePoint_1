import { describe, expect, it } from 'vitest';

import {
  attributeAttemptedAddress,
  classifyAuthEvent,
  emailVerifiedEvent,
  passwordResetCompletedEvent,
  signedOutEvent,
  type AuthHookFacts,
} from './auth-audit';
import { normalizeEmail } from './normalize-email';

const USER = { id: 'u_1', email: 'planner@example.com' };

function facts(overrides: Partial<AuthHookFacts> = {}): AuthHookFacts {
  return {
    path: '/get-session',
    failed: false,
    newSession: null,
    returned: undefined,
    body: undefined,
    ...overrides,
  };
}

describe('classifyAuthEvent', () => {
  it('records a successful sign-in with the user as both actor and subject', () => {
    const event = classifyAuthEvent(facts({ path: '/sign-in/email', newSession: { user: USER } }));

    expect(event).toEqual({
      action: 'auth.signed_in',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: 'u_1',
      actorLabel: 'planner@example.com',
      subjectType: 'USER',
      subjectId: 'u_1',
      subjectLabel: 'planner@example.com',
    });
  });

  it('records a FAILED sign-in as ANONYMOUS with the attempted address', () => {
    // The event that matters most, and the one an after-hook could plausibly not see at all.
    // Verified against better-auth@1.6.25's `dispatchAuthEndpoint`: a thrown APIError is caught,
    // assigned to `context.returned`, and the after-hooks still run.
    const event = classifyAuthEvent(
      facts({ path: '/sign-in/email', failed: true, body: { email: 'attacker@example.com' } }),
    );

    expect(event).toMatchObject({
      action: 'auth.sign_in_failed',
      outcome: 'FAILURE',
      actorType: 'ANONYMOUS',
      subjectLabel: 'attacker@example.com',
    });
    // ck_audit_events_actor_shape rejects an ANONYMOUS row carrying an actor id, so getting this
    // wrong is not untidy — it is a lost row.
    expect(event?.actorUserId).toBeNull();
  });

  it('caps a hostile attempted address rather than storing it whole', () => {
    const event = classifyAuthEvent(
      facts({ path: '/sign-in/email', failed: true, body: { email: 'x'.repeat(5000) } }),
    );

    expect(event?.subjectLabel).toHaveLength(320);
  });

  it('survives a body that is not an object, or has no email', () => {
    for (const body of [undefined, null, 'not-json', 42, {}, { email: 42 }, { email: '' }]) {
      const event = classifyAuthEvent(facts({ path: '/sign-in/email', failed: true, body }));
      expect(event?.subjectLabel).toBeNull();
    }
  });

  it('records a sign-up, and records nothing for a failed one', () => {
    expect(
      classifyAuthEvent(facts({ path: '/sign-up/email', newSession: { user: USER } })),
    ).toMatchObject({ action: 'auth.signed_up' });

    // A rejected registration is a validation error, not a security event, and is not in the
    // ADR-0072 vocabulary.
    expect(classifyAuthEvent(facts({ path: '/sign-up/email', failed: true }))).toBeNull();
  });

  it('records NOTHING for the paths that fire on every page load', () => {
    // The hook runs for every auth route. `/get-session` alone would bury the events that matter.
    for (const path of ['/get-session', '/list-sessions', '/update-user', '/ok']) {
      expect(classifyAuthEvent(facts({ path, newSession: { user: USER } }))).toBeNull();
    }
  });

  it('records nothing for a "successful" sign-in that produced no session', () => {
    // Better Auth can return 200 without setting a session (e.g. a verification-required
    // response). A row naming nobody is worse than no row.
    expect(classifyAuthEvent(facts({ path: '/sign-in/email' }))).toBeNull();
  });

  it('does not classify sign-out or verify-email — they have their own seams', () => {
    // Both were tried here first and neither works: `/sign-out` never resolves a session onto the
    // context, and `/verify-email` returns `user: null` and succeeds by throwing a redirect. If
    // this test ever starts failing because someone added the cases back, read the module
    // docblock before "fixing" it.
    expect(classifyAuthEvent(facts({ path: '/sign-out', newSession: { user: USER } }))).toBeNull();
    expect(
      classifyAuthEvent(facts({ path: '/verify-email', newSession: { user: USER } })),
    ).toBeNull();
  });
});

describe('the two events with their own seams', () => {
  it('builds a sign-out event from a resolved session', () => {
    expect(signedOutEvent(USER)).toMatchObject({
      action: 'auth.signed_out',
      actorUserId: 'u_1',
      subjectId: 'u_1',
    });
  });

  it('builds an email-verified event from afterEmailVerification', () => {
    expect(emailVerifiedEvent(USER)).toMatchObject({
      action: 'auth.email_verified',
      actorType: 'USER',
      actorLabel: 'planner@example.com',
    });
  });
});

describe('attributeFailedSignIn (ADR-0073 C2.2)', () => {
  const failed = (subjectLabel: string | null) => ({
    action: 'auth.sign_in_failed' as const,
    outcome: 'FAILURE' as const,
    actorType: 'ANONYMOUS' as const,
    actorUserId: null,
    actorLabel: null,
    subjectType: 'USER' as const,
    subjectId: null,
    subjectLabel,
  });

  it('fills subjectId when the attempted address belongs to a real account', async () => {
    // The whole point of C2: without this the row has neither an actor nor an organisation, so
    // both read endpoints filter it out and nobody can see they were targeted.
    const event = await attributeAttemptedAddress(
      failed('victim@example.com'),
      () => Promise.resolve('u_victim'),
      normalizeEmail,
    );

    expect(event.subjectId).toBe('u_victim');
    // Still ANONYMOUS: the claim was not proven, and `ck_audit_events_actor_shape` rejects an
    // ANONYMOUS row carrying an ACTOR id. A subject is not an actor.
    expect(event.actorType).toBe('ANONYMOUS');
    expect(event.actorUserId).toBeNull();
  });

  it('normalises before looking up, so a mixed-case attempt still attributes', async () => {
    // The recorded label is the raw request; the stored user is lowercased. Verified against the
    // real handler in `test/auth-attribution.e2e-spec.ts` — this pins the consequence.
    const seen: string[] = [];
    await attributeAttemptedAddress(
      failed('Victim@Example.COM'),
      (email) => {
        seen.push(email);
        return Promise.resolve(null);
      },
      normalizeEmail,
    );

    expect(seen).toEqual(['victim@example.com']);
  });

  it('leaves the row unattributed when nobody owns the address', async () => {
    const event = await attributeAttemptedAddress(
      failed('nobody@example.com'),
      () => Promise.resolve(null),
      normalizeEmail,
    );
    expect(event.subjectId).toBeNull();
  });

  it('does not look up at all when there is no address to look up', async () => {
    let called = false;
    const event = await attributeAttemptedAddress(
      failed(null),
      () => {
        called = true;
        return Promise.resolve('u_1');
      },
      normalizeEmail,
    );

    expect(called).toBe(false);
    expect(event.subjectId).toBeNull();
  });

  it('leaves every other event untouched, without looking anything up', async () => {
    let called = false;
    const signedIn = signedOutEvent(USER);
    const event = await attributeAttemptedAddress(
      signedIn,
      () => {
        called = true;
        return Promise.resolve('u_other');
      },
      normalizeEmail,
    );

    expect(called).toBe(false);
    expect(event).toEqual(signedIn);
  });

  it('records the row unattributed rather than letting a lookup fault reach the sign-in', async () => {
    // Fail-OPEN on purpose, and not the fail-closed shape its siblings use: the alternative to an
    // unattributed audit row here is a refused sign-in.
    const event = await attributeAttemptedAddress(
      failed('victim@example.com'),
      () => Promise.reject(new Error('the database is unavailable')),
      normalizeEmail,
    );

    expect(event.subjectId).toBeNull();
    expect(event.subjectLabel).toBe('victim@example.com');
  });
});

/**
 * The credential events (ADR-0074).
 *
 * Each assertion below corresponds to something that was **observed against a running instance**
 * before the producer was written, not inferred from the two routes that already worked. The
 * `newSession`/`returned` split in particular is the whole reason `/change-password` needed its own
 * treatment: reusing the sign-in pattern would have recorded nothing on every successful change,
 * silently, which is the failure this file's docblock exists to warn about.
 */
describe('classifyAuthEvent — credential changes', () => {
  it('records a successful password change from `returned`, not `newSession`', () => {
    // The observed shape: `{ token: null, user: {...} }` with `newSession` null, because the
    // endpoint mints no session unless `revokeOtherSessions` was asked for.
    const event = classifyAuthEvent(
      facts({ path: '/change-password', newSession: null, returned: { token: null, user: USER } }),
    );

    expect(event).toEqual({
      action: 'auth.password_changed',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: 'u_1',
      actorLabel: 'planner@example.com',
      subjectType: 'USER',
      subjectId: 'u_1',
      subjectLabel: 'planner@example.com',
    });
  });

  it('records nothing when the current password was wrong', () => {
    // A rejected change says only that a signed-in user mistyped; the session already proves who
    // they are. The blast-radius test catches the successful change, not the fumbled one.
    expect(
      classifyAuthEvent(facts({ path: '/change-password', failed: true, returned: undefined })),
    ).toBeNull();
  });

  it('records nothing rather than a half-built row when the user cannot be read', () => {
    // Defensive: `returned` is `unknown` by contract and shaped differently per endpoint. A row
    // with no actor would violate `ck_audit_events_actor_shape` and be lost anyway.
    expect(
      classifyAuthEvent(facts({ path: '/change-password', returned: { token: null } })),
    ).toBeNull();
  });

  it('records a reset request as ANONYMOUS with the attempted address', () => {
    const event = classifyAuthEvent(
      facts({ path: '/request-password-reset', body: { email: 'Victim@Example.COM' } }),
    );

    expect(event).toEqual({
      action: 'auth.password_reset_requested',
      // SUCCESS: the request was accepted. Whether it named a real account is deliberately not
      // asserted by this row — that is the oracle the endpoint itself avoids.
      outcome: 'SUCCESS',
      actorType: 'ANONYMOUS',
      actorUserId: null,
      actorLabel: null,
      subjectType: 'USER',
      subjectId: null,
      // The caller's casing, preserved: the normaliser runs at lookup time, not at record time
      // (ADR-0073 C2.1).
      subjectLabel: 'Victim@Example.COM',
    });
  });

  it('records the same row for an address nobody owns', () => {
    // The endpoint answers identically for both, so the row must not be the place the difference
    // leaks. Only `subjectId` differs, and only its own account holder can read that.
    const known = classifyAuthEvent(
      facts({ path: '/request-password-reset', body: { email: 'known@example.com' } }),
    );
    const unknown = classifyAuthEvent(
      facts({ path: '/request-password-reset', body: { email: 'nobody@example.com' } }),
    );

    expect({ ...known, subjectLabel: null }).toEqual({ ...unknown, subjectLabel: null });
  });

  it('attributes a reset request to the account it named', async () => {
    const event = await attributeAttemptedAddress(
      classifyAuthEvent(
        facts({ path: '/request-password-reset', body: { email: 'Victim@Example.COM' } }),
      ) as NonNullable<ReturnType<typeof classifyAuthEvent>>,
      (email) => Promise.resolve(email === 'victim@example.com' ? 'u_victim' : null),
      normalizeEmail,
    );

    // Without this the row has no actor and no organisation, so neither read endpoint can reach it
    // and the single most useful thing it records is visible only from `psql` (TECH_DEBT #91).
    expect(event.subjectId).toBe('u_victim');
  });
});

describe('passwordResetCompletedEvent', () => {
  it('names the user as both actor and subject', () => {
    // The actor is the user even though the request carried no session: completing a reset proves
    // control of the mailbox, which is the whole basis on which the new password was accepted.
    expect(passwordResetCompletedEvent(USER)).toEqual({
      action: 'auth.password_reset_completed',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: 'u_1',
      actorLabel: 'planner@example.com',
      subjectType: 'USER',
      subjectId: 'u_1',
      subjectLabel: 'planner@example.com',
    });
  });
});
