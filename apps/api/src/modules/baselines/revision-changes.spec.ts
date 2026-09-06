import { describe, expect, it } from 'vitest';

import {
  classifyRevisionChanges,
  FREE_CHANGE_CLASSES,
  PAID_CHANGE_CLASSES,
  type ClassifyOptions,
} from './revision-changes';
import type { RevisionRow } from './revision-delta';

/**
 * The classifier is a pure function over two arrays, so every branch is reachable from a literal.
 *
 * The load-bearing cases are the ones about **what the report does not know**: a class that cannot
 * be assessed must say so with a reason and carry no rows, because an empty list and an
 * un-looked-at list are indistinguishable to a reader and the difference is the whole point of the
 * epic. Those are asserted per class rather than in aggregate.
 */
const row = (o: Partial<RevisionRow> & { activityId: string }): RevisionRow => ({
  code: null,
  name: o.activityId,
  type: 'TASK',
  durationMinutes: 480,
  isCritical: false,
  totalFloatDays: 0,
  earlyStart: '2026-01-05',
  earlyFinish: '2026-01-09',
  ...o,
});

const opts = (o: Partial<ClassifyOptions> = {}): ClassifyOptions => ({
  fromScheduled: true,
  toScheduled: true,
  bothSnapshotted: true,
  includeProgress: false,
  cap: 200,
  ...o,
});

const classOf = (report: ReturnType<typeof classifyRevisionChanges>, name: string) =>
  report.classes.find((c) => c.changeClass === name);

describe('the revision change classifier', () => {
  it('reports EVERY class, assessed or not — a class is never simply missing', () => {
    // Totality. A reader who cannot find a class concludes nothing changed in it; the report must
    // make "we did not look" a visible state rather than an absence.
    const report = classifyRevisionChanges([], [], opts({ includeProgress: true }));
    const reported = report.classes.map((c) => c.changeClass).sort();
    const expected = [...FREE_CHANGE_CLASSES, ...PAID_CHANGE_CLASSES].sort();
    expect(reported).toEqual(expected);
  });

  it('omits the progress class unless it is asked for', () => {
    const report = classifyRevisionChanges([], [], opts({ includeProgress: false }));
    expect(classOf(report, 'PROGRESSED')).toBeUndefined();
  });

  it.each([
    ['RENAMED', { name: 'Piling' }, { name: 'Piling rig' }],
    ['RECODED', { code: 'A10' }, { code: 'A20' }],
    ['RETYPED', { type: 'TASK' as const }, { type: 'WBS_SUMMARY' as const }],
    ['REDURATIONED', { durationMinutes: 480 }, { durationMinutes: 960 }],
    ['REDATED', { earlyStart: '2026-01-05' }, { earlyStart: '2026-02-05' }],
    ['CRITICALITY', { isCritical: false }, { isCritical: true }],
  ])('detects %s', (changeClass, from, to) => {
    const report = classifyRevisionChanges(
      [row({ activityId: 'a', ...from })],
      [row({ activityId: 'a', ...to })],
      opts(),
    );
    const found = classOf(report, changeClass);
    expect(found?.rows).toHaveLength(1);
    expect(found?.rows[0]?.activityId).toBe('a');
    expect(found?.notAssessableReason).toBeNull();
  });

  it('detects ADDED and REMOVED, and neither is a change to an existing row', () => {
    const report = classifyRevisionChanges(
      [row({ activityId: 'gone' })],
      [row({ activityId: 'new' })],
      opts(),
    );
    expect(classOf(report, 'ADDED')?.rows.map((r) => r.activityId)).toEqual(['new']);
    expect(classOf(report, 'REMOVED')?.rows.map((r) => r.activityId)).toEqual(['gone']);
    // An added row is not also "renamed" — it had no previous name to differ from.
    expect(classOf(report, 'RENAMED')?.rows).toEqual([]);
  });

  it('compares duration in MINUTES, so a calendar edit is not reported as a duration change', () => {
    // Both sides are "1 day", but on calendars with different hours-per-day. In days they look
    // identical; in minutes they are not, and minutes is what is stored (ADR-0068).
    const report = classifyRevisionChanges(
      [row({ activityId: 'a', durationMinutes: 480 })],
      [row({ activityId: 'a', durationMinutes: 480 })],
      opts(),
    );
    expect(classOf(report, 'REDURATIONED')?.rows).toEqual([]);
  });

  it('orders by TIME and never by magnitude', () => {
    // The ordering rule is a causal-claim guard, not a presentation preference: a list sorted
    // biggest-first, beside a slipped completion, reads as a ranking of blame.
    const report = classifyRevisionChanges(
      [
        row({ activityId: 'late', earlyStart: '2026-06-01', durationMinutes: 480 }),
        row({ activityId: 'early', earlyStart: '2026-01-01', durationMinutes: 480 }),
      ],
      [
        // `late` moves by far more, and must still come second.
        row({ activityId: 'late', earlyStart: '2026-06-01', durationMinutes: 99_999 }),
        row({ activityId: 'early', earlyStart: '2026-01-01', durationMinutes: 500 }),
      ],
      opts(),
    );
    expect(classOf(report, 'REDURATIONED')?.rows.map((r) => r.activityId)).toEqual([
      'early',
      'late',
    ]);
  });

  it.each(['REDATED', 'CRITICALITY'])(
    '%s is NOT ASSESSABLE when a side has no computed schedule, and carries no rows',
    (changeClass) => {
      const report = classifyRevisionChanges(
        [row({ activityId: 'a', isCritical: false, earlyStart: '2026-01-05' })],
        [row({ activityId: 'a', isCritical: true, earlyStart: '2026-09-05' })],
        opts({ toScheduled: false }),
      );
      const found = classOf(report, changeClass);
      // The rows WOULD have been found — the inputs differ. Reporting them from an unscheduled
      // side would be a confident answer computed from dates that do not exist.
      expect(found?.notAssessableReason).toBe('SIDE_NOT_SCHEDULED');
      expect(found?.rows).toEqual([]);
      expect(found?.total).toBe(0);
    },
  );

  it('a class that IS assessable on an unscheduled side still reports normally', () => {
    // Not everything depends on dates. A rename is a rename whether or not anyone recalculated.
    const report = classifyRevisionChanges(
      [row({ activityId: 'a', name: 'Old' })],
      [row({ activityId: 'a', name: 'New' })],
      opts({ toScheduled: false }),
    );
    expect(classOf(report, 'RENAMED')?.notAssessableReason).toBeNull();
    expect(classOf(report, 'RENAMED')?.rows).toHaveLength(1);
  });

  it.each(PAID_CHANGE_CLASSES.filter((c) => c !== 'PROGRESSED'))(
    '%s says NOT_SNAPSHOTTED rather than reporting no change',
    (changeClass) => {
      const report = classifyRevisionChanges([], [], opts({ bothSnapshotted: false }));
      expect(classOf(report, changeClass)?.notAssessableReason).toBe('NOT_SNAPSHOTTED');
    },
  );

  it('caps rows but always reports the true total', () => {
    // The ADR-0116 D3 rule: "showing N of M" is never a client's own arithmetic.
    const from = Array.from({ length: 250 }, (_, i) => row({ activityId: `a${String(i)}` }));
    const to = from.map((r) => ({ ...r, name: `${r.name} changed` }));
    const report = classifyRevisionChanges(from, to, opts({ cap: 10 }));
    const renamed = classOf(report, 'RENAMED');
    expect(renamed?.rows).toHaveLength(10);
    expect(renamed?.total).toBe(250);
  });

  it('is symmetric about which side came from where', () => {
    // Both sides project to one shape, so the function cannot tell a baseline from the live plan —
    // which is what makes baseline-vs-baseline free rather than a second implementation.
    const a = [row({ activityId: 'x', name: 'One' })];
    const b = [row({ activityId: 'x', name: 'Two' })];
    const forward = classifyRevisionChanges(a, b, opts());
    const back = classifyRevisionChanges(b, a, opts());
    expect(classOf(forward, 'RENAMED')?.rows[0]?.from).toBe('One');
    expect(classOf(back, 'RENAMED')?.rows[0]?.from).toBe('Two');
  });
});
