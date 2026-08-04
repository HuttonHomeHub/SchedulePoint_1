import { AuditActorType, AuditOutcome } from '@prisma/client';
import { AUDIT_ACTIONS, AUDIT_ACTOR_TYPES, AUDIT_OUTCOMES } from '@repo/types';
import { describe, expect, it } from 'vitest';

/**
 * The audit vocabulary spans three places that can drift independently: the shared `const` union,
 * the Postgres enums, and `ck_audit_events_action_format`. Nothing in the type system connects
 * them, so this file does — the `seed-vocabulary.spec.ts` / `LagCalendarSource` precedent.
 *
 * The drift this catches is quiet by nature. A vocabulary mismatch does not fail a build; it fails
 * one INSERT, at runtime, on the day someone performs the action nobody tested — and the symptom
 * is a **missing audit row**, which is precisely the failure an audit log cannot afford to have,
 * because its absence looks identical to "nothing happened".
 */
describe('audit vocabulary — shared types stay in lock-step with the database', () => {
  it('AUDIT_ACTOR_TYPES matches the Postgres enum exactly, both directions', () => {
    // Set equality both ways: a value added to one side fails until the other catches up, and a
    // value removed from one side fails until the other is corrected.
    expect([...AUDIT_ACTOR_TYPES].sort()).toEqual(Object.values(AuditActorType).sort());
  });

  it('AUDIT_OUTCOMES matches the Postgres enum exactly, both directions', () => {
    expect([...AUDIT_OUTCOMES].sort()).toEqual(Object.values(AuditOutcome).sort());
  });

  it('every action satisfies ck_audit_events_action_format', () => {
    // The same expression the migration installs. Kept here as a literal rather than imported,
    // because the point is to catch the two copies disagreeing — sharing them would defeat it.
    const CHECK = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

    for (const action of AUDIT_ACTIONS) {
      expect(action, `${action} would be rejected by the DB CHECK`).toMatch(CHECK);
      expect(action.length, `${action} exceeds the 64-char column bound`).toBeLessThanOrEqual(64);
    }
  });

  it('actions are unique — a duplicate would silently merge two distinct events', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it('every action is past tense, so a row records an outcome and never an intent', () => {
    // Not style policing: an action named in the imperative ("member.remove") invites a producer
    // to write the row BEFORE the thing succeeds, which is how audit logs come to assert things
    // that did not happen.
    const PRESENT_TENSE_VERBS = /\.(create|update|delete|remove|revoke|accept|join|restore)$/;

    for (const action of AUDIT_ACTIONS) {
      expect(action, `${action} reads as a command, not a record`).not.toMatch(PRESENT_TENSE_VERBS);
    }
  });
});
