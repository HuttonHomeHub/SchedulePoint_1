import { describe, expect, it } from 'vitest';

import {
  classifyRevisionChanges,
  FREE_CHANGE_CLASSES,
  PAID_CHANGE_CLASSES,
  type ClassifyOptions,
  type RevisionSideInput,
} from './revision-changes';
import type { RevisionEdge, RevisionRow } from './revision-delta';

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
  // Every one of these is a REAL value on a fully-recorded side: lane 0 is a lane, 0 % is a
  // progress figure, no constraint is the commonest state there is. Which is exactly why the
  // classifier may never read them as "was this recorded?" — see `bothSnapshotted`.
  laneIndex: 0,
  parentId: null,
  calendarId: null,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  ...o,
});

const edge = (o: Partial<RevisionEdge> & { dependencyId: string }): RevisionEdge => ({
  predecessorId: 'a',
  successorId: 'b',
  type: 'FS',
  lagMinutes: 0,
  lagCalendar: 'PROJECT_DEFAULT',
  ...o,
});

/** A side, with logic. `side([...])` is the common no-logic case. */
const side = (rows: RevisionRow[], edges: RevisionEdge[] = []): RevisionSideInput => ({
  rows,
  edges,
});

const opts = (o: Partial<ClassifyOptions> = {}): ClassifyOptions => ({
  fromScheduled: true,
  toScheduled: true,
  bothSnapshotted: true,
  includeProgress: false,
  calendarName: () => null,
  cap: 200,
  ...o,
});

const classOf = (report: ReturnType<typeof classifyRevisionChanges>, name: string) =>
  report.classes.find((c) => c.changeClass === name);

describe('the revision change classifier', () => {
  it('reports EVERY class, assessed or not — a class is never simply missing', () => {
    // Totality. A reader who cannot find a class concludes nothing changed in it; the report must
    // make "we did not look" a visible state rather than an absence.
    const report = classifyRevisionChanges(side([]), side([]), opts({ includeProgress: true }));
    const reported = report.classes.map((c) => c.changeClass).sort();
    const expected = [...FREE_CHANGE_CLASSES, ...PAID_CHANGE_CLASSES].sort();
    expect(reported).toEqual(expected);
  });

  it('omits the progress class unless it is asked for', () => {
    const report = classifyRevisionChanges(side([]), side([]), opts({ includeProgress: false }));
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
      side([row({ activityId: 'a', ...from })]),
      side([row({ activityId: 'a', ...to })]),
      opts(),
    );
    const found = classOf(report, changeClass);
    expect(found?.rows).toHaveLength(1);
    expect(found?.rows[0]?.activityId).toBe('a');
    expect(found?.notAssessableReason).toBeNull();
  });

  it('detects ADDED and REMOVED, and neither is a change to an existing row', () => {
    const report = classifyRevisionChanges(
      side([row({ activityId: 'gone' })]),
      side([row({ activityId: 'new' })]),
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
      side([row({ activityId: 'a', durationMinutes: 480 })]),
      side([row({ activityId: 'a', durationMinutes: 480 })]),
      opts(),
    );
    expect(classOf(report, 'REDURATIONED')?.rows).toEqual([]);
  });

  it('orders by TIME and never by magnitude', () => {
    // The ordering rule is a causal-claim guard, not a presentation preference: a list sorted
    // biggest-first, beside a slipped completion, reads as a ranking of blame.
    const report = classifyRevisionChanges(
      side([
        row({ activityId: 'late', earlyStart: '2026-06-01', durationMinutes: 480 }),
        row({ activityId: 'early', earlyStart: '2026-01-01', durationMinutes: 480 }),
      ]),
      side([
        // `late` moves by far more, and must still come second.
        row({ activityId: 'late', earlyStart: '2026-06-01', durationMinutes: 99_999 }),
        row({ activityId: 'early', earlyStart: '2026-01-01', durationMinutes: 500 }),
      ]),
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
        side([row({ activityId: 'a', isCritical: false, earlyStart: '2026-01-05' })]),
        side([row({ activityId: 'a', isCritical: true, earlyStart: '2026-09-05' })]),
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
      side([row({ activityId: 'a', name: 'Old' })]),
      side([row({ activityId: 'a', name: 'New' })]),
      opts({ toScheduled: false }),
    );
    expect(classOf(report, 'RENAMED')?.notAssessableReason).toBeNull();
    expect(classOf(report, 'RENAMED')?.rows).toHaveLength(1);
  });

  it.each(PAID_CHANGE_CLASSES.filter((c) => c !== 'PROGRESSED'))(
    '%s says NOT_SNAPSHOTTED rather than reporting no change',
    (changeClass) => {
      const report = classifyRevisionChanges(side([]), side([]), opts({ bothSnapshotted: false }));
      expect(classOf(report, changeClass)?.notAssessableReason).toBe('NOT_SNAPSHOTTED');
    },
  );

  it('reports NOT_SNAPSHOTTED even when the rows in front of it DO differ', () => {
    // The load-bearing case for the whole snapshot discriminator, and the one a naive
    // implementation passes by accident. A NONE-level baseline stores NULL for every shape column,
    // so comparing it against a live plan finds real differences — a lane, a parent, a progress
    // figure — every one of which is an artefact of the snapshot's absence rather than an edit
    // anybody made. Reporting them would be a confident, fabricated list of changes.
    const report = classifyRevisionChanges(
      side([row({ activityId: 'a', laneIndex: null, parentId: null, percentComplete: null })]),
      side([row({ activityId: 'a', laneIndex: 7, parentId: 'phase', percentComplete: 40 })]),
      opts({ bothSnapshotted: false, includeProgress: true }),
    );
    for (const c of PAID_CHANGE_CLASSES) {
      expect(classOf(report, c)?.notAssessableReason).toBe('NOT_SNAPSHOTTED');
      expect(classOf(report, c)?.rows).toEqual([]);
      expect(classOf(report, c)?.total).toBe(0);
    }
  });

  describe('the paid classes, once both sides recorded the shape', () => {
    it.each([
      ['RECONSTRAINED', { constraintType: null }, { constraintType: 'SNET' as const }],
      [
        'RECONSTRAINED',
        { secondaryConstraintType: null },
        { secondaryConstraintType: 'FNLT' as const },
      ],
      ['RECALENDARED', { calendarId: null }, { calendarId: 'cal-2' }],
      ['REPARENTED', { parentId: null }, { parentId: 'phase-1' }],
      ['RELANED', { laneIndex: 0 }, { laneIndex: 3 }],
    ])('detects %s', (changeClass, from, to) => {
      const report = classifyRevisionChanges(
        side([row({ activityId: 'a', ...from })]),
        side([row({ activityId: 'a', ...to })]),
        opts(),
      );
      const found = classOf(report, changeClass);
      expect(found?.notAssessableReason).toBeNull();
      expect(found?.rows).toHaveLength(1);
    });

    it('reports a secondary-constraint edit under RECONSTRAINED, not as its own class', () => {
      // Both halves of one edit belong in one place. A reader scanning for "what did somebody
      // constrain?" should not have to know the product has two constraint slots.
      const report = classifyRevisionChanges(
        side([row({ activityId: 'a' })]),
        side([
          row({
            activityId: 'a',
            secondaryConstraintType: 'FNLT',
            secondaryConstraintDate: '2026-03-01',
          }),
        ]),
        opts(),
      );
      const found = classOf(report, 'RECONSTRAINED');
      expect(found?.rows[0]?.from).toBe('None');
      expect(found?.rows[0]?.to).toBe('FNLT 2026-03-01');
    });

    it('names a calendar, and states a deleted one in words rather than as a UUID', () => {
      // The snapshot holds correlation ids and no foreign keys (ADR-0025), so a calendar deleted
      // since capture is an EXPECTED outcome of the design. Printing its id would read as a defect.
      const report = classifyRevisionChanges(
        side([row({ activityId: 'a', calendarId: 'cal-gone' })]),
        side([row({ activityId: 'a', calendarId: 'cal-live' })]),
        opts({ calendarName: (id) => (id === 'cal-live' ? 'Six-day week' : null) }),
      );
      const found = classOf(report, 'RECALENDARED');
      expect(found?.rows[0]?.from).toBe('A calendar that no longer exists');
      expect(found?.rows[0]?.to).toBe('Six-day week');
    });

    it('resolves each parent against ITS OWN side', () => {
      // Renaming a phase and moving an activity into it are two edits. Resolving both ends against
      // the new side would report the OLD parent under its NEW name, which reads as no move at all.
      const report = classifyRevisionChanges(
        side([
          row({ activityId: 'a', parentId: 'p1' }),
          row({ activityId: 'p1', name: 'Enabling works', type: 'WBS_SUMMARY' }),
        ]),
        side([
          row({ activityId: 'a', parentId: 'p2' }),
          row({ activityId: 'p1', name: 'Enabling works (revised)', type: 'WBS_SUMMARY' }),
          row({ activityId: 'p2', name: 'Superstructure', type: 'WBS_SUMMARY' }),
        ]),
        opts(),
      );
      const found = classOf(report, 'REPARENTED');
      expect(found?.rows[0]?.from).toBe('Enabling works');
      expect(found?.rows[0]?.to).toBe('Superstructure');
    });

    it('says "Top level" rather than leaving a moved-out activity blank', () => {
      const report = classifyRevisionChanges(
        side([row({ activityId: 'a', parentId: 'p1' }), row({ activityId: 'p1', name: 'Phase' })]),
        side([row({ activityId: 'a', parentId: null })]),
        opts(),
      );
      expect(classOf(report, 'REPARENTED')?.rows[0]?.to).toBe('Top level');
    });

    it('withholds PROGRESSED unless asked for, and finds it when asked', () => {
      const from = side([row({ activityId: 'a', percentComplete: 0 })]);
      const to = side([row({ activityId: 'a', percentComplete: 40, actualStart: '2026-01-05' })]);
      expect(classOf(classifyRevisionChanges(from, to, opts()), 'PROGRESSED')).toBeUndefined();
      const asked = classifyRevisionChanges(from, to, opts({ includeProgress: true }));
      expect(classOf(asked, 'PROGRESSED')?.rows[0]?.to).toBe('40% · started 2026-01-05');
    });
  });

  describe('logic', () => {
    it('reports an added, a removed and a changed edge, ONE row each', () => {
      const report = classifyRevisionChanges(
        side(
          [row({ activityId: 'a' }), row({ activityId: 'b' })],
          [edge({ dependencyId: 'gone' }), edge({ dependencyId: 'kept', lagMinutes: 0 })],
        ),
        side(
          [row({ activityId: 'a' }), row({ activityId: 'b' })],
          [edge({ dependencyId: 'kept', lagMinutes: 480 }), edge({ dependencyId: 'new' })],
        ),
        opts(),
      );
      const rows = classOf(report, 'RELOGICKED')?.rows ?? [];
      expect(rows.map((r) => r.subjectId).sort()).toEqual(['gone', 'kept', 'new']);
      expect(rows.find((r) => r.subjectId === 'new')?.from).toBeNull();
      expect(rows.find((r) => r.subjectId === 'gone')?.to).toBeNull();
      expect(rows.find((r) => r.subjectId === 'kept')?.to).toBe('FS +480 min (PROJECT_DEFAULT)');
    });

    it('reports an edge re-typed AND re-lagged as ONE row naming both sides', () => {
      // Two rows would read as two edits, which is a count a planner acts on.
      const report = classifyRevisionChanges(
        side([row({ activityId: 'a' })], [edge({ dependencyId: 'd', type: 'FS', lagMinutes: 0 })]),
        side(
          [row({ activityId: 'a' })],
          [edge({ dependencyId: 'd', type: 'SS', lagMinutes: -120 })],
        ),
        opts(),
      );
      const rows = classOf(report, 'RELOGICKED')?.rows ?? [];
      expect(rows).toHaveLength(1);
      expect(rows[0]?.from).toBe('FS');
      expect(rows[0]?.to).toBe('SS −120 min (PROJECT_DEFAULT)');
    });

    it('reports an edge whose endpoints were BOTH removed exactly once', () => {
      // The activities are reported under REMOVED — that is different information. The link is one
      // row, not one per endpoint.
      const report = classifyRevisionChanges(
        side(
          [row({ activityId: 'a' }), row({ activityId: 'b' })],
          [edge({ dependencyId: 'd', predecessorId: 'a', successorId: 'b' })],
        ),
        side([], []),
        opts(),
      );
      expect(classOf(report, 'RELOGICKED')?.rows).toHaveLength(1);
      expect(classOf(report, 'REMOVED')?.rows).toHaveLength(2);
      // …and it can still NAME both ends, because the snapshot froze both endpoint ids.
      expect(classOf(report, 'RELOGICKED')?.rows[0]?.name).toBe('a → b');
    });

    it('keys two changed links into ONE successor apart', () => {
      // The reason `subjectId` exists at all: both rows carry the same `activityId`, and a client
      // keying on that would render two rows as one.
      const report = classifyRevisionChanges(
        side(
          [row({ activityId: 'p1' }), row({ activityId: 'p2' }), row({ activityId: 's' })],
          [
            edge({ dependencyId: 'd1', predecessorId: 'p1', successorId: 's' }),
            edge({ dependencyId: 'd2', predecessorId: 'p2', successorId: 's' }),
          ],
        ),
        side(
          [row({ activityId: 'p1' }), row({ activityId: 'p2' }), row({ activityId: 's' })],
          [
            edge({ dependencyId: 'd1', predecessorId: 'p1', successorId: 's', lagMinutes: 60 }),
            edge({ dependencyId: 'd2', predecessorId: 'p2', successorId: 's', type: 'SS' }),
          ],
        ),
        opts(),
      );
      const rows = classOf(report, 'RELOGICKED')?.rows ?? [];
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.activityId))).toEqual(new Set(['s']));
      expect(new Set(rows.map((r) => r.subjectId))).toEqual(new Set(['d1', 'd2']));
      // The reveal target is the SUCCESSOR — what a planner opens the row to look at.
      expect(rows.every((r) => r.activityId === 's')).toBe(true);
    });

    it('does NOT report a zero-lag link whose lag calendar was switched', () => {
      // It changes no date, and both labels would render identically — a row a reader would read
      // as a defect in the list rather than as a fact about the plan.
      const report = classifyRevisionChanges(
        side(
          [row({ activityId: 'a' })],
          [edge({ dependencyId: 'd', lagCalendar: 'PROJECT_DEFAULT' })],
        ),
        side(
          [row({ activityId: 'a' })],
          [edge({ dependencyId: 'd', lagCalendar: 'TWENTY_FOUR_HOUR' })],
        ),
        opts(),
      );
      expect(classOf(report, 'RELOGICKED')?.rows).toEqual([]);
    });

    it('DOES report a lag calendar switch alongside a real lag', () => {
      // The discriminator for the case above: with a lag, the calendar decides what the number
      // means (ADR-0036 §6), so the same figure on a different calendar is a different link.
      const report = classifyRevisionChanges(
        side(
          [row({ activityId: 'a' })],
          [edge({ dependencyId: 'd', lagMinutes: 480, lagCalendar: 'PROJECT_DEFAULT' })],
        ),
        side(
          [row({ activityId: 'a' })],
          [edge({ dependencyId: 'd', lagMinutes: 480, lagCalendar: 'TWENTY_FOUR_HOUR' })],
        ),
        opts(),
      );
      expect(classOf(report, 'RELOGICKED')?.rows).toHaveLength(1);
    });
  });

  it('caps rows but always reports the true total', () => {
    // The ADR-0116 D3 rule: "showing N of M" is never a client's own arithmetic.
    const from = Array.from({ length: 250 }, (_, i) => row({ activityId: `a${String(i)}` }));
    const to = from.map((r) => ({ ...r, name: `${r.name} changed` }));
    const report = classifyRevisionChanges(side(from), side(to), opts({ cap: 10 }));
    const renamed = classOf(report, 'RENAMED');
    expect(renamed?.rows).toHaveLength(10);
    expect(renamed?.total).toBe(250);
  });

  it('is symmetric about which side came from where', () => {
    // Both sides project to one shape, so the function cannot tell a baseline from the live plan —
    // which is what makes baseline-vs-baseline free rather than a second implementation.
    const a = [row({ activityId: 'x', name: 'One' })];
    const b = [row({ activityId: 'x', name: 'Two' })];
    const forward = classifyRevisionChanges(side(a), side(b), opts());
    const back = classifyRevisionChanges(side(b), side(a), opts());
    expect(classOf(forward, 'RENAMED')?.rows[0]?.from).toBe('One');
    expect(classOf(back, 'RENAMED')?.rows[0]?.from).toBe('Two');
  });
});
