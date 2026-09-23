import { describe, expect, it } from 'vitest';

import { repositionAnnouncement, type RepositionOutcomeFacts } from './reposition-announcement';

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
