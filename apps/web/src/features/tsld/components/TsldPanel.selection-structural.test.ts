import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The rollback contract for the canvas selection** (`docs/specs/canvas-multi-select/`).
 *
 * At M0 this file asserted that `TsldPanel` could not *name* a plural reducer — the strongest form
 * of "flag-off is singular", available only while the plural path did not exist. M2 wires the
 * modifier clicks, so that assertion is retired **by replacement, not deletion**, which is the point
 * at which someone has to think about the flag rather than notice a red test and delete it.
 *
 * What survives is the property that still holds and still matters: **every plural reducer sits
 * behind `CANVAS_MULTI_SELECT_ENABLED`**. Flag-off, `select()` returns before it can reach one, so
 * the canvas is singular by control flow rather than by convention.
 *
 * This is a source assertion, deliberately. A behavioural test proves what the mounted component
 * does with the flag its bundle was built with; this proves that no *other* path into the plural
 * reducers exists — which is exactly what a rollback needs to be true and what no amount of
 * flag-off green tells you.
 */
const PANEL = readFileSync(join(import.meta.dirname, 'TsldPanel.tsx'), 'utf8');

/**
 * The source with comments removed.
 *
 * Necessary rather than fastidious: the first version of this assertion scanned the raw file and
 * went red on the word "toggle" inside four sentences of prose about the WBS band and the Late
 * overlay. A gate that fires on a comment is a gate someone deletes.
 */
const CODE = PANEL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every call site of `name(`, ignoring member calls and longer identifiers that merely end in it. */
function callSites(name: string): number {
  return (CODE.match(new RegExp(`(?<![.\\w])${name}\\s*\\(`, 'g')) ?? []).length;
}

describe('the plural selection reducers are reachable only behind the flag', () => {
  it.each(['toggle', 'addAll', 'replaceAll'])(
    'guards every call to %s with CANVAS_MULTI_SELECT_ENABLED',
    (plural) => {
      const calls = callSites(plural);
      if (calls === 0) return; // not wired yet — nothing to guard, and that is not a failure
      // Every plural reducer lives inside `select()`'s flagged branch. The cheapest true statement
      // about that is a proximity one: each call must have the flag named in the same function, and
      // `select()` is the only function that names it near a reducer.
      const guardedRegion =
        /if \(CANVAS_MULTI_SELECT_ENABLED && modifier && id\) \{([\s\S]*?)\n {4}\}/.exec(
          CODE,
        )?.[1] ?? '';
      expect(guardedRegion, 'select() has a flag-guarded plural branch').not.toBe('');
      const inGuard = (guardedRegion.match(new RegExp(`(?<![.\\w])${plural}\\s*\\(`, 'g')) ?? [])
        .length;
      expect(inGuard).toBe(calls);
    },
  );

  it('holds exactly one selection state hook, so there is no second source of truth', () => {
    // Two selection states in one component is how a canvas and its own a11y layer end up
    // disagreeing about what is selected — and it would be invisible, because each looks right.
    const hooks = CODE.match(/useState<CanvasSelection>/g) ?? [];
    expect(hooks).toHaveLength(1);
  });

  it('derives selectedId rather than storing it', () => {
    // The alias is what keeps ~40 consumers untouched. If someone re-introduces a stored
    // `selectedId`, the two can drift for a frame — which is precisely the class of bug the
    // derived-not-effect rule exists to prevent.
    expect(CODE).toMatch(/const selectedId = selection\.primaryId;/);
    expect(CODE).not.toMatch(/useState<string \| null>\(null\);[\s\S]{0,40}selectedId/);
  });

  it('takes the singular path first when no modifier is passed', () => {
    // The flag-off call shape. `select(id)` with no second argument must fall through to
    // `setSelectedId`, which is the one-line difference between a rollback and a rewrite.
    expect(CODE).toMatch(/if \(CANVAS_MULTI_SELECT_ENABLED && modifier && id\)/);
  });
});
