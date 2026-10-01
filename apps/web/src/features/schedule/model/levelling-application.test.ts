import type {
  LevellingApplication,
  LevellingApplicationItem,
  LevellingApplicationRow,
} from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  APPLY_LEVELLING_LIMIT,
  applyLevellingAnnouncement,
  applyLevellingLabel,
  applyLevellingLines,
  applyLevellingSummary,
  applyLevellingTooMany,
  levellingApplicationSnapshots,
} from './levelling-application';

function row(id: string, over: Partial<LevellingApplicationRow> = {}): LevellingApplicationRow {
  return {
    id,
    version: 3,
    constraintType: null,
    constraintDate: null,
    visualStart: '2026-03-09',
    laneIndex: null,
    ...over,
  };
}

function item(id: string, over: Partial<LevellingApplicationItem> = {}): LevellingApplicationItem {
  return {
    id,
    name: `Activity ${id}`,
    code: null,
    beforeVisualStart: null,
    beforeDrawnStart: '2026-03-02',
    targetStart: '2026-03-09',
    wasPlaced: false,
    roundedToNextDay: false,
    reason: 'RESOURCE',
    ...over,
  };
}

function application(over: Partial<LevellingApplication> = {}): LevellingApplication {
  return {
    computedFrom: { scheduleComputedAt: '2026-03-01T00:00:00.000Z' },
    rows: [row('a')],
    items: [item('a')],
    leftToLogic: [],
    followingLinks: [],
    conflictingPlaced: [],
    laterThanBoundIntroduced: 0,
    projectFinishBefore: '2026-04-01',
    projectFinishAfter: '2026-04-08',
    remainingAfterApply: 0,
    ...over,
  };
}

describe('levellingApplicationSnapshots', () => {
  it('builds before from the preview items, keeping a null prior placement null', () => {
    const { before, after, versions } = levellingApplicationSnapshots(
      application({
        rows: [row('a'), row('b', { version: 9, visualStart: '2026-03-16' })],
        items: [
          item('a', { beforeVisualStart: null }),
          item('b', { beforeVisualStart: '2026-03-04', wasPlaced: true }),
        ],
      }),
    );
    expect(before.map((p) => [p.id, p.visualStart])).toEqual([
      ['a', null],
      ['b', '2026-03-04'],
    ]);
    expect(after.map((p) => [p.id, p.visualStart])).toEqual([
      ['a', '2026-03-09'],
      ['b', '2026-03-16'],
    ]);
    expect([...versions]).toEqual([
      ['a', 3],
      ['b', 9],
    ]);
  });

  it('carries the stored constraint unchanged in both directions, and never touches the lane', () => {
    const { before, after } = levellingApplicationSnapshots(
      application({
        rows: [row('a', { constraintType: 'SNET', constraintDate: '2026-03-01' })],
      }),
    );
    for (const placement of [...before, ...after]) {
      expect(placement.constraintType).toBe('SNET');
      expect(placement.constraintDate).toBe('2026-03-01');
      expect(placement.laneIndex).toBeNull();
    }
  });

  it('refuses a row it cannot describe, because guessing a prior placement restores the wrong one', () => {
    expect(() =>
      levellingApplicationSnapshots(application({ rows: [row('a'), row('ghost')] })),
    ).toThrow(/ghost/);
  });
});

describe('labels', () => {
  it('names the undo step with the count and its plural', () => {
    expect(applyLevellingLabel(1)).toBe('Apply levelled dates (1 activity)');
    expect(applyLevellingLabel(12)).toBe('Apply levelled dates (12 activities)');
  });

  it('announces what moved', () => {
    expect(applyLevellingAnnouncement(1)).toBe('Moved 1 activity to its levelled date.');
    expect(applyLevellingAnnouncement(4)).toBe('Moved 4 activities to their levelled dates.');
  });

  it('states the limit as the batch route does', () => {
    expect(APPLY_LEVELLING_LIMIT).toBe(2000);
    expect(applyLevellingTooMany(2300)).toBe(
      'Nothing was changed. Levelling would move 2,300 activities, and one step can apply at most 2,000.',
    );
  });
});

describe('applyLevellingLines', () => {
  const byKey = (app: LevellingApplication) =>
    Object.fromEntries(applyLevellingLines(app).map((l) => [l.key, l.text]));

  it('says nothing for a preview with nothing to write', () => {
    expect(applyLevellingLines(application({ rows: [], items: [] }))).toEqual([]);
  });

  it('states the count in the singular and the plural', () => {
    expect(byKey(application()).moves).toBe('1 activity will move to its levelled date.');
    expect(
      byKey(application({ rows: [row('a'), row('b')], items: [item('a'), item('b')] })).moves,
    ).toBe('2 activities will move to their levelled dates.');
  });

  it('counts hand-placed bars only when there are some, at one and many', () => {
    expect(byKey(application())['hand-placed']).toBeUndefined();
    expect(
      byKey(
        application({
          rows: [row('a'), row('b')],
          items: [item('a', { wasPlaced: true }), item('b')],
        }),
      )['hand-placed'],
    ).toBe('1 moves on its own and 1 was placed by hand.');
    expect(
      byKey(
        application({
          rows: [row('a'), row('b')],
          items: [item('a', { wasPlaced: true }), item('b', { wasPlaced: true })],
        }),
      )['hand-placed'],
    ).toBe('All 2 were placed by hand.');
  });

  it('counts the bars rounded to the next working day, and explains why', () => {
    expect(byKey(application())['next-day']).toBeUndefined();
    expect(byKey(application({ items: [item('a', { roundedToNextDay: true })] }))['next-day']).toBe(
      '1 of them starts on the next working day, because the resource is only free part-way through a day.',
    );
  });

  it('says how many activities will follow their links, and is silent when none do', () => {
    expect(byKey(application()).following).toBeUndefined();
    expect(byKey(application({ followingLinks: [{ id: 's', name: 'S' }] })).following).toBe(
      '1 more activity will follow the bars before it, with nothing written for it.',
    );
    expect(
      byKey(
        application({
          followingLinks: [
            { id: 's', name: 'S' },
            { id: 't', name: 'T' },
          ],
        }),
      ).following,
    ).toBe('2 more activities will follow the bars before them, with nothing written for them.');
  });

  it('leaves the bars left to logic and the hand-placed conflicts to their sections', () => {
    const keys = applyLevellingLines(
      application({
        leftToLogic: [{ id: 'x', name: 'X' }],
        conflictingPlaced: [{ id: 'p', name: 'P' }],
      }),
    ).map((l) => l.key);
    expect(keys).not.toContain('left-to-logic');
    expect(keys).not.toContain('conflicting-placed');
  });

  it('warns about date limits broken, only when some are', () => {
    expect(byKey(application())['later-than-bound']).toBeUndefined();
    expect(byKey(application({ laterThanBoundIntroduced: 3 }))['later-than-bound']).toBe(
      '3 activities will finish after a deadline they currently meet.',
    );
  });

  it('states the plan finish before and after, or that it stays', () => {
    expect(byKey(application()).finish).toBe(
      'The plan finish moves from 01 Apr 2026 to 08 Apr 2026.',
    );
    expect(byKey(application({ projectFinishAfter: '2026-04-01' })).finish).toBe(
      'The plan finish stays 01 Apr 2026.',
    );
  });

  it('leaves the finish out when the preview has none to compare', () => {
    expect(byKey(application({ projectFinishBefore: null }))).not.toHaveProperty('finish');
    expect(byKey(application({ projectFinishAfter: null }))).not.toHaveProperty('finish');
  });

  it('says nothing is left to move only when remainingAfterApply is 0 — at 0, 1 and many', () => {
    expect(byKey(application({ remainingAfterApply: 0 })).remaining).toBe(
      'Resource levelling will have nothing left to move.',
    );
    expect(byKey(application({ remainingAfterApply: 1 })).remaining).toBe(
      '1 activity will still need the same resource at the same time. You can apply again to sort it out.',
    );
    expect(byKey(application({ remainingAfterApply: 5 })).remaining).toBe(
      '5 activities will still need the same resource at the same time. You can apply again to sort them out.',
    );
  });
});

describe('applyLevellingLines order and applyLevellingSummary', () => {
  it('puts the finish and what remains first', () => {
    const keys = applyLevellingLines(application()).map((l) => l.key);
    expect(keys.slice(0, 3)).toEqual(['finish', 'remaining', 'moves']);
  });

  it('announces what moves, then the finish, then what remains', () => {
    expect(applyLevellingSummary(applyLevellingLines(application()))).toBe(
      '1 activity will move to its levelled date. The plan finish moves from 01 Apr 2026 to 08 Apr 2026. Resource levelling will have nothing left to move.',
    );
  });
});
