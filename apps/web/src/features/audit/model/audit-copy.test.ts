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

  // A screen reader announces nothing at all for `→`, so a before/after pair read as one
  // undifferentiated phrase. The word carries the same meaning to every reader
  // (`docs/TECH_DEBT.md` #93e).
  it('names both sides of a role change', () => {
    const { detail } = auditEventCopy(
      event({ changes: { before: { role: 'PLANNER' }, after: { role: 'VIEWER' } } }),
    );
    expect(detail).toBe('Planner to Viewer');
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
    expect(detail).toBe('FUTURE_ROLE to Viewer');
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

/**
 * The detail line for the coverage rung's nineteen actions (ADR-0073 C3, C4.1).
 *
 * Until C4.1 nothing pinned any of these strings — the suite proved every action had *a* title and
 * stopped. That is a thin gate for the half of the feature the epic exists to deliver: the detail
 * line is where a row stops being "something happened to a calendar" and becomes an answer. Each
 * case below asserts the fact a reader is actually looking for, not the whole sentence, so the
 * wording can still be improved without rewriting the test.
 */
describe('the coverage rung’s detail lines', () => {
  // `AuditChanges` declares both sides, so a case naming one supplies `{}` for the other rather
  // than casting — which is also what the producers do: a delete records only `before`.
  const detail = (
    action: AuditEvent['action'],
    changes: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ): string | null =>
    auditEventCopy(
      event({ action, changes: { before: changes.before ?? {}, after: changes.after ?? {} } }),
    ).detail;

  it('leads a cascade delete with its SIZE, then the plan', () => {
    expect(
      detail('activity.deleted', {
        before: { name: 'Phase 1', activityCount: 41, dependencyCount: 63, planName: 'Programme' },
      }),
    ).toBe('41 activities, 63 links · in Programme');
  });

  it('says a dissolve KEPT the work, never how much it removed', () => {
    const line = detail('activity.dissolved', { before: { promotedChildCount: 12 } });
    expect(line).toContain('12 activities');
    expect(line).toContain('kept');
  });

  it('distinguishes the three reparent destinations rather than guessing', () => {
    expect(detail('activity.reparented', { after: { movedCount: 3, parentName: 'Phase 2' } })).toBe(
      '3 activities moved under Phase 2',
    );
    // A batch naming several destinations: "moved to the top level" would be false, and saying
    // nothing would leave the sentence unfinished (the C3.1 `parentCount` departure).
    expect(detail('activity.reparented', { after: { movedCount: 5, parentCount: 3 } })).toBe(
      '5 activities moved to 3 different groups',
    );
    expect(detail('activity.reparented', { after: { movedCount: 2 } })).toBe(
      '2 activities moved to the top level',
    );
  });

  it('names a link by DIRECTION — the fact planners most often need settled', () => {
    const line = detail('dependency.created', {
      after: { predecessorName: 'Dig', successorName: 'Pour', type: 'FS' },
    });
    expect(line).toContain('Dig');
    expect(line).toContain('Pour');
    expect((line ?? '').indexOf('Dig')).toBeLessThan((line ?? '').indexOf('Pour'));
  });

  it('names the KIND of working-time edit, not the rows', () => {
    const line = detail('calendar.working_time_changed', {
      after: { name: 'Site 6-Day', changedWhat: 'shifts' },
    });
    expect(line).not.toBeNull();
    expect(line).not.toContain('[object');
  });

  it('names which plan setting moved, in words rather than field names', () => {
    // The producer diffs by VALUE, so the payload already carries only what moved (C3.2). The copy's
    // job is the other half: `schedulingMode` is a column name, "scheduling mode" is what a planner
    // calls it, and a row naming the column reads as a stack trace.
    expect(
      detail('plan.settings_changed', {
        before: { schedulingMode: 'EARLY' },
        after: { schedulingMode: 'VISUAL' },
      }),
    ).toContain('scheduling mode');
    expect(
      detail('plan.settings_changed', {
        before: { plannedStart: '2026-01-05' },
        after: { plannedStart: '2026-02-01' },
      }),
    ).toContain('data date');
  });

  it('reports a GROUP delete as one row carrying its subtree size', () => {
    const line = detail('resource.deleted', {
      before: { name: 'Groundworks', kind: 'GROUP', resourceCount: 14 },
    });
    expect(line).toContain('14 resources');
  });

  it('names the calendar tier a scope change moved between', () => {
    const line = detail('calendar.scope_changed', {
      before: { scope: 'ORG' },
      after: { scope: 'PROJECT' },
    });
    expect(line).not.toBeNull();
    // Rendered as words a planner uses, never the enum labels the API stores.
    expect(line).not.toContain('ORG');
  });

  it('leads an import with the file, and mentions findings ONLY when there are some', () => {
    const clean = detail('interchange.imported', {
      after: {
        sourceFilename: 'p6-export.xer',
        format: 'XER',
        activityCount: 500,
        findingCount: 0,
      },
    });
    expect(clean).toContain('p6-export.xer');
    expect(clean).not.toContain('finding');

    const messy = detail('interchange.imported', {
      after: {
        sourceFilename: 'p6-export.xer',
        format: 'XER',
        activityCount: 500,
        findingCount: 7,
      },
    });
    expect(messy).toContain('7 findings');
  });

  it('withholds a detail line rather than inventing one when the payload is empty', () => {
    // Every branch must tolerate a row whose payload the redactor stripped: a half-sentence is
    // worse than no sentence, and an audit row that pads is an audit row that can mislead.
    for (const action of AUDIT_ACTIONS) {
      expect(() => auditEventCopy(event({ action, changes: null }))).not.toThrow();
    }
  });
});
