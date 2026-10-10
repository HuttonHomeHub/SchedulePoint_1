import { describe, expect, it } from 'vitest';

import { PROMOTION_LADDER } from './promotion-ladder';
import { ALL_PROMOTION_ENTRIES, buildTsldToolbarItems, LENS_TOGGLES } from './tsld-toolbar-items';

import { derivePromotedItems } from '@/components/ui/toolbar/toolbar-promotion';

/**
 * **The promotion ladder's structural rules** (toolbar-redesign M5, spec §4.11), each of which is a
 * statement about the registry that no render can fall out of by accident.
 *
 * Verified red, one by one: setting a derived item to `'roomy'` fails the first; giving Legend a
 * stage fails the third; pointing an entry at a trigger that is not registered throws at build.
 */
describe('promoted items', () => {
  const items = buildTsldToolbarItems();
  const promoted = items.filter((item) => ALL_PROMOTION_ENTRIES.some((e) => e.id === item.id));

  it('are always labelled: a derived item is never "roomy" or "never"', () => {
    // A promoted item exists *because* there is room, so a label that goes away with the room would be
    // the same width problem one layer down. The set is non-empty, or this passes against nothing.
    expect(promoted.length).toBeGreaterThan(10);
    for (const item of promoted) {
      expect(item.labelVisibility, item.id).toBe('always');
    }
  });

  it('sit on the deck, never on the diagram corner: the canvas row has no ladder', () => {
    for (const item of promoted) {
      expect(item.row ?? 'strip', item.id).toBe('strip');
    }
    expect(ALL_PROMOTION_ENTRIES.map((entry) => entry.from)).not.toContain('minimap');
  });

  it('hand focus to the trigger they came from, and say why they left', () => {
    for (const entry of ALL_PROMOTION_ENTRIES) {
      const item = items.find((i) => i.id === entry.id);
      expect(item?.successorId, entry.id).toBe(entry.from);
      expect(item?.lostReason, entry.id).toBe(`Moved into the ${entry.menuName} menu.`);
      // The trigger it names is registered, and is not itself something that promotes.
      expect(
        items.some((i) => i.id === entry.from),
        `${entry.id} → ${entry.from}`,
      ).toBe(true);
      expect(ALL_PROMOTION_ENTRIES.some((e) => e.id === entry.from)).toBe(false);
    }
  });

  it('name a trigger that exists: an entry for a missing trigger refuses to build', () => {
    const [entry] = ALL_PROMOTION_ENTRIES;
    if (!entry) throw new Error('no entries');
    expect(() =>
      derivePromotedItems([{ ...entry, from: 'no-such-trigger' }], items, () => true),
    ).toThrow(/no-such-trigger/);
  });

  it('have unique ids and unique menu labels within their menu', () => {
    const ids = ALL_PROMOTION_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const from of new Set(ALL_PROMOTION_ENTRIES.map((e) => e.from))) {
      const labels = ALL_PROMOTION_ENTRIES.filter((e) => e.from === from).map((e) => e.menuLabel);
      expect(new Set(labels).size, from).toBe(labels.length);
    }
  });
});

describe('the permanent promotions', () => {
  it('Legend and the Minimap are always-promoted records the ladder never demotes', () => {
    // They have no `View ▾` section to fall back into, so a stage would have nowhere to send them.
    for (const id of ['legend', 'minimap']) {
      const toggle = LENS_TOGGLES.find((t) => t.id === id);
      expect(toggle?.group, id).toBeUndefined();
      expect(toggle?.promotion?.at, id).toBe('always');
    }
  });

  it('no record without a menu section carries a stage', () => {
    for (const toggle of LENS_TOGGLES) {
      if (toggle.group === undefined) expect(toggle.promotion?.at, toggle.id).toBe('always');
    }
  });

  it('are absent from the ladder: it holds only commands that have a menu to return to', () => {
    const ladderEntryIds = new Set(ALL_PROMOTION_ENTRIES.map((e) => e.id));
    for (const toggle of LENS_TOGGLES) {
      if (toggle.promotion?.at === 'always')
        expect(ladderEntryIds.has(toggle.id), toggle.id).toBe(false);
    }
    // And the ladder's 14 ranks are exactly the entries' stages.
    expect(Object.keys(PROMOTION_LADDER)).toHaveLength(14);
  });
});
