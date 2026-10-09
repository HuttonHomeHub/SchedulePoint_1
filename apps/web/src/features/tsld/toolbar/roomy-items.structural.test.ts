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
 * view — **plus Apply levelled dates… (D-l)**. That one joined at M2 as `'roomy-fine'`: the word shows
 * for a mouse from 79 rem, and a coarse pointer keeps the icon at every width, because the word cost
 * touch a third DO line at 1280 (owner decision, 2026-10-09). The others are plain `'roomy'`.
 *
 * **Its blind spot, stated**: it reads the declarations. That `ToolbarButton` really mounts the
 * tooltip and `Deck` really applies the variant is `ToolbarButton`'s and the journey's to prove.
 */
const ROOMY = ['apply-levelling', 'baseline-overlay', 'calendar', 'comments', 'resource-view'];

const registries: [string, ToolbarItem<never>[]][] = [
  ['the command deck', buildTsldToolbarItems()],
  ['the selection bar', selectionActionItems],
];

describe("the registries' 'roomy' items", () => {
  const roomy = registries.flatMap(([surface, items]) =>
    items
      .filter((i) => i.labelVisibility === 'roomy' || i.labelVisibility === 'roomy-fine')
      .map((item) => ({ surface, item })),
  );

  it('are exactly the five the design names', () => {
    expect(roomy.map(({ item }) => item.id).sort()).toEqual(ROOMY);
  });

  it('give only Apply levelled dates… the per-pointer form', () => {
    const fine = roomy
      .filter(({ item }) => item.labelVisibility === 'roomy-fine')
      .map(({ item }) => item.id);
    expect(fine).toEqual(['apply-levelling']);
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
