import { describe, expect, it } from 'vitest';

import { RIGHT_DOCKS, docksToClose } from './right-docks';

/**
 * The three-way exclusivity spec (health M2-T2 step 7): opening each dock closes exactly the other
 * two — three assertions derived from the set, which cannot be five-sixths written the way six
 * hand-written pair statements can.
 */
describe('the one-dock-at-a-time set', () => {
  it('holds exactly the three docked columns', () => {
    expect([...RIGHT_DOCKS]).toEqual(['notes', 'floatPaths', 'health']);
  });

  it.each(RIGHT_DOCKS)('opening %s closes every other member', (dock) => {
    const closed = docksToClose(dock);
    expect(closed).not.toContain(dock);
    expect([...closed, dock].sort()).toEqual([...RIGHT_DOCKS].sort());
  });
});
