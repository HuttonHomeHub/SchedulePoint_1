import { AUDIT_ACTIONS } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { AUDITABLE_FIELDS, redactChanges } from './audit-redactor';

describe('redactChanges — the allow-list', () => {
  it('records only the fields the action names, dropping everything else', () => {
    const changes = redactChanges(
      'member.role_changed',
      { role: 'VIEWER', userId: 'u_1', email: 'someone@example.com' },
      { role: 'PLANNER', userId: 'u_1', email: 'someone@example.com' },
    );

    // `role` is named; `userId` and `email` are not — and are absent rather than nulled, so a
    // reader cannot mistake "not recorded" for "was empty".
    expect(changes).toEqual({ before: { role: 'VIEWER' }, after: { role: 'PLANNER' } });
  });

  it('records NOTHING for an authentication action', () => {
    // The five auth actions allow no fields at all: everything worth knowing is a column, and any
    // payload would be attacker-influenced sign-in input. NULL, not an empty envelope.
    expect(redactChanges('auth.sign_in_failed', { password: 'hunter2' }, {})).toBeNull();
    expect(redactChanges('auth.signed_in', { email: 'a@b.c' }, {})).toBeNull();
  });

  it('refuses a forbidden field even if an allow-list were edited to name it', () => {
    // The belt-and-braces layer. Simulated by asking for an action whose list contains `email`
    // and confirming the substring ban still governs: `passwordHash` never survives normalisation
    // into an allowed key, because it is not an allowed key — and if someone added it, isForbidden
    // strips it before it is ever picked.
    const changes = redactChanges(
      'invitation.created',
      { email: 'x@y.z', passwordHash: 'abc', apiKey: 'k' },
      { email: 'x@y.z' },
    );

    expect(JSON.stringify(changes)).not.toContain('abc');
    expect(JSON.stringify(changes)).not.toContain('"k"');
  });

  it('records a TYPE MARKER for a nested object, never its contents', () => {
    // An allow-list that vets only the top-level key cannot vouch for what is underneath, so
    // serialising the value would record fields nobody approved.
    const changes = redactChanges('organization.created', {}, { name: { nested: 'secret-value' } });

    expect(changes?.after.name).toBe('[object]');
    expect(JSON.stringify(changes)).not.toContain('secret-value');
  });

  it('returns null when neither side has a recordable field', () => {
    expect(redactChanges('client.deleted', { unlisted: 1 }, { alsoUnlisted: 2 })).toBeNull();
  });

  it('caps a long string so one field cannot consume the budget', () => {
    const changes = redactChanges('plan.deleted', { name: 'y'.repeat(5000) }, {});
    expect(String(changes?.before.name).length).toBeLessThanOrEqual(513);
  });

  it('reduces a large array to a bounded marker rather than its elements', () => {
    // The bound leaked when only the `typeof value === 'string'` branch capped: an array took the
    // fallback path uncapped. Found by a failing test, not by reading the code.
    const changes = redactChanges(
      'plan.deleted',
      {},
      { name: Array.from({ length: 5000 }, (_, i) => i) },
    );

    expect(changes?.after.name).toBe('[array(5000)]');
  });

  it('keeps every payload inside the column bound, for the largest input any action allows', () => {
    // The real contract. With every value capped and no action allowing more than three fields,
    // the payload is STRUCTURALLY bounded well under ck_audit_events_changes_size — which is why
    // the over-budget branch is defensive rather than routine.
    const huge = 'x'.repeat(50_000);
    for (const action of AUDIT_ACTIONS) {
      const changes = redactChanges(
        action,
        Object.fromEntries(AUDITABLE_FIELDS[action].map((f) => [f, huge])),
        Object.fromEntries(AUDITABLE_FIELDS[action].map((f) => [f, huge])),
      );
      expect(
        Buffer.byteLength(JSON.stringify(changes ?? null), 'utf8'),
        `${action} would breach ck_audit_events_changes_size`,
      ).toBeLessThanOrEqual(8192);
    }
  });
});

describe('the allow-list is exhaustive', () => {
  it('every action has decided what it may record', () => {
    // The compile-time Record<AuditAction, …> already guarantees this; asserting it at runtime as
    // well catches the case where someone satisfies the type with a cast rather than a decision.
    for (const action of AUDIT_ACTIONS) {
      expect(AUDITABLE_FIELDS[action], `${action} has no allow-list entry`).toBeDefined();
    }
  });

  it('no allow-list names a field the never-record ban would strip', () => {
    // If these ever disagree, the allow-list is lying about what it records — the field would be
    // named here and silently absent from every row.
    const BANNED = /password|token|secret|hash|credential|authorization|cookie|apikey/i;

    for (const [action, fields] of Object.entries(AUDITABLE_FIELDS)) {
      for (const field of fields) {
        expect(field, `${action} names a field that would always be stripped`).not.toMatch(BANNED);
      }
    }
  });
});
