import { describe, expect, it } from 'vitest';

import { buildTsldToolbarItems } from './tsld-toolbar-items';

import type { ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';
import { selectionActionItems } from '@/features/plan-actions/selection-actions';

/**
 * **Only a plain, described button may be `'roomy'`** (toolbar-redesign M1).
 *
 * A `'roomy'` label disappears under a container query with no JavaScript involved, so the control
 * has to be one that already mounts the `description` tooltip naming it: `ToolbarButton` does, and
 * the custom triggers (`ToolbarPopover`, `ToolbarSplitButton`, the `render` items) carry only a
 * native `title`. `defineToolbar` refuses the bad declaration at module load; this file asserts the
 * same thing against the **real** registries, and pins which items are `'roomy'` so adding or
 * dropping one is a decision rather than an accident.
 *
 * The set is the compact set CQ-2 + OD-1 named — Baseline overlay, Comments, Settings and Resource
 * view. **Apply levelled dates… (D-l) is deliberately not in it yet**: labelled from 79 rem it puts
 * the DO row over one line at 1280 while Summary and Comments still sit there (measured: the deck's
 * line count goes 2 → 3 at 1280), so it joins in M2, when they have left.
 *
 * **Its blind spot, stated**: it reads the declarations. That `ToolbarButton` really mounts the
 * tooltip and `Deck` really applies the variant is `ToolbarButton`'s and the journey's to prove.
 */
const ROOMY = ['baseline-overlay', 'calendar', 'comments', 'resource-view'];

const registries: [string, ToolbarItem<never>[]][] = [
  ['the command deck', buildTsldToolbarItems()],
  ['the selection bar', selectionActionItems],
];

describe("the registries' 'roomy' items", () => {
  const roomy = registries.flatMap(([surface, items]) =>
    items.filter((i) => i.labelVisibility === 'roomy').map((item) => ({ surface, item })),
  );

  it('are exactly the four the design names for M1', () => {
    expect(roomy.map(({ item }) => item.id).sort()).toEqual(ROOMY);
  });

  it('are on the deck, because the selection bar is not a container', () => {
    expect(roomy.filter(({ surface }) => surface !== 'the command deck')).toEqual([]);
  });

  for (const id of ROOMY) {
    it(`${id} is a plain onActivate item with a description of its own`, () => {
      const found = roomy.find(({ item }) => item.id === id);
      expect(found, `${id} is not 'roomy' in any registry`).toBeDefined();
      const { item } = found!;
      expect(typeof item.onActivate, `${id} must be rendered by ToolbarButton`).toBe('function');
      expect(item.render, `${id} is a render item`).toBeUndefined();
      expect(item.description, `${id} has no description`).toBeTruthy();
      // A description that is the name again is a name-echo, which is exactly what the always-
      // mounted tooltip must not be. "Settings…" once carried "Schedule settings".
      const bare = (text: string): string => text.replace(/[….]+$/u, '').toLowerCase();
      expect(bare(item.description!)).not.toBe(bare(item.label));
    });
  }
});
