import { describe, expect, it } from 'vitest';

import {
  moveToSwimlaneGate,
  swimlaneAssignedAnnouncement,
  SWIMLANES_OFF_MOVE_REASON,
} from './swimlane-assignment';

describe('swimlaneAssignedAnnouncement', () => {
  const landed = {
    swimlane: 'Mechanical',
    lane: 1,
    count: 3,
    changedSwimlane: true,
    displayLane: 4,
    how: 'asked',
  } as const;

  it('names the one activity and the C9 place when swimlanes are drawn', () => {
    expect(
      swimlaneAssignedAnnouncement({ names: ['Pour'], count: 1, target: 'Mechanical', landed }),
    ).toBe('Moved “Pour” to Mechanical, lane 2 of 3.');
  });

  it('names only the swimlane when they are not drawn, so no lane is spoken that no one can see', () => {
    expect(
      swimlaneAssignedAnnouncement({
        names: ['Pour'],
        count: 1,
        target: 'Mechanical',
        landed: undefined,
      }),
    ).toBe('Moved “Pour” to Mechanical.');
  });

  it('counts a selection and names where it went', () => {
    expect(
      swimlaneAssignedAnnouncement({ names: ['A', 'B'], count: 2, target: 'Civil', landed }),
    ).toBe('2 activities moved to Civil.');
  });
});

describe('moveToSwimlaneGate', () => {
  it('shades with the way out while swimlanes are off, whatever the pen says', () => {
    for (const write of [
      { writable: true, reason: null },
      { writable: false, reason: 'Start editing to change swimlanes.' },
    ]) {
      expect(moveToSwimlaneGate({ shown: false }, write)).toEqual({
        writable: false,
        reason: SWIMLANES_OFF_MOVE_REASON,
      });
    }
    expect(SWIMLANES_OFF_MOVE_REASON).toBe(
      'Turn on Swimlanes in View to move activities between them.',
    );
  });

  it('passes the pen’s verdict through once they are drawn', () => {
    expect(moveToSwimlaneGate({ shown: true }, { writable: true, reason: null })).toEqual({
      writable: true,
      reason: null,
    });
    expect(
      moveToSwimlaneGate({ shown: true }, { writable: false, reason: 'Start editing.' }),
    ).toEqual({ writable: false, reason: 'Start editing.' });
  });
});
