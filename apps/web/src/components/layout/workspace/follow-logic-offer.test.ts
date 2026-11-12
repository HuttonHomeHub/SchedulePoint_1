import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  followEditSentence,
  followFailedSentence,
  followKeptSentence,
  followMovingSentence,
  followLogicDoneSentence,
  followLogicLabel,
  FOLLOW_PLAN_LIMIT,
  followLogicRows,
  followPlanOverLimitReason,
  followPlanSentence,
  followSnapshotOf,
  isPlacedBeforeLogic,
  placedBeforeLogicIn,
  strandedBy,
} from './follow-logic-offer';

import { anActivity } from '@/test/activity-fixture';

/** A placed bar, flagged or not. Only the fields the diff reads vary. */
function bar(id: string, overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return anActivity({
    id,
    name: id,
    visualStart: '2026-02-01',
    visualConflictReason: null,
    ...overrides,
  });
}
const early = { visualConflictReason: 'EARLIER_THAN_LOGIC' } as const;

describe('strandedBy — which bars an edit newly left before their logic', () => {
  const calm = followSnapshotOf([bar('A'), bar('B'), bar('C')]);

  it('names a placed bar that is flagged now and was not before', () => {
    expect(strandedBy(calm, [bar('A'), bar('B', early), bar('C')])).toEqual(['B']);
  });

  it('names a chain: B and C stranded by the one edit, in the order of the plan', () => {
    expect(strandedBy(calm, [bar('A'), bar('B', early), bar('C', early)])).toEqual(['B', 'C']);
  });

  it('does not name a bar that was already flagged — the planner already chose to keep it', () => {
    const before = followSnapshotOf([bar('A'), bar('B', early)]);
    expect(strandedBy(before, [bar('A'), bar('B', early)])).toEqual([]);
  });

  it('does not name a bar whose placement the edit wrote (a drag, a nudge, a typed date)', () => {
    // **Verified red** by dropping the `visualStart` comparison: a bar the planner dragged early is
    // then offered "let it follow", which undoes their drag (SC-2).
    expect(strandedBy(calm, [bar('B', { ...early, visualStart: '2026-01-05' })])).toEqual([]);
  });

  it('does not name a bar that was unplaced and has just been placed', () => {
    const before = followSnapshotOf([bar('B', { visualStart: null })]);
    expect(strandedBy(before, [bar('B', early)])).toEqual([]);
  });

  it('does not name a bar the edit created (create-by-drop wrote its placement)', () => {
    expect(strandedBy(calm, [bar('NEW', early)])).toEqual([]);
  });

  it('never names a summary: the batch route refuses one', () => {
    const before = followSnapshotOf([bar('S', { type: 'WBS_SUMMARY' })]);
    expect(strandedBy(before, [bar('S', { type: 'WBS_SUMMARY', ...early })])).toEqual([]);
  });

  it('never names an unplaced bar, even when flagged', () => {
    const before = followSnapshotOf([bar('B', { visualStart: null })]);
    expect(strandedBy(before, [bar('B', { visualStart: null, ...early })])).toEqual([]);
  });

  it('never names a bar placed past a ceiling: that remedy is to review the constraint', () => {
    expect(strandedBy(calm, [bar('B', { visualConflictReason: 'LATER_THAN_BOUND' })])).toEqual([]);
  });

  it('never names a started bar: actuals freeze it, so Follow logic would move nothing', () => {
    // **Verified red** by dropping the `actualStart` term: a bar frozen by work that began is then
    // offered a move that clears its flag and changes no date, under a sentence ("stays where you
    // placed it") that is not why it is where it is. The count chip still counts it and the
    // selection bar's own Follow logic still clears it.
    expect(
      strandedBy(calm, [bar('B', { ...early, actualStart: '2026-01-20', percentComplete: 40 })]),
    ).toEqual([]);
    expect(
      strandedBy(calm, [bar('B', early), bar('C', { ...early, actualStart: '2026-01-20' })]),
    ).toEqual(['B']);
  });

  it('reads the flag through the shared derivation the count chip uses', () => {
    expect(isPlacedBeforeLogic(bar('B', early))).toBe(true);
    expect(isPlacedBeforeLogic(bar('B'))).toBe(false);
  });
});

describe('followLogicRows — the batch that lets bars follow', () => {
  const placed = bar('A', {
    version: 4,
    constraintType: 'SNET',
    constraintDate: '2026-01-20',
    visualStart: '2026-02-03',
  });

  it('clears the placement and sends the constraint back as stored, the lane unchanged', () => {
    // The route needs every field on every row, and nulling the constraint would silently delete a
    // commitment the planner recorded (spec §2, "Validation rules").
    expect(followLogicRows([placed]).placements).toEqual([
      {
        id: 'A',
        version: 4,
        constraintType: 'SNET',
        constraintDate: '2026-01-20',
        visualStart: null,
        laneIndex: null,
      },
    ]);
  });

  it('builds the undo step from the same rows: the placement comes back, the constraint unchanged', () => {
    const { before, after } = followLogicRows([placed]);
    expect(before).toEqual([
      {
        id: 'A',
        constraintType: 'SNET',
        constraintDate: '2026-01-20',
        visualStart: '2026-02-03',
        laneIndex: null,
      },
    ]);
    expect(after).toEqual([
      {
        id: 'A',
        constraintType: 'SNET',
        constraintDate: '2026-01-20',
        visualStart: null,
        laneIndex: null,
      },
    ]);
  });

  it('keeps a row with no constraint without one', () => {
    const [row] = followLogicRows([bar('B', { version: 2 })]).placements;
    expect(row).toMatchObject({ constraintType: null, constraintDate: null, visualStart: null });
  });
});

describe('the sentences', () => {
  it('says one bar, and several, in the spec’s words', () => {
    expect(followEditSentence('Pour slab', 1)).toBe(
      '“Pour slab” stays where you placed it, before its logic allows.',
    );
    expect(followEditSentence('Pour slab', 2)).toBe(
      '“Pour slab” and 1 other stay where you placed them, before their logic allows.',
    );
    expect(followEditSentence('Pour slab', 3)).toBe(
      '“Pour slab” and 2 others stay where you placed them, before their logic allows.',
    );
  });

  it('announces the outcome, and labels the undo step', () => {
    expect(followLogicDoneSentence('Pour slab', 1)).toBe(
      '“Pour slab” now follows its logic; dates will update.',
    );
    expect(followLogicDoneSentence('Pour slab', 3)).toBe(
      '“Pour slab” and 2 others now follow their logic; dates will update.',
    );
    expect(followMovingSentence('Pour slab', 1)).toBe('Moving “Pour slab”…');
    expect(followMovingSentence('Pour slab', 3)).toBe('Moving “Pour slab” and 2 others…');
    expect(followKeptSentence('Pour slab', 1)).toBe(
      'Kept “Pour slab” where you placed it; it stays flagged.',
    );
    expect(followFailedSentence('Pour slab', 2)).toBe(
      'Couldn’t move “Pour slab” and 1 other just now. Nothing was changed.',
    );
    expect(followLogicLabel(1)).toBe('Follow logic');
    expect(followLogicLabel(3)).toBe('Follow logic for 3 activities');
  });
});

describe('placedBeforeLogicIn — the bars the whole-plan offer lets follow', () => {
  it('names every placed, flagged, unstarted bar, in the order of the plan', () => {
    const rows = [bar('A'), bar('B', early), bar('C', early), bar('D')];
    expect(placedBeforeLogicIn(rows).map((r) => r.id)).toEqual(['B', 'C']);
  });

  it('leaves out a summary, which the batch route refuses, so it can read below the conflict chip', () => {
    // **Verified red** by dropping the type test: the offer then counts a summary the route answers
    // 422 for, and the whole press is refused for a bar it never could have moved (M0 C7).
    const rows = [bar('B', early), bar('S', { type: 'WBS_SUMMARY', ...early })];
    expect(placedBeforeLogicIn(rows).map((r) => r.id)).toEqual(['B']);
  });

  it('leaves out a started bar: actuals freeze it, so Follow logic would move nothing', () => {
    const rows = [bar('B', early), bar('C', { ...early, actualStart: '2026-01-20' })];
    expect(placedBeforeLogicIn(rows).map((r) => r.id)).toEqual(['B']);
  });

  it('leaves out an unplaced bar and a bar flagged for a ceiling, not for being early', () => {
    const rows = [
      bar('B', { ...early, visualStart: null }),
      bar('C', { visualConflictReason: 'LATER_THAN_BOUND' }),
    ];
    expect(placedBeforeLogicIn(rows)).toEqual([]);
  });

  it('agrees with the edit offer’s own eligibility, so the two offers cannot disagree about a bar', () => {
    const rows = [
      bar('B', early),
      bar('S', { type: 'WBS_SUMMARY', ...early }),
      bar('C', { ...early, actualStart: '2026-01-20' }),
    ];
    const calm = followSnapshotOf(rows.map((r) => ({ ...r, visualConflictReason: null })));
    expect(placedBeforeLogicIn(rows).map((r) => r.id)).toEqual(strandedBy(calm, rows));
  });
});

describe('followPlanSentence — the standing offer’s count', () => {
  it('says one bar in the singular', () => {
    expect(followPlanSentence(1)).toBe('1 bar stays where it was placed, before its logic allows.');
  });

  it('says several bars in the plural', () => {
    expect(followPlanSentence(3)).toBe(
      '3 bars stay where they were placed, before their logic allows.',
    );
  });
});

describe('followPlanOverLimitReason — the route takes 2,000 rows and the offer never chunks it', () => {
  it('names the limit and the way out', () => {
    expect(FOLLOW_PLAN_LIMIT).toBe(2000);
    expect(followPlanOverLimitReason(2001)).toBe(
      `Too many to follow at once (${(2001).toLocaleString()}; the limit is ${(2000).toLocaleString()}). Follow logic still works on each bar.`,
    );
  });
});
