import { describe, expect, it } from 'vitest';

import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { splitByRow } from '@/components/ui/toolbar';
import type { ToolbarItem } from '@/components/ui/toolbar/toolbar-registry';
import { selectionActionItems } from '@/features/plan-actions/selection-actions';

/**
 * **No tool is lost: every control M2 moved resolves in its new home, and only there**
 * (toolbar-redesign M2, SC-14's M2 slice; the full manifest is M5-T1's).
 *
 * A relocation is a deletion in one file and an addition in another, and nothing makes the two
 * agree: `Share` was lost this way once (`tsld-toolbar-items.tsx`'s own history). So the before and
 * after are written down here as data, **resolved against the real registries** — never against a
 * list of ids kept in step by hand, which is the ADR-0073 C4 shape — and a control that is missing
 * from its new home, or still present in its old one, fails by name.
 *
 * The table is the whole of what M2 moved:
 *
 * | tool                  | before                   | after                                   |
 * | --------------------- | ------------------------ | --------------------------------------- |
 * | Summary               | deck, Plan group         | header identity row, "Plan summary"     |
 * | Edit plan             | header pencil (unregist.)| header identity row, "Edit plan details"|
 * | Float paths           | deck, Find group         | selection bar + Gantt row menu          |
 * | Legend                | deck, View group         | deck, Panels group                      |
 * | Resource view         | deck, View group         | deck, Panels group                      |
 * | Comments              | deck, Plan group         | deck, Panels group                      |
 *
 * **Its blind spot, stated**: it reads declarations. That the identity row, the Panels group and the
 * bar are actually rendered, in order, in a browser is `command-surface.spec.ts`'s.
 */
const deck = buildTsldToolbarItems();
const rows = splitByRow(deck);

const find = <T>(items: ToolbarItem<T>[], id: string): ToolbarItem<T> | undefined =>
  items.find((item) => item.id === id);

describe('the controls M2 moved resolve in their new home and nowhere else', () => {
  it('puts Plan summary and Edit plan details on the identity row, in group `object`', () => {
    for (const [id, label] of [
      ['summary', 'Plan summary'],
      ['edit-plan', 'Edit plan details'],
    ] as const) {
      const item = find(rows.identity, id);
      expect(item, `${id} is not on the identity row`).toBeDefined();
      expect(item?.label).toBe(label);
      expect(item?.group).toBe('object');
      expect(find(rows.strip, id), `${id} is still on the deck`).toBeUndefined();
    }
  });

  it('puts Legend, Resource view and Comments in the deck group Deck renders as "Panels"', () => {
    for (const id of ['legend', 'resource-view', 'comments']) {
      const item = find(rows.strip, id);
      expect(item, `${id} is not on the deck`).toBeDefined();
      expect(item?.group, `${id} is not in the registry group Deck maps to Panels`).toBe('help');
      expect(find(rows.identity, id)).toBeUndefined();
    }
  });

  it('puts Float paths on the selection bar, which the Gantt row menu derives from, and not on the deck', () => {
    expect(find(selectionActionItems, 'float-paths'), 'the bar has no Float paths').toBeDefined();
    expect(find(deck, 'float-paths'), 'the deck still has Float paths').toBeUndefined();
  });

  it('leaves nothing on the deck in the `object` group that belongs to the plan header', () => {
    // What is left in `object` is the plan's actions — Analysis and Settings — never a plan fact.
    expect(rows.strip.filter((item) => item.group === 'object').map((item) => item.id)).toEqual(
      expect.arrayContaining(['analysis', 'calendar']),
    );
    expect(rows.strip.filter((item) => item.row === 'identity')).toEqual([]);
  });
});
