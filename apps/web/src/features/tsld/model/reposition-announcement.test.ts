import { describe, expect, it } from 'vitest';

import {
  pluralMoveAnnouncement,
  pluralMoveHint,
  repositionAnnouncement,
  type RepositionOutcomeFacts,
} from './reposition-announcement';

const facts = (over: Partial<RepositionOutcomeFacts>): RepositionOutcomeFacts => ({
  name: 'Clad',
  snappedDate: null,
  timeChanged: false,
  laneChanged: false,
  requested: 0,
  landed: 0,
  original: 0,
  ...over,
});

describe('repositionAnnouncement', () => {
  it('a time move says the dates will update', () => {
    expect(repositionAnnouncement(facts({ timeChanged: true }))).toBe(
      'Moved “Clad”; dates will update.',
    );
  });

  it('a lane move that landed where it was aimed names that lane', () => {
    expect(
      repositionAnnouncement(facts({ laneChanged: true, requested: 2, landed: 2, original: 0 })),
    ).toBe('Moved “Clad” to lane 3.');
  });

  it('a lane move that went on past an occupied lane says so', () => {
    expect(
      repositionAnnouncement(facts({ laneChanged: true, requested: 1, landed: 2, original: 0 })),
    ).toBe('Moved “Clad” to lane 3, the next free lane.');
  });

  it('says so on the roll-to-a-working-day branch too (review finding: it did not)', () => {
    expect(
      repositionAnnouncement(
        facts({
          snappedDate: '12 Jan',
          timeChanged: true,
          laneChanged: true,
          requested: 1,
          landed: 2,
          original: 0,
        }),
      ),
    ).toBe('Moved “Clad” to 12 Jan, the next working day in lane 3, the next free lane.');
  });

  it('never names a lane the bar did not go to when no free lane was found above', () => {
    // A diagonal drag upward onto occupied lanes: the date moved, the lane did not.
    expect(
      repositionAnnouncement(
        facts({ timeChanged: true, laneChanged: true, requested: 1, landed: 3, original: 3 }),
      ),
    ).toBe('Moved “Clad”; no free lane above, so it stays in lane 4; dates will update.');
  });
});

describe('pluralMoveAnnouncement', () => {
  it.each([
    [3, 2, 0, '3 activities moved 2 days later; dates will update.'],
    [3, -1, 0, '3 activities moved 1 day earlier; dates will update.'],
    [3, 0, -1, '3 activities moved up 1 lane.'],
    [3, 0, 2, '3 activities moved down 2 lanes.'],
    [3, -1, 1, '3 activities moved 1 day earlier and down 1 lane; dates will update.'],
    [1, 1, 0, '1 activity moved 1 day later; dates will update.'],
  ])('%i activities, day %i, lane %i', (count, dayDelta, laneDelta, expected) => {
    expect(pluralMoveAnnouncement({ count, dayDelta, laneDelta })).toBe(expected);
  });

  it('says nothing for a zero move, which writes nothing', () => {
    expect(pluralMoveAnnouncement({ count: 3, dayDelta: 0, laneDelta: 0 })).toBe('');
  });
});

describe('pluralMoveHint', () => {
  it('names both the pointer and the keyboard route and the count', () => {
    expect(pluralMoveHint(4)).toBe(
      'Dragging any of these, or pressing Alt with an arrow key, moves all 4 activities.',
    );
  });
});
