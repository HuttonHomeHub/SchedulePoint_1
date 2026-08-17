import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { selectionActionItems } from './selection-actions';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

/**
 * **An action whose subject is the selected object belongs on the object's surface** (ADR-0093).
 *
 * The command surface carries actions whose subject is the **plan or the view** — recalculate,
 * zoom, export, switch mode. The canvas dock carries actions whose subject is **the activity you
 * selected**. `Report progress` was in both, with the same permission, the same precondition and
 * the same dialog, and it was the only action in the plan workspace that was: four command-surface
 * items consult the selection and only that one had a dock twin.
 *
 * **Why this is a gate and not the comment in `tsld-toolbar-items.tsx`.** The duplication was added
 * knowingly — the dock item's own docblock says it mirrors the toolbar command's gate — so a
 * reviewer reading either file alone saw a correct item with a correct comment. Nothing was wrong
 * in one place; the wrongness only existed in the relationship. That is precisely the shape this
 * repository keeps re-finding by hand (ADR-0058), and the remedy it keeps landing on is a computed
 * check rather than a rule somebody remembers.
 *
 * **Both lists are derived from the registries, never restated.** A hard-coded roster of "the
 * selection-gated items" is the ADR-0073 C4 defect in miniature: a literal that silently falls
 * behind the vocabulary it claims to describe. The cost of deriving is that this test can only see
 * what the registries expose, which is why it matches on **id and label** rather than trying to
 * decide whether two `onActivate` functions do the same thing.
 */
describe('selection-gated commands do not duplicate the canvas dock (ADR-0093)', () => {
  const toolbarItems = buildTsldToolbarItems();

  /**
   * Item ids the dock offers, plus their labels normalised for comparison.
   *
   * The two surfaces punctuate differently on purpose — the command surface used
   * `Report progress…` (ADR's ellipsis convention: a plain command that opens a dialog) and the
   * dock uses `Report progress` — so a raw string comparison would have called the duplication two
   * different actions. The trailing ellipsis is stripped for that reason, and only for it.
   *
   * It also lower-cased, until the ADR-0093 carry-over review pointed out that the docblock's own
   * "and only for it" was false: the two labels this gate was written for differ in punctuation and
   * not in case, so the fold solved nothing here and only widened what counts as a duplicate —
   * raising the chance of a future PR being blocked by a coincidental collision between two
   * unrelated commands. Narrowed rather than documented, because there is no case-variance to
   * document.
   */
  const normalise = (label: string): string => label.replace(/…$/, '').trim();

  const dockIds = new Set(selectionActionItems.map((item) => item.id));
  const dockLabels = new Set(selectionActionItems.map((item) => normalise(item.label)));

  it('no command-surface item shares an id or a label with a dock item', () => {
    const offenders = toolbarItems
      .filter((item) => dockIds.has(item.id) || dockLabels.has(normalise(item.label)))
      .map((item) => `${item.id} ("${item.label}")`);

    expect(
      offenders,
      'this action acts on the selected activity, so it belongs on the canvas dock alone — ' +
        'see ADR-0093 for the discriminator, and delete the command-surface copy rather than ' +
        'renaming it to get past this assertion',
    ).toEqual([]);
  });

  it('`Report progress` is offered by the dock and by nothing in the command surface', () => {
    // The specific case the rule was written for, pinned by name as well as by the general
    // assertion above. Kept separate deliberately: the general test would still pass if BOTH copies
    // disappeared, and a reader arriving at a green suite would have no way to tell "the duplicate
    // is gone" from "the capability is gone" — which is the failure mode ADR-0081 records, where a
    // milestone's tests validated code no planner could reach.
    expect(
      [...dockLabels],
      'the dock is where reporting progress lives now — if this fails the capability has moved ' +
        'or been lost, which is a different (and worse) change than the one this file guards',
    ).toContain('Report progress');

    expect(toolbarItems.map((item) => item.id)).not.toContain('update-progress');
  });
});

/**
 * **The third roster ADR-0094 said this gate could not see.**
 *
 * That decision withdrew a second on-canvas remedy strip partly because the gate above "compares
 * two registries and a third is invisible to it" — recorded as a known hole rather than fixed,
 * because nothing then had a third. M5-T3's Gantt row menu is that third surface, so the hole is
 * closed here rather than inherited.
 *
 * The assertion is deliberately about **derivation, not equality**. Comparing rendered rosters would
 * need a mounted menu and a context, and would then pass if BOTH went empty — the ADR-0081 shape,
 * where a green suite cannot tell "the duplicate is gone" from "the capability is gone". Asserting
 * that the file imports the registry and declares no roster of its own catches the thing that
 * actually goes wrong: somebody typing the list out because it was quicker.
 */
describe('the Gantt row menu is the dock roster, not a third copy of it', () => {
  const ROW_MENU = join(import.meta.dirname, '..', '..', 'gantt', 'components', 'GanttRowMenu.tsx');
  const source = readFileSync(ROW_MENU, 'utf8');

  it('derives its items from `selectionActionItems`', () => {
    expect(
      source.includes('selectionActionItems'),
      'GanttRowMenu no longer reads the shared registry',
    ).toBe(true);
  });

  it('declares no roster of its own', () => {
    // A hand-written list is the failure mode: an array or record of action labels/ids sitting in
    // this file. Matching on the LABELS the registry already owns, so a copy is caught by the very
    // strings it copied.
    // Comments stripped first. This fired on its own first run against the DOCBLOCK above, which
    // cites `Report progress` while explaining why there is no roster — the prose that documents
    // the rule is exactly the text most likely to name the things it forbids restating. Same
    // treatment `link-paths.structural.test.ts` gives its obstacle terms, and for the same reason.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const rosterish = selectionActionItems
      .map((item) => item.label)
      .filter((label): label is string => typeof label === 'string')
      .filter((label) => new RegExp(`['"\`]${label}['"\`]`).test(code));

    expect(
      rosterish,
      `GanttRowMenu names dock actions literally (${rosterish.join(', ')}).\n\n` +
        `That is a third roster, which the gate above structurally cannot compare — ADR-0094 ` +
        `recorded exactly this hole. Render from \`selectionActionItems\` instead.`,
    ).toEqual([]);
  });
});
