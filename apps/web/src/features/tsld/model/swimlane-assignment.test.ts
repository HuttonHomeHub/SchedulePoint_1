import { describe, expect, it } from 'vitest';

import { swimlaneAssignedAnnouncement } from './swimlane-assignment';

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
