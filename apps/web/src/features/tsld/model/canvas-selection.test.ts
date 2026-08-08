import { describe, expect, it } from 'vitest';

import {
  addAll,
  type CanvasSelection,
  clear,
  EMPTY_SELECTION,
  isSelected,
  reconcile,
  replace,
  replaceAll,
  toggle,
} from './canvas-selection';

/**
 * The pure canvas selection model (`docs/specs/canvas-multi-select/` M0-T2).
 *
 * The cases that matter are the ones about the **primary**, because that is where a selection model
 * usually goes wrong: it is easy to make the set right and leave the subject pointing at something
 * that has left. Every removal path is asserted for both the set and the primary.
 */
describe('replace — a plain click', () => {
  it('selects exactly one', () => {
    expect(replace('a')).toEqual({ ids: ['a'], primaryId: 'a' });
  });

  it('discards whatever was selected before', () => {
    const three = addAll(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(replace('z')).toEqual({ ids: ['z'], primaryId: 'z' });
    // …and does not mutate what it replaced.
    expect(three.ids).toEqual(['a', 'b', 'c']);
  });
});

describe('clear', () => {
  it('empties the set and the primary together', () => {
    expect(clear()).toEqual({ ids: [], primaryId: null });
  });

  it('returns the shared empty value, so an idle canvas allocates nothing', () => {
    expect(clear()).toBe(EMPTY_SELECTION);
  });
});

describe('toggle — ctrl/cmd-click', () => {
  it('adds an absent id and makes it the primary', () => {
    const one = replace('a');
    expect(toggle(one, 'b')).toEqual({ ids: ['a', 'b'], primaryId: 'b' });
  });

  it('removes a present id', () => {
    const two = addAll(EMPTY_SELECTION, ['a', 'b']);
    expect(toggle(two, 'a')).toEqual({ ids: ['b'], primaryId: 'b' });
  });

  it('falls the primary back to the most recently added SURVIVOR', () => {
    // Added a, then b, then c — so c is primary. Removing c must land on b, not on a.
    const three = addAll(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(three.primaryId).toBe('c');
    expect(toggle(three, 'c')).toEqual({ ids: ['a', 'b'], primaryId: 'b' });
  });

  it('leaves the primary alone when a NON-primary is removed', () => {
    const three = addAll(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(toggle(three, 'a')).toEqual({ ids: ['b', 'c'], primaryId: 'c' });
  });

  it('empties to the shared empty value when the last one leaves', () => {
    expect(toggle(replace('a'), 'a')).toBe(EMPTY_SELECTION);
  });

  it('is its own inverse', () => {
    const two = addAll(EMPTY_SELECTION, ['a', 'b']);
    expect(toggle(toggle(two, 'c'), 'c')).toEqual(two);
  });
});

describe('addAll and replaceAll', () => {
  it('addAll keeps what was selected', () => {
    expect(addAll(replace('a'), ['b', 'c'])).toEqual({ ids: ['a', 'b', 'c'], primaryId: 'c' });
  });

  it('addAll never duplicates, and does not re-order an id it already held', () => {
    const two = addAll(EMPTY_SELECTION, ['a', 'b']);
    expect(addAll(two, ['a', 'c'])).toEqual({ ids: ['a', 'b', 'c'], primaryId: 'c' });
  });

  it('addAll of only-already-selected ids does not move the primary', () => {
    const three = addAll(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(addAll(three, ['a', 'b']).primaryId).toBe('c');
  });

  it('replaceAll discards the previous set', () => {
    const three = addAll(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(replaceAll(['x', 'y'])).toEqual({ ids: ['x', 'y'], primaryId: 'y' });
    expect(three.ids).toEqual(['a', 'b', 'c']);
  });

  it('replaceAll of nothing is a clear — a marquee over empty ground', () => {
    expect(replaceAll([])).toBe(EMPTY_SELECTION);
  });

  it('replaceAll de-duplicates its input', () => {
    expect(replaceAll(['a', 'b', 'a'])).toEqual({ ids: ['a', 'b'], primaryId: 'b' });
  });
});

describe('reconcile — derived, not an effect', () => {
  const live = (...ids: string[]): ReadonlySet<string> => new Set(ids);

  it('drops ids that have left the plan', () => {
    const three = addAll(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(reconcile(three, live('a', 'c'))).toEqual({ ids: ['a', 'c'], primaryId: 'c' });
  });

  it('repairs the primary when the primary itself has gone', () => {
    const three = addAll(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(reconcile(three, live('a', 'b'))).toEqual({ ids: ['a', 'b'], primaryId: 'b' });
  });

  it('empties when nothing survives', () => {
    const two = addAll(EMPTY_SELECTION, ['a', 'b']);
    expect(reconcile(two, live('z'))).toBe(EMPTY_SELECTION);
  });

  it('returns the SAME object when nothing was dropped', () => {
    // Identity, not equality: this is what stops an unchanged selection churning a memo on every
    // render, which is the reason `reconcile` can afford to run at read time at all.
    const three = addAll(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(reconcile(three, live('a', 'b', 'c'))).toBe(three);
  });

  it('is a no-op on the empty selection', () => {
    expect(reconcile(EMPTY_SELECTION, live('a'))).toBe(EMPTY_SELECTION);
  });
});

describe('isSelected', () => {
  it('reports membership', () => {
    const two = addAll(EMPTY_SELECTION, ['a', 'b']);
    expect(isSelected(two, 'a')).toBe(true);
    expect(isSelected(two, 'z')).toBe(false);
  });
});

describe('the invariants hold under any sequence', () => {
  it('never holds a duplicate, and the primary is always the last id or null', () => {
    // A deliberately unlovely sequence: the point is that no ordering of reducers can break either
    // invariant, which is what every consumer downstream is entitled to assume.
    let s: CanvasSelection = EMPTY_SELECTION;
    const ops: ((x: CanvasSelection) => CanvasSelection)[] = [
      (x) => toggle(x, 'a'),
      (x) => addAll(x, ['b', 'a', 'c']),
      (x) => toggle(x, 'b'),
      (x) => addAll(x, ['b']),
      (x) => reconcile(x, new Set(['a', 'b'])),
      (x) => toggle(x, 'a'),
      () => replaceAll(['b', 'b', 'd']),
      (x) => toggle(x, 'd'),
    ];
    for (const op of ops) {
      s = op(s);
      expect(new Set(s.ids).size).toBe(s.ids.length);
      expect(s.primaryId).toBe(s.ids.length === 0 ? null : (s.ids[s.ids.length - 1] ?? null));
    }
  });
});
