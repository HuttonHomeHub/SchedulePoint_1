import { describe, expect, it } from 'vitest';

import { CONFLICT_FLAGS, type ConflictKey } from '../render/conflicts';

import { CONFLICT_REMEDIES, leadingConflictKey } from './conflict-remedy';
import { selectionActionItems } from './selection-actions';

/**
 * **Every conflict a planner can land on has a remedy behind it** (ADR-0094 D4).
 *
 * The compiler already forces `CONFLICT_REMEDIES` to be total over `ConflictKey`, which is why that
 * union was closed in M1-T1. What it cannot force is the other direction: a flag added to
 * `CONFLICT_FLAGS` **with a key already in the union** would type-check while the two lists said
 * different things. These assertions close that, and they are cheap enough to be worth having for a
 * set this small.
 *
 * The failure they prevent is the register's most-repeated one — a control that lights up and does
 * nothing (ADR-0059 M6's zoom, ADR-0062 M6's hidden form, ADR-0064 §7's replaying confirmation). A
 * conflict with no remedy is that shape at one remove: the cycle takes a planner somewhere and then
 * has nothing to offer them.
 */
describe('the remedy map and the conflict set describe the same thing', () => {
  it('offers a remedy for every flag, and no remedy for anything else', () => {
    const flagKeys = [...CONFLICT_FLAGS.map((flag) => flag.key)].sort();
    const remedyKeys = (Object.keys(CONFLICT_REMEDIES) as ConflictKey[]).sort();
    expect(remedyKeys).toEqual(flagKeys);
  });

  it('names a non-empty label for each, since the label IS the affordance', () => {
    for (const [key, remedy] of Object.entries(CONFLICT_REMEDIES)) {
      expect(remedy.label.trim(), `${key} has no label`).not.toBe('');
    }
  });

  it('resolves every `barAction` remedy to an item the selection bar actually registers', () => {
    // The load-bearing half of the `barAction` decision (M4-T1). That kind exists so the
    // `visualConflict` remedy points at the bar's own `clear-visual-placement` item instead of
    // duplicating it — and a pointer into a registry is only as good as the id being right. Rename
    // or drop that item and the remedy silently becomes a conflict with nothing behind it: the
    // "lit but inert" class this register has recorded shipping three times, arriving through the
    // one door the total-`Record` typecheck cannot watch.
    const registered = new Set(selectionActionItems.map((item) => item.id));
    for (const [key, remedy] of Object.entries(CONFLICT_REMEDIES)) {
      if (remedy.kind !== 'barAction') continue;
      expect(
        registered,
        `${key}'s remedy points at "${remedy.itemId}", which the selection bar does not register`,
      ).toContain(remedy.itemId);
    }
  });
});

describe('the two sides of a placement conflict are answered differently', () => {
  /**
   * **The assertion that makes the key split worth having** (one-planning-surface M-D).
   *
   * Everything above would pass with both placement keys mapped to the same remedy — the map would
   * be total, every label non-empty, every `barAction` id real. It would also make the split
   * pointless: the engine would report which side, the count would carry it, and the thing a
   * planner presses would throw it away. That is the shape this repository keeps recording — a fix
   * carried to within one step of the surface and dropped there.
   *
   * It is also the assertion a later "simplify these two identical-looking entries" edit trips over,
   * which is the point. The argument for the difference is in `conflict-remedy.ts` beside the entry;
   * this is what stops it being quietly reversed.
   */
  it('answers the earlier side with the bar action and the later side with a route', () => {
    const earlier = CONFLICT_REMEDIES.visualEarlierThanLogic;
    const later = CONFLICT_REMEDIES.visualLaterThanBound;

    // Earlier than logic: the placement is the planner's own input and withdrawing it resolves the
    // clash, so the remedy NAMES the bar's existing item rather than rendering a twin (ADR-0093).
    expect(earlier.kind).toBe('barAction');

    // Later than a bound: a route, because a `barAction` renders nothing, and the fact this planner
    // most likely does not have is that the bound EXISTS. Clearing the placement stays available —
    // `clear-visual-placement` is unconditional in Visual mode — so this ADDS a route rather than
    // replacing one.
    expect(later.kind).toBe('openEditorAt');
    expect(later).toMatchObject({ at: 'constraint' });
  });

  it('leads with the side the engine reported, not with whichever comes first', () => {
    // The two are mutually exclusive by construction (the engine returns one reason), so this is
    // really a check that neither predicate has been written to match the other's value — the
    // copy-paste slip that would make every placement conflict report the same side.
    expect(leadingConflictKey({ ...CLEAN, visualConflictReason: 'EARLIER_THAN_LOGIC' })).toBe(
      'visualEarlierThanLogic',
    );
    expect(leadingConflictKey({ ...CLEAN, visualConflictReason: 'LATER_THAN_BOUND' })).toBe(
      'visualLaterThanBound',
    );
    expect(leadingConflictKey({ ...CLEAN, visualConflictReason: null })).toBeNull();
  });
});

/** An activity carrying no flag at all — the base every case above flips one field of. */
const CLEAN = {
  constraintViolated: false,
  visualConflictReason: null,
  levelingWindowExceeded: false,
} as const;

describe('leadingConflictKey', () => {
  const clean = {
    constraintViolated: false,
    visualConflictReason: null,
    levelingWindowExceeded: false,
  };

  it('is null for an unflagged activity', () => {
    expect(leadingConflictKey(clean)).toBeNull();
  });

  it('returns the flag an activity carries', () => {
    expect(leadingConflictKey({ ...clean, visualConflictReason: 'EARLIER_THAN_LOGIC' })).toBe(
      'visualEarlierThanLogic',
    );
    expect(leadingConflictKey({ ...clean, visualConflictReason: 'LATER_THAN_BOUND' })).toBe(
      'visualLaterThanBound',
    );
    expect(leadingConflictKey({ ...clean, levelingWindowExceeded: true })).toBe(
      'levelingWindowExceeded',
    );
  });

  it('leads with the set order when an activity carries several', () => {
    // The same order `orderedConflicts` lists reasons in, because it is the same source. A planner
    // reading "constraint conflict" on the bar and being offered the levelling remedy would be a
    // small, quiet lie — the kind that only shows up on the plans carrying two flags at once.
    expect(
      leadingConflictKey({ ...clean, constraintViolated: true, levelingWindowExceeded: true }),
    ).toBe('constraintViolated');
  });
});
