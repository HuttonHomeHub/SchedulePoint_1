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

/**
 * Every top-level `const name = (…) => { … }` in the file, as `[name, body]`.
 *
 * Bodies are cut at the next top-level `const NAME = ` — crude, but the property being asserted is
 * "the flag is named before the reducer **in the same function**", and an over-long body can only
 * make that assertion weaker at a boundary, never produce a false pass for a function that has no
 * guard at all.
 */
function topLevelFunctions(): [string, string][] {
  const starts = [...CODE.matchAll(/\n {2}const (\w+) = /g)];
  return starts.map((m, i) => {
    const from = m.index ?? 0;
    const to = starts[i + 1]?.index ?? CODE.length;
    return [m[1] ?? '', CODE.slice(from, to)];
  });
}

describe('the plural selection reducers are reachable only behind the flag', () => {
  it.each(['toggle', 'addAll', 'replaceAll'])(
    'names CANVAS_MULTI_SELECT_ENABLED before every call to %s',
    (plural) => {
      const calls = callSites(plural);
      if (calls === 0) return; // not wired yet — nothing to guard, and that is not a failure

      // The property is per-FUNCTION, not per-`if`: two handlers reach the plural reducers
      // (`select` for the modifier clicks, `selectRegion` for a marquee) and they guard in
      // different shapes — one an early branch, one an early return. Asserting one shape would
      // have forced the second handler to copy the first's control flow for the test's benefit,
      // which is how a gate starts distorting the code it is supposed to protect.
      let guarded = 0;
      for (const [name, body] of topLevelFunctions()) {
        const call = new RegExp(`(?<![.\\w])${plural}\\s*\\(`).exec(body);
        if (!call) continue;
        const flag = body.indexOf('CANVAS_MULTI_SELECT_ENABLED');
        expect(flag, `${name}() names the flag`).toBeGreaterThanOrEqual(0);
        expect(flag, `${name}() names the flag BEFORE it calls ${plural}`).toBeLessThan(
          call.index ?? 0,
        );
        guarded += (body.match(new RegExp(`(?<![.\\w])${plural}\\s*\\(`, 'g')) ?? []).length;
      }
      // …and every call is inside one of those functions: a call at module scope, or in a function
      // this scan cannot see, would leave the totals apart.
      expect(guarded).toBe(calls);
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
