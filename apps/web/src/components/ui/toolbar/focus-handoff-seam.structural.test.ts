import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **One focus-handoff rule, in one module, called by both primitives.**
 *
 * `toolbar-keyboard.ts`'s docblock records what happens otherwise: `Toolbar` and `Deck` held two
 * copies of the roving-key rule, and the copies drifted the moment one was fixed — a WCAG 2.2
 * §2.1.1 defect was closed in `Deck` and left standing in `Toolbar`, under a docblock describing
 * the deck's search field. This is that rule applied to the sibling question, before the drift
 * rather than after it.
 *
 * **Both limbs matter, and the positive one is not decoration.** A test asserting only "neither
 * primitive contains its own copy" passes perfectly against a tree where neither primitive calls
 * the hook at all — which is the same green as a correct one, and would let M2 be reverted with
 * nothing going red. That is ADR-0093's lesson (a census that cannot tell "all classified" from
 * "found nothing") and ADR-0108's, where exactly that hole appeared in a gate's first run.
 *
 * Comments are stripped before scanning, because this repository has recorded four gates matching
 * their own prose — `reset-fills.structural.test.ts`, the ADR-0097 weight ratchet, the sizing
 * ratchet and ADR-0121's gate. Writing down *why* a primitive must not do something would
 * otherwise count as doing it.
 */
const SRC = join(process.cwd(), 'src');
const HOOK_FILE = join(SRC, 'components/ui/toolbar/use-focus-handoff.ts');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * **The roster is derived, not listed (#306b).** A list of `['Toolbar.tsx', 'Deck.tsx']` could not
 * see `HierarchyTree.tsx` when it became the third adopter, and a fourth would have been invisible
 * the same way. A consumer is any production file that IMPORTS the hook (comments stripped, so a
 * docblock that names it does not count), found by scanning `src/`.
 */
const IMPORTS_HOOK = /import \{[^}]*useToolbarFocusHandoff[^}]*\} from '[^']*use-focus-handoff'/;
const CONSUMERS = sourceFiles(SRC)
  .filter((path) => path !== HOOK_FILE)
  .filter((path) => IMPORTS_HOOK.test(stripComments(readFileSync(path, 'utf8'))))
  .map((path) => relative(SRC, path))
  .sort();

/** The `Toolbar`/`Deck` pair, whose container is a `role="toolbar"` with a marked item scope. */
const PRIMITIVES = CONSUMERS.filter((path) => path.startsWith('components/ui/toolbar/'));

function consumerSource(file: string): string {
  return stripComments(readFileSync(join(SRC, file), 'utf8'));
}
const primitiveSource = consumerSource;

describe('the roster is derived, and it is not empty', () => {
  it('finds the three known consumers', () => {
    // The floor, not the ceiling: a fourth adopter joins every assertion below on the day it is
    // written. Verified red by emptying the scan: the derived list is `[]` and this fails, where
    // every `it.each` below would have passed vacuously.
    expect(CONSUMERS).toEqual(
      expect.arrayContaining([
        'components/ui/toolbar/Deck.tsx',
        'components/ui/toolbar/Toolbar.tsx',
        'features/navigator/components/HierarchyTree.tsx',
      ]),
    );
  });
});

describe('the focus-handoff rule has exactly one home', () => {
  it.each(CONSUMERS)('%s imports the shared hook rather than implementing one', (file) => {
    // The positive limb. Verified red by deleting the import from each consumer in turn.
    expect(consumerSource(file)).toMatch(IMPORTS_HOOK);
  });

  it.each(CONSUMERS)('%s actually SPREADS the hook, not merely imports it', (file) => {
    // **The component review's blocking finding, and it is this gate's own stated purpose failing
    // on itself.** The limb above proves the module is imported. A refactor of the container's prop
    // list that calls `useToolbarFocusHandoff(...)` and drops `{...focusHandoff}` would pass every
    // other assertion here while silently disabling the whole WCAG 2.4.3 mechanism — which is
    // exactly the "cannot tell 'all classified' from 'found nothing'" shape (ADR-0093) this file's
    // docblock invokes and did not quite close.
    //
    // Verified red by deleting the spread from each container in turn.
    const source = consumerSource(file);
    expect(source).toMatch(/\{\.\.\.focusHandoff\}/);
  });

  it.each(PRIMITIVES)('%s spreads it on the role="toolbar" container itself', (file) => {
    // …and it must be on the container, not on some inner element. The `role="toolbar"` attribute
    // and the spread sit within a few lines of each other on the same JSX element. (The tree's
    // container is `role="tree"`, so this limb is the toolbar primitives' own.)
    expect(primitiveSource(file)).toMatch(/role="toolbar"[\s\S]{0,600}?\{\.\.\.focusHandoff\}/);
  });

  it.each(PRIMITIVES)('%s carries no second copy of the rule', (file) => {
    // Verified red by pasting the guard back into `Toolbar.tsx`.
    //
    // **The ban is on the QUESTION, not on the API**, and the first version got that wrong: it
    // refused any `document.activeElement` and went red against `Deck.tsx:209`, which reads it to
    // find which item the roving walk should step from. That is a correct, unrelated use, and a
    // gate that forbids it would push the next author into a worse shape to get past it. What must
    // have one home is "was focus DROPPED?" — the comparison against `document.body` or `null`.
    const source = primitiveSource(file);
    expect(
      source,
      'a primitive asking whether focus was dropped is deciding this question itself',
    ).not.toMatch(
      // **Both operand orders.** The component review ran the single-order pattern and confirmed
      // `document.body !== document.activeElement` — semantically identical — sails straight
      // through it. A reimplementation written the other way round would have been invisible.
      /activeElement\s*[!=]==\s*(document\.body|null)|(document\.body|null)\s*[!=]==\s*\w*\.?activeElement/,
    );
    expect(source, 'a primitive scheduling a frame is running its own handoff yield').not.toMatch(
      /requestAnimationFrame/,
    );
  });

  it.each(PRIMITIVES)('%s gives the hook somewhere to put focus', (file) => {
    // A container with no `tabIndex` silently refuses `focus()`, and the hook's own "did focus
    // land?" check then makes it fail QUIETLY — no announcement, no move, nothing red. Verified
    // red by removing `tabIndex={-1}` from each container.
    expect(primitiveSource(file)).toMatch(/role="toolbar"[\s\S]{0,400}?tabIndex=\{-1\}/);
  });

  it.each(PRIMITIVES)('%s attributes a render item with a DISTINCT marker attribute', (file) => {
    // `data-toolbar-item-scope`, never a second `data-toolbar-item`. `Toolbar.onKeyDown` focuses by
    // `querySelector('[data-toolbar-item="…"]')` and `Deck.focusables()` queries
    // `[data-toolbar-focusable]` in document order — a duplicate marker on the wrapper would match
    // first and its `.focus()` does nothing, silently breaking roving focus on every split button.
    const source = primitiveSource(file);
    expect(source).toMatch(/data-toolbar-item-scope=\{r\.item\.id\}/);
    // The wrapper must not also carry the focusable marker.
    expect(source).not.toMatch(
      /data-toolbar-item-scope=\{r\.item\.id\}[\s\S]{0,120}?data-toolbar-item=/,
    );
  });
});
