import { AUDIT_ACTIONS, type AuditEvent } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { auditActorName, auditEventCopy, auditSubject } from './audit-copy';

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'e1',
    occurredAt: '2026-08-03T09:00:00.000Z',
    organizationId: 'org_1',
    action: 'member.role_changed',
    outcome: 'SUCCESS',
    actorType: 'USER',
    actorUserId: 'u_1',
    actorLabel: 'admin@example.com',
    subjectType: 'ORG_MEMBER',
    subjectId: 'm_1',
    subjectLabel: 'planner@example.com',
    changes: null,
    correlationId: 'req_1',
    ...overrides,
  };
}

describe('auditEventCopy', () => {
  it('gives EVERY action a title — none renders as its own machine name', () => {
    // The gate that matters: an audit log where one row says "member.role_changed" is an audit log
    // nobody finished. The record is keyed by AuditAction so a new action is a compile error, and
    // this proves the type-level promise holds at runtime for all of them.
    for (const action of AUDIT_ACTIONS) {
      const { title } = auditEventCopy(event({ action }));
      expect(title, action).not.toContain('.');
      expect(title, action).not.toBe('');
    }
  });

  it('names both sides of a role change', () => {
    const { detail } = auditEventCopy(
      event({ changes: { before: { role: 'PLANNER' }, after: { role: 'VIEWER' } } }),
    );
    expect(detail).toBe('Planner → Viewer');
  });

  it('says nothing rather than half of a role change', () => {
    // "Changed to Viewer" without saying from what invites the reader to assume it was the role
    // they remember — which is the question they opened the log to answer.
    const { detail } = auditEventCopy(
      event({ changes: { before: {}, after: { role: 'VIEWER' } } }),
    );
    expect(detail).toBeNull();
  });

  it('records no detail for the authentication actions', () => {
    // Their allow-list is empty at the API by design; who, from where and whether it worked are
    // first-class columns. A detail line here could only be invented.
    for (const action of AUDIT_ACTIONS.filter((a) => a.startsWith('auth.'))) {
      expect(auditEventCopy(event({ action })).detail).toBeNull();
    }
  });

  it('renders an unknown role as itself rather than swallowing it', () => {
    const { detail } = auditEventCopy(
      event({ changes: { before: { role: 'FUTURE_ROLE' }, after: { role: 'VIEWER' } } }),
    );
    expect(detail).toBe('FUTURE_ROLE → Viewer');
  });
});

describe('auditSubject', () => {
  it('prefers the label recorded at the time', () => {
    expect(auditSubject(event())).toBe('planner@example.com');
  });

  it('falls back to a readable type rather than an em dash', () => {
    // A deleted plan has no label to show; "Org member" tells a reader more than "—" does.
    expect(auditSubject(event({ subjectLabel: null, subjectType: 'ORG_MEMBER' }))).toBe(
      'Org member',
    );
  });
});

describe('auditActorName', () => {
  it('says a failed sign-in was not signed in, rather than showing a blank', () => {
    expect(auditActorName(event({ actorLabel: null, actorType: 'ANONYMOUS' }))).toBe(
      'Not signed in',
    );
  });

  it('uses the label recorded at the time, never a live lookup', () => {
    expect(auditActorName(event())).toBe('admin@example.com');
  });
});
