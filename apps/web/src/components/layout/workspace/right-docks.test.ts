import { afterEach, describe, expect, it } from 'vitest';

import { DOCK_TRIGGER_ITEMS, RIGHT_DOCKS, docksToClose, focusDockTrigger } from './right-docks';

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

describe('where focus goes when a dock closes (toolbar-redesign M5)', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  const item = (id: string): HTMLButtonElement => {
    const el = document.createElement('button');
    el.setAttribute('data-toolbar-item', id);
    document.body.append(el);
    return el;
  };

  it('names a trigger for every dock, most specific first', () => {
    for (const dock of RIGHT_DOCKS) expect(DOCK_TRIGGER_ITEMS[dock].length).toBeGreaterThan(0);
    expect(DOCK_TRIGGER_ITEMS.health).toEqual(['health-check', 'analysis']);
    expect(DOCK_TRIGGER_ITEMS.revisions).toEqual(['compare-revisions', 'analysis']);
  });

  it('returns focus to the promoted toggle when it is on the bar', () => {
    // Verified red by putting `analysis` first: the reader who pressed Health check lands on Analysis.
    item('analysis');
    const toggle = item('health-check');
    expect(focusDockTrigger('health')).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it('falls back to Analysis, which is on the bar at every width', () => {
    const analysis = item('analysis');
    expect(focusDockTrigger('health')).toBe(true);
    expect(document.activeElement).toBe(analysis);
  });

  it('reports that nothing took focus when no trigger is on the page', () => {
    expect(focusDockTrigger('revisions')).toBe(false);
  });
});
