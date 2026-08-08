import { describe, expect, it, vi } from 'vitest';

import {
  type CanvasSelection,
  clear,
  EMPTY_SELECTION,
  reconcile,
  replace,
} from './canvas-selection';

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_MULTI_SELECT_ENABLED: false,
}));

/**
 * **The rollback contract** for `VITE_CANVAS_MULTI_SELECT` (spec `docs/specs/canvas-multi-select/`
 * M0-T3).
 *
 * Flag-off, the canvas selection must be singular **structurally**, not by convention — which means
 * the property to assert is not "the reducers behave" but "only two of them are reachable, and
 * those two cannot produce a set bigger than one". That is the difference between a rollback that
 * restores today's behaviour and one that restores today's behaviour *as long as nobody wired a new
 * call site*.
 *
 * Written now, at M0, rather than at the flip. A parity suite authored after the feature tests what
 * was built; authored before, it tests what was promised — and this repo has the ADR-0053 M6 rule
 * that a parity suite is kept and pinned, never weakened, on the day it is needed.
 */
describe('flag-off, the selection is structurally singular', () => {
  it('replace and clear cannot produce more than one id, in any order', () => {
    let s: CanvasSelection = EMPTY_SELECTION;
    // The only two reducers a flag-off canvas may call. Any sequence of them, of any length.
    const reachable: ((x: CanvasSelection) => CanvasSelection)[] = [
      () => replace('a'),
      () => replace('b'),
      () => clear(),
      () => replace('c'),
      () => clear(),
      () => replace('a'),
      (x) => reconcile(x, new Set(['a', 'b', 'c'])),
      (x) => reconcile(x, new Set()),
      () => replace('b'),
    ];
    for (const op of reachable) {
      s = op(s);
      expect(s.ids.length).toBeLessThanOrEqual(1);
      expect(s.primaryId).toBe(s.ids[0] ?? null);
    }
  });

  it('reconcile cannot grow a selection — it only ever drops', () => {
    // The one reducer that runs on every read, so the one most able to break the invariant quietly
    // if it ever gained an "add what is newly selectable" branch.
    const one = replace('a');
    expect(reconcile(one, new Set(['a', 'b', 'c'])).ids).toEqual(['a']);
    expect(reconcile(EMPTY_SELECTION, new Set(['a', 'b'])).ids).toEqual([]);
  });

  it('the empty selection is the same shape a null id was', () => {
    // Every pre-existing consumer reads `primaryId` where it used to read `selectedId`. Nothing is
    // selected must therefore still be exactly `null`, not `undefined` and not an empty string —
    // the three of which behave differently in the `selectedId ? … : …` branches that already exist.
    expect(EMPTY_SELECTION.primaryId).toBeNull();
    expect(clear().primaryId).toBeNull();
  });
});
