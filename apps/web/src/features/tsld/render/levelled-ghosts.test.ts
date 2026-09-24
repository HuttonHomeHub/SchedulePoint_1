import { describe, expect, it } from 'vitest';

import { buildLevelledGhosts, type LevellableActivity } from './lenses';

/**
 * **The levelled lens's three states** (one-planning-surface M-E-T3, spec §4.8).
 *
 * Derived from `level.ts`'s exit paths rather than from `goldens.ts` — that is the one levelling
 * golden in which **every activity is a participant**, so a fixture built from it cannot exhibit
 * the state that matters most here (ran, not a participant, nothing wrong). The previous plan's
 * semantics came from exactly that golden and were false in both directions.
 */
const row = (over: Partial<LevellableActivity> = {}): LevellableActivity => ({
  id: 'a',
  laneIndex: 0,
  type: 'TASK',
  earlyStart: '2026-01-05',
  leveledStart: null,
  leveledFinish: null,
  ...over,
});

describe('the levelled ghost', () => {
  it('draws one for a participant levelling MOVED', () => {
    const ghosts = buildLevelledGhosts([
      row({ leveledStart: '2026-01-12', leveledFinish: '2026-01-16' }),
    ]);
    expect(ghosts).toEqual([
      {
        id: 'a',
        leveledStart: '2026-01-12',
        leveledFinish: '2026-01-16',
        laneIndex: 0,
        type: 'TASK',
      },
    ]);
  });

  it('draws NOTHING for an activity that was not a participant', () => {
    // `level.ts:186` — no finite assignments means no overlay at all, so both columns are null.
    // This is "nothing to say", not "nothing happened": the control is NOT shaded for it, because
    // nothing is wrong and a shaded control would send a planner looking for a setting to change.
    expect(buildLevelledGhosts([row()])).toEqual([]);
  });

  it('draws NOTHING for a participant levelling did not move', () => {
    // `pinAtNetwork` (`level.ts:174`) sets `leveledStart: r.earlyStart`, so an undelayed
    // participant's ghost would land exactly on the feasible window's LEFT CAP — not on the bar,
    // which is the collision the old withholding rule was aimed at and the wrong one.
    expect(
      buildLevelledGhosts([row({ leveledStart: '2026-01-05', leveledFinish: '2026-01-09' })]),
    ).toEqual([]);
  });

  it('decides by the DATES, not by a separately rounded delay', () => {
    // The predicate is chosen, not discovered. The ghost is a rect positioned from these date
    // strings, and `levelingDelayDays` is rounded independently of them — deciding whether to draw
    // by that number would be two derivations of one fact, the shape the feasible window's single
    // derivation removes one layer up. Pinned by a row that HAS moved: any implementation reading
    // a delay field would need one, and this shape does not carry one at all.
    const moved = buildLevelledGhosts([
      row({ earlyStart: '2026-01-05', leveledStart: '2026-01-06', leveledFinish: '2026-01-10' }),
    ]);
    expect(moved).toHaveLength(1);
    expect(Object.keys(moved[0]!)).not.toContain('levelingDelayDays');
  });

  it('matches the live bar’s shape for a milestone', () => {
    // Carried from the caller rather than re-derived from `type`: the milestone predicate lives in
    // `features/activities` and this module is a pure render leaf. The first version compared
    // against a `'MILESTONE'` label that does not exist in `ActivityType` at all.
    const ghosts = buildLevelledGhosts([
      row({ type: 'START_MILESTONE', leveledStart: '2026-01-12', leveledFinish: '2026-01-12' }),
    ]);
    expect(ghosts[0]?.type).toBe('START_MILESTONE');
  });

  it('keeps each ghost in its live activity’s lane', () => {
    const ghosts = buildLevelledGhosts([
      row({ id: 'a', laneIndex: 3, leveledStart: '2026-01-12', leveledFinish: '2026-01-16' }),
      row({ id: 'b', laneIndex: 7, leveledStart: '2026-01-20', leveledFinish: '2026-01-22' }),
    ]);
    expect(ghosts.map((g) => [g.id, g.laneIndex])).toEqual([
      ['a', 3],
      ['b', 7],
    ]);
  });
});
