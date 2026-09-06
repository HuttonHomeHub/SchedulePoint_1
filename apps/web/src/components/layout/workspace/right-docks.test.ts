import { describe, expect, it } from 'vitest';

import { RIGHT_DOCKS, docksToClose } from './right-docks';

/**
 * The exclusivity spec (health M2-T2 step 7): opening each dock closes exactly the others — one
 * assertion per member, DERIVED from the set, which cannot be five-sixths written the way twelve
 * hand-written pair statements can. The derived case grows with the set for free; the equality
 * below deliberately does not, and is edited in the same commit that adds a member (revision M2-T1
 * is the first time that happened, and the ADR-0125 plan named it as the cost in advance).
 */
describe('the one-dock-at-a-time set', () => {
  it('holds exactly the four docked columns', () => {
    expect([...RIGHT_DOCKS]).toEqual(['notes', 'floatPaths', 'health', 'revisions']);
  });

  it.each(RIGHT_DOCKS)('opening %s closes every other member', (dock) => {
    const closed = docksToClose(dock);
    expect(closed).not.toContain(dock);
    expect([...closed, dock].sort()).toEqual([...RIGHT_DOCKS].sort());
  });
});
