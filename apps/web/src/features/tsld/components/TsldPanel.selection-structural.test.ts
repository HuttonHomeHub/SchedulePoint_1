import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The M0 inertness proof** (`docs/specs/canvas-multi-select/` M0-T3).
 *
 * M0 swaps the canvas's `useState<string | null>` for the set model and changes nothing else. The
 * property that makes that safe is not "the tests still pass" — they would also pass if a plural
 * reducer were wired to a path no test exercises — it is that **the plural reducers are not
 * imported at all**. A module that cannot name `toggle` cannot call it.
 *
 * So this is a source assertion rather than a behavioural one, and deliberately so: it is the
 * cheapest thing that actually holds the line, and it fails the moment a later milestone wires a
 * plural path *without* removing this test, which is exactly when someone should be made to think
 * about the flag.
 *
 * When M2 lands the pointer gestures, this test is **replaced, not deleted** — by the flag-gated
 * version that asserts the plural reducers are reachable only behind `CANVAS_MULTI_SELECT_ENABLED`.
 */
const PANEL = readFileSync(join(import.meta.dirname, 'TsldPanel.tsx'), 'utf8');

/**
 * The source with comments removed.
 *
 * Necessary rather than fastidious: the first version of the plural-reducer assertion scanned the
 * raw file and went red on the word "toggle" inside four sentences of prose about the WBS band and
 * the Late overlay. A gate that fires on a comment is a gate someone deletes.
 */
const CODE = PANEL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The import block for the selection model, however it is formatted. */
function selectionImport(): string {
  const match = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/model\/canvas-selection';/.exec(PANEL);
  expect(match, 'TsldPanel imports the canvas selection model').not.toBeNull();
  return match?.[1] ?? '';
}

describe('flag-off, TsldPanel cannot reach a plural selection', () => {
  it('imports only the singular reducers', () => {
    const imported = selectionImport()
      .split(',')
      .map((s) => s.replace(/^\s*type\s+/, '').trim())
      .filter(Boolean)
      .sort();
    // `EMPTY_SELECTION` and the type are inert; `replace` and `clear` are the only two reducers.
    expect(imported).toEqual(['CanvasSelection', 'EMPTY_SELECTION', 'clear', 'replace']);
  });

  it.each(['toggle', 'addAll', 'replaceAll', 'spanTo'])(
    'never calls the plural reducer %s',
    (plural) => {
      // A *call site*, not a mention: `(?<![.\w])` rejects both a member call (`s.replaceAll(…)`,
      // which is `String.prototype` and nothing to do with this model) and a longer identifier that
      // merely ends with the name. Comments are already stripped, so a sentence cannot fire it.
      expect(CODE).not.toMatch(new RegExp(`(?<![.\\w])${plural}\\s*\\(`));
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
});
