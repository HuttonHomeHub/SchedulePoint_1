import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { activityContextFacts, activitySubtitle } from './activity-editor-context';

function row(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    name: 'Erect steel frame',
    code: 'A1020',
    type: 'TASK',
    durationDays: 12,
    percentComplete: 0,
    earlyStart: '2026-08-12',
    earlyFinish: '2026-08-27',
    totalFloat: 4,
    freeFloat: 4,
    isCritical: false,
    isNearCritical: false,
    version: 1,
    ...overrides,
  } as ActivitySummary;
}

describe('activityContextFacts', () => {
  it('reports the dates and float the edit is about', () => {
    expect(activityContextFacts(row())).toEqual([
      { label: 'Early start', text: '12 Aug 2026' },
      { label: 'Early finish', text: '27 Aug 2026' },
      { label: 'Total float', text: '4 d' },
      { label: 'Progress', text: '0%' },
    ]);
  });

  it('withholds the whole strip before the plan has ever been calculated', () => {
    // Five em dashes in a row reads as breakage, not as "not yet computed" — so the caller renders
    // nothing at all and the absence is the message.
    expect(activityContextFacts(row({ earlyStart: null }))).toEqual([]);
  });

  it('adds free float only when it differs from total float', () => {
    const labels = activityContextFacts(row({ freeFloat: 1 })).map((fact) => fact.label);
    expect(labels).toContain('Free float');
    // …and not when they are equal, which would teach a reader the two columns are the same thing.
    expect(activityContextFacts(row({ freeFloat: 4 })).map((f) => f.label)).not.toContain(
      'Free float',
    );
  });

  it('carries the criticality as a status fact with a tone, and text that stands alone', () => {
    const facts = activityContextFacts(row({ isCritical: true, totalFloat: 0, freeFloat: 0 }));
    const status = facts.find((fact) => fact.label === 'Status');
    expect(status).toEqual({ label: 'Status', text: 'Critical', tone: 'critical' });
    // WCAG 1.4.1: the float reads critical too, in words, not only by colour.
    expect(facts.find((fact) => fact.label === 'Total float')?.tone).toBe('critical');
  });

  it('leaves a non-critical activity without a status fact', () => {
    expect(activityContextFacts(row()).map((f) => f.label)).not.toContain('Status');
  });
});

describe('activitySubtitle', () => {
  it('identifies the activity without repeating its name', () => {
    expect(activitySubtitle(row(), 'Task')).toBe('A1020 · Task · 12 working days');
  });

  it('drops the duration for a milestone rather than saying "0 working days"', () => {
    expect(
      activitySubtitle(row({ durationDays: 0, type: 'START_MILESTONE' }), 'Start milestone'),
    ).toBe('A1020 · Start milestone');
  });

  it('singularises a one-day activity', () => {
    expect(activitySubtitle(row({ durationDays: 1 }), 'Task')).toBe('A1020 · Task · 1 working day');
  });
});
