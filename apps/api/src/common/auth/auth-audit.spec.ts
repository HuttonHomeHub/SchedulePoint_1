import { describe, expect, it } from 'vitest';

import {
  classifyAuthEvent,
  emailVerifiedEvent,
  signedOutEvent,
  type AuthHookFacts,
} from './auth-audit';

const USER = { id: 'u_1', email: 'planner@example.com' };

function facts(overrides: Partial<AuthHookFacts> = {}): AuthHookFacts {
  return { path: '/get-session', failed: false, newSession: null, body: undefined, ...overrides };
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
