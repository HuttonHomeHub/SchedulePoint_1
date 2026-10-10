import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  computePromotionStages,
  derivePromotedItems,
  isPromoted,
  NO_PROMOTION,
  stageOf,
  type PromotableEntry,
  type PromotionWidths,
  type PromotionState,
} from './toolbar-promotion';
import { defineToolbar, resolveItems, type ToolbarItem } from './toolbar-registry';

/** A two-row ladder small enough to check by hand. */
function widths(over: Partial<PromotionWidths> = {}): PromotionWidths {
  const free = (b: number, w: number) => ({ freeBase: b, freeWorst: w });
  return {
    itemGapPx: 4,
    entries: [
      { rank: 'A', row: 'look', width: 96 },
      { rank: 'B', row: 'look', width: 196 },
      { rank: 'C', row: 'look', width: 46 },
      { rank: 'D', row: 'do', width: 96 },
    ],
    ladderOrder: { look: ['A', 'B', 'C'], do: ['D'] },
    freeWidthByStage: {
      look: {
        PROMOTE_80: free(120, 60),
        PROMOTE_90: free(300, 250),
        PROMOTE_119_5: free(600, 560),
        PROMOTE_160: free(900, 860),
      },
      do: {
        PROMOTE_80: free(90, 90),
        PROMOTE_90: free(90, 90),
        PROMOTE_119_5: free(400, 400),
        PROMOTE_160: free(400, 400),
      },
    },
    ...over,
  };
}

describe('isPromoted', () => {
  const state = (stage: PromotionState['stage'], pointer: PromotionState['pointer'] = 'fine') => ({
    stage,
    pointer,
  });

  it("an 'always' record is on the bar at every stage, including none", () => {
    for (const stage of [0, 1, 2, 3, 4] as const) {
      expect(isPromoted('always', state(stage))).toBe(true);
    }
  });

  it('is on the bar from its stage and never below it (monotonic)', () => {
    const at = { fine: 'PROMOTE_90', coarse: 'PROMOTE_160' } as const;
    expect(
      [0, 1, 2, 3, 4].map((stage) => isPromoted(at, state(stage as 0 | 1 | 2 | 3 | 4))),
    ).toEqual([false, false, true, true, true]);
  });

  it('reads the threshold of the pointer in use', () => {
    const at = { fine: 'PROMOTE_80', coarse: 'PROMOTE_160' } as const;
    expect(isPromoted(at, state(2, 'fine'))).toBe(true);
    expect(isPromoted(at, state(2, 'coarse'))).toBe(false);
    expect(isPromoted(at, state(4, 'coarse'))).toBe(true);
  });

  it("'never' is never on the bar, however wide", () => {
    expect(isPromoted({ fine: 'never', coarse: 'never' }, state(4))).toBe(false);
  });

  it('a viewport that has reached no stage promotes nothing but the permanent records', () => {
    expect(isPromoted({ fine: 'PROMOTE_80', coarse: 'PROMOTE_80' }, NO_PROMOTION)).toBe(false);
    expect(stageOf('PROMOTE_80')).toBe(1);
    expect(stageOf('PROMOTE_160')).toBe(4);
  });
});

describe('computePromotionStages', () => {
  it('fills the remainder in rank order, skipping an entry that does not fit', () => {
    // At 80 rem LOOK has 60 reserved: A (96 + 4) and B (196 + 4) do not fit, and C (46 + 4) is NOT
    // blocked by them — a wide entry early in the ladder must not strand a narrow one behind it.
    // At 90 rem (250 reserved, 50 carried) A fits and B (200) does not fit the 100 left.
    const stages = computePromotionStages(widths());
    expect(stages.C).toBe('PROMOTE_80');
    expect(stages.A).toBe('PROMOTE_90');
    expect(stages.B).toBe('PROMOTE_119_5');
  });

  it('reserves the worst stress state, not the base state', () => {
    // The base state has 120 free at 80 rem and A would fit in it; the worst state has 60, and a
    // conflict chip arriving later would wrap the row. This is the rule that keeps a late-arriving
    // chip from wrapping a full row.
    const stages = computePromotionStages(widths());
    expect(stages.A).not.toBe('PROMOTE_80');
    const baseOnly = widths();
    baseOnly.freeWidthByStage.look.PROMOTE_80.freeWorst = 120;
    expect(computePromotionStages(baseOnly).A).toBe('PROMOTE_80');
  });

  it('is monotonic: a promoted entry stays promoted at every wider stage', () => {
    const stages = computePromotionStages(widths());
    const order = ['PROMOTE_80', 'PROMOTE_90', 'PROMOTE_119_5', 'PROMOTE_160'];
    for (const rank of ['A', 'B', 'C', 'D']) {
      const at = stages[rank];
      expect(at, rank).not.toBe('never');
      expect(order.indexOf(at as string)).toBeGreaterThanOrEqual(0);
    }
  });

  it("marks 'never' where the ladder is exhausted for the room left", () => {
    const tight = widths();
    tight.entries = tight.entries.map((e) => (e.rank === 'D' ? { ...e, width: 5000 } : e));
    expect(computePromotionStages(tight).D).toBe('never');
  });

  it('never takes an anchor: it only places the ranks it is given', () => {
    // An anchor is a menu row that is not in `entries`, so the function cannot promote it — there is
    // no way to ask. The result's keys are exactly the ladder's ranks.
    expect(Object.keys(computePromotionStages(widths())).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('refuses a ladder that names a rank with no width', () => {
    expect(() =>
      computePromotionStages(widths({ ladderOrder: { look: ['A', 'Z'], do: ['D'] } })),
    ).toThrow(/Z/);
  });
});

interface Ctx {
  promotion: PromotionState;
  armed: boolean;
}

describe('derivePromotedItems', () => {
  const trigger: ToolbarItem<Ctx> = {
    id: 'menu',
    group: 'tools',
    row: 'strip',
    tier: 2,
    order: 4,
    label: 'Menu',
    render: () => <span>menu</span>,
  };
  const entry = (over: Partial<PromotableEntry<Ctx>> = {}): PromotableEntry<Ctx> => ({
    id: 'thing',
    label: 'Thing',
    menuLabel: 'Thing…',
    menuName: 'Menu',
    icon: undefined,
    from: 'menu',
    rank: 3,
    at: { fine: 'PROMOTE_90', coarse: 'PROMOTE_90' },
    onActivate: () => {},
    ...over,
  });
  const visibleAt = (e: PromotableEntry<Ctx>, ctx: Ctx): boolean => isPromoted(e.at, ctx.promotion);

  it('sorts a derived item immediately after its trigger, in its group and row', () => {
    const items = defineToolbar<Ctx>([
      trigger,
      { ...trigger, id: 'next', order: 5, label: 'Next' },
      ...derivePromotedItems([entry()], [trigger], visibleAt),
    ]);
    const resolved = resolveItems(
      items,
      { promotion: { stage: 2, pointer: 'fine' }, armed: false },
      true,
    );
    expect(resolved.map((r) => r.item.id)).toEqual(['menu', 'thing', 'next']);
    expect(resolved[1]?.item.group).toBe('tools');
  });

  it('is absent below its stage and present from it', () => {
    const items = derivePromotedItems([entry()], [trigger], visibleAt);
    const at = (stage: PromotionState['stage']): number =>
      resolveItems(items, { promotion: { stage, pointer: 'fine' }, armed: false }, true).length;
    expect([at(0), at(1), at(2), at(4)]).toEqual([0, 0, 1, 1]);
  });

  it('is always labelled, and names its menu as the focus successor and the reason it left', () => {
    const [item] = derivePromotedItems([entry()], [trigger], visibleAt);
    expect(item?.labelVisibility).toBe('always');
    expect(item?.successorId).toBe('menu');
    expect(item?.lostReason).toBe('Moved into the Menu menu.');
    // True of a command that has left the menu: where it goes when the window narrows.
    expect(item?.description).toBe('Moves into the Menu menu in a narrower window');
    // Linked to the button on focus too — a labelled button's native title is hover-only.
    expect(item?.srDescription?.({ promotion: NO_PROMOTION, armed: false })).toBe(
      item?.description,
    );
  });

  it('a kind preset that arms a tool takes the armed picture; a toggle takes the default', () => {
    const [armed] = derivePromotedItems(
      [entry({ activeKind: 'armed', isActive: (c) => c.armed })],
      [trigger],
      visibleAt,
    );
    const [toggle] = derivePromotedItems(
      [entry({ isActive: (c) => c.armed })],
      [trigger],
      visibleAt,
    );
    expect(armed?.activeKind).toBe('armed');
    expect(toggle?.activeKind).toBeUndefined();
    expect(toggle?.isActive).toBeDefined();
  });

  it('a set caption is aria-hidden, presentational and ahead of its first member', () => {
    const items = derivePromotedItems([entry({ captionBefore: 'Group' })], [trigger], visibleAt);
    const caption = items.find((i) => i.id === 'thing-caption');
    expect(caption?.presentational).toBe(true);
    expect(caption?.order).toBeLessThan(items.find((i) => i.id === 'thing')?.order ?? 0);
    render(
      <>
        {caption?.render?.(
          { promotion: { stage: 4, pointer: 'fine' }, armed: false },
          {
            labelState: 'visible',
            disabled: false,
            disabledReason: undefined,
            active: false,
            activeKind: 'selected',
            itemProps: { tabIndex: -1, 'data-toolbar-item': 'thing-caption' },
          },
        )}
      </>,
    );
    expect(screen.getByText('Group')).toHaveAttribute('aria-hidden', 'true');
  });

  it('refuses an entry whose source trigger is not registered', () => {
    expect(() => derivePromotedItems([entry({ from: 'ghost' })], [trigger], visibleAt)).toThrow(
      /ghost/,
    );
  });
});
