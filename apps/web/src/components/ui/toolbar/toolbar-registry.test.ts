import { describe, expect, it, vi } from 'vitest';

import {
  computeOverflow,
  defineToolbar,
  groupRank,
  partitionByTier,
  resolveItems,
  type ResolvedToolbarItem,
  type ToolbarItem,
} from './toolbar-registry';

interface Ctx {
  editing: boolean;
  hasSelection: boolean;
}

// A test-item builder. Defaults to a plain button; pass `render` to get a render item (no
// onActivate) — avoids passing an explicit `onActivate: undefined` (blocked by exactOptionalPropertyTypes).
function base(over: Partial<ToolbarItem<Ctx>> & Pick<ToolbarItem<Ctx>, 'id'>): ToolbarItem<Ctx> {
  const { onActivate, render, ...rest } = over;
  const common = { group: 'frame' as const, tier: 1 as const, order: 0, label: over.id, ...rest };
  return render ? { ...common, render } : { ...common, onActivate: onActivate ?? (() => {}) };
}

describe('defineToolbar invariants', () => {
  it('returns the items unchanged when valid', () => {
    const items = [base({ id: 'a' }), base({ id: 'b', render: () => null })];
    expect(defineToolbar(items)).toBe(items);
  });

  it('throws on a duplicate id', () => {
    expect(() => defineToolbar([base({ id: 'x' }), base({ id: 'x' })])).toThrow(/duplicate id "x"/);
  });

  it('throws on an empty label', () => {
    expect(() => defineToolbar([base({ id: 'x', label: '' })])).toThrow(/label is required/);
  });

  it('throws when neither onActivate nor render is provided', () => {
    const neither: ToolbarItem<Ctx> = { id: 'x', group: 'frame', tier: 1, order: 0, label: 'x' };
    expect(() => defineToolbar([neither])).toThrow(
      /exactly one of onActivate or render \(got neither\)/,
    );
  });

  it('throws when both onActivate and render are provided', () => {
    const both: ToolbarItem<Ctx> = {
      id: 'x',
      group: 'frame',
      tier: 1,
      order: 0,
      label: 'x',
      onActivate: () => {},
      render: () => null,
    };
    expect(() => defineToolbar([both])).toThrow(/exactly one of onActivate or render \(got both\)/);
  });
});

describe('groupRank — canonical left→right order', () => {
  it('orders the taxonomy frame < lens < find < tools < object < history < help', () => {
    expect(groupRank('frame')).toBeLessThan(groupRank('lens'));
    expect(groupRank('tools')).toBeLessThan(groupRank('object'));
    expect(groupRank('object')).toBeLessThan(groupRank('help'));
  });
});

describe('resolveItems', () => {
  const ctx: Ctx = { editing: false, hasSelection: false };

  it('sorts by group rank, then order, then registry index (stable)', () => {
    const items = [
      base({ id: 'help1', group: 'help', order: 0 }),
      base({ id: 'frame2', group: 'frame', order: 5 }),
      base({ id: 'frame1', group: 'frame', order: 1 }),
      base({ id: 'tools1', group: 'tools', order: 0 }),
    ];
    expect(resolveItems(items, ctx, true).map((r) => r.item.id)).toEqual([
      'frame1',
      'frame2',
      'tools1',
      'help1',
    ]);
  });

  it('breaks order ties by registry position', () => {
    const items = [base({ id: 'second', order: 3 }), base({ id: 'first', order: 3 })];
    expect(resolveItems(items, ctx, true).map((r) => r.item.id)).toEqual(['second', 'first']);
  });

  it('drops items whose isVisible returns false', () => {
    const items = [
      base({ id: 'shown' }),
      base({ id: 'hidden', isVisible: () => false }),
      base({ id: 'reserved', isVisible: (c) => c.hasSelection }),
    ];
    expect(resolveItems(items, ctx, true).map((r) => r.item.id)).toEqual(['shown']);
  });

  it('disables every pen-gated item as a set when authoring is off, regardless of isEnabled', () => {
    const items = [
      base({ id: 'add', penGated: true }),
      base({ id: 'link', penGated: true, isEnabled: () => true }),
      base({ id: 'zoom' }),
    ];
    const resolved = resolveItems(items, ctx, false);
    expect(resolved.find((r) => r.item.id === 'add')?.enabled).toBe(false);
    expect(resolved.find((r) => r.item.id === 'link')?.enabled).toBe(false);
    expect(resolved.find((r) => r.item.id === 'zoom')?.enabled).toBe(true);
  });

  it('enables pen-gated items when authoring is on, subject to their own isEnabled', () => {
    const items = [
      base({ id: 'add', penGated: true }),
      base({ id: 'link', penGated: true, isEnabled: () => false }),
    ];
    const resolved = resolveItems(items, ctx, true);
    expect(resolved.find((r) => r.item.id === 'add')?.enabled).toBe(true);
    expect(resolved.find((r) => r.item.id === 'link')?.enabled).toBe(false);
  });

  it('surfaces disabledReason only while disabled', () => {
    const items = [
      base({ id: 'add', penGated: true, disabledReason: () => 'Start editing first' }),
      base({ id: 'zoom', disabledReason: () => 'never' }),
    ];
    const off = resolveItems(items, ctx, false);
    expect(off.find((r) => r.item.id === 'add')?.disabledReason).toBe('Start editing first');
    const on = resolveItems(items, ctx, true);
    expect(on.find((r) => r.item.id === 'add')?.disabledReason).toBeUndefined();
    expect(on.find((r) => r.item.id === 'zoom')?.disabledReason).toBeUndefined();
  });

  it('reads isActive for toggle/segment pressed state', () => {
    const items = [base({ id: 't', isActive: (c) => c.editing })];
    expect(resolveItems(items, { ...ctx, editing: true }, true)[0]!.active).toBe(true);
    expect(resolveItems(items, ctx, true)[0]!.active).toBe(false);
  });

  /**
   * **The ctx-resolvable icon** (M5 T5.1). The parity claim for every item that predates it is that
   * a plain `ReactNode` icon comes out of `resolveItems` **as itself** — identity, not a copy and
   * not a wrapper — so widening the type cannot have changed what any existing toolbar paints.
   */
  it('passes a plain ReactNode icon through unchanged (identity)', () => {
    const icon = 'icon-node';
    const resolved = resolveItems([base({ id: 'a', icon })], ctx, true);
    expect(resolved[0]!.icon).toBe(icon);
  });

  it('leaves the resolved icon undefined when the item has none', () => {
    expect(resolveItems([base({ id: 'a' })], ctx, true)[0]!.icon).toBeUndefined();
  });

  it('calls a function icon exactly once, with the context, and resolves to its return', () => {
    const icon = vi.fn((c: Ctx) => (c.editing ? 'busy' : 'idle'));
    const items = [base({ id: 'a', icon })];

    expect(resolveItems(items, { ...ctx, editing: true }, true)[0]!.icon).toBe('busy');
    // Once per resolve pass — the bar and the `⋯` overflow both render from this one resolution, so
    // a second call is how one item ends up painting two different icons in the two places it appears.
    expect(icon).toHaveBeenCalledTimes(1);
    expect(icon).toHaveBeenCalledWith({ ...ctx, editing: true });

    expect(resolveItems(items, ctx, true)[0]!.icon).toBe('idle');
  });

  it('reads isBusy for the aria-busy state, defaulting to false', () => {
    const items = [base({ id: 'a', isBusy: (c) => c.editing }), base({ id: 'b' })];
    const resolved = resolveItems(items, { ...ctx, editing: true }, true);
    expect(resolved.find((r) => r.item.id === 'a')?.busy).toBe(true);
    expect(resolved.find((r) => r.item.id === 'b')?.busy).toBe(false);
    expect(resolveItems(items, ctx, true).find((r) => r.item.id === 'a')?.busy).toBe(false);
  });
});

describe('partitionByTier', () => {
  it('sends tier-3 to overflow and keeps tier-1/2 on the bar, order preserved', () => {
    const resolved: ResolvedToolbarItem<Ctx>[] = [
      { item: base({ id: 'a', tier: 1 }), enabled: true, active: false, disabledReason: undefined },
      { item: base({ id: 'b', tier: 2 }), enabled: true, active: false, disabledReason: undefined },
      { item: base({ id: 'c', tier: 3 }), enabled: true, active: false, disabledReason: undefined },
    ];
    const { bar, overflow } = partitionByTier(resolved);
    expect(bar.map((r) => r.item.id)).toEqual(['a', 'b']);
    expect(overflow.map((r) => r.item.id)).toEqual(['c']);
  });
});

describe('computeOverflow', () => {
  const bar: ResolvedToolbarItem<Ctx>[] = [
    {
      item: base({ id: 't1a', tier: 1, order: 0 }),
      enabled: true,
      active: false,
      disabledReason: undefined,
    },
    {
      item: base({ id: 't1b', tier: 1, order: 1 }),
      enabled: true,
      active: false,
      disabledReason: undefined,
    },
    {
      item: base({ id: 't2a', tier: 2, order: 0 }),
      enabled: true,
      active: false,
      disabledReason: undefined,
    },
    {
      item: base({ id: 't2b', tier: 2, order: 1 }),
      enabled: true,
      active: false,
      disabledReason: undefined,
    },
  ];
  const widths = new Map([
    ['t1a', 100],
    ['t1b', 100],
    ['t2a', 100],
    ['t2b', 100],
  ]);

  it('keeps everything inline when it fits (no overflow button reserved)', () => {
    const { inline, overflow } = computeOverflow(bar, widths, 400, 40);
    expect(inline).toEqual(['t1a', 't1b', 't2a', 't2b']);
    expect(overflow).toEqual([]);
  });

  it('demotes tier-2 before tier-1, highest order first, until it fits (reserving the ⋯ width)', () => {
    // available 260, ⋯ = 40 → inline budget 220 → keep two items (200). Demote t2b then t2a;
    // the overflow list is returned in canonical bar order, not demotion order.
    const { inline, overflow } = computeOverflow(bar, widths, 260, 40);
    expect(overflow).toEqual(['t2a', 't2b']);
    expect(inline).toEqual(['t1a', 't1b']);
  });

  it('demotes into tier-1 (highest order first) only after all tier-2 are gone', () => {
    // available 150, ⋯ = 40 → budget 110 → keep one (100). Demote t2b,t2a then t1b.
    const { inline, overflow } = computeOverflow(bar, widths, 150, 40);
    expect(inline).toEqual(['t1a']);
    expect(overflow).toEqual(['t1b', 't2a', 't2b']);
  });

  it('is deterministic — independent of measurement order', () => {
    const shuffled = new Map([
      ['t2b', 100],
      ['t1a', 100],
      ['t2a', 100],
      ['t1b', 100],
    ]);
    expect(computeOverflow(bar, shuffled, 260, 40).overflow).toEqual(['t2a', 't2b']);
  });

  it('treats a missing measurement as zero width (never throws)', () => {
    const partial = new Map([['t1a', 500]]);
    // total 500 > 400: the zero-width items shed first by priority but free no space, so t1a
    // (which alone exceeds the budget) demotes too — deterministic, no throw on the absent widths.
    const { inline, overflow } = computeOverflow(bar, partial, 400, 40);
    expect(inline).toEqual([]);
    expect(overflow).toEqual(['t1a', 't1b', 't2a', 't2b']);
  });

  describe('the row’s own chrome (M1-T2)', () => {
    /**
     * `computeOverflow` was handed only ITEM widths, so it answered "do these boxes sum to less
     * than this number" while the caller needed "does this row fit as laid out". The row also
     * carries a `gap-1` between every child and an `ml-1 border-l pl-2` rule before every group
     * after the first, and `Toolbar.measure()` passed none of it (`Toolbar.tsx:172-181`).
     *
     * Measured consequence, from `docs/specs/workspace-layout/m0-measurement.md`: at 1920 Row 1
     * reported `scrollWidth` 1941 against a `clientWidth` of 1832 while this function said it fit,
     * so the `⋯` never rendered and two controls were painted outside an `overflow-hidden` box.
     */

    it('demotes when the chrome pushes a row over, where item widths alone would fit', () => {
      // 400 of items against 420 available fits on widths alone; 40 of chrome does not.
      expect(computeOverflow(bar, widths, 420, 40).overflow).toEqual([]);
      expect(computeOverflow(bar, widths, 420, 40, 40).overflow).not.toEqual([]);
    });

    it('reclaims the gap that leaves with a demoted item, not just its width', () => {
      // Four 100 px items, ⋯ 40 ⇒ the loop starts at 440. Ignoring the gap it steps 340 → 240 → 140;
      // crediting a 10 px gap per demotion it steps 330 → 220. At an available width of 235 that is
      // the difference between three demotions and two, i.e. between one item inline and two.
      // Chosen deliberately: at 250 both credit schemes demote twice and the test proves nothing,
      // which is what the first draft of this case did.
      const withGap = computeOverflow(bar, widths, 235, 40, 0, 10);
      const withoutGap = computeOverflow(bar, widths, 235, 40, 0, 0);
      expect(withoutGap.inline).toEqual(['t1a']);
      expect(withGap.inline).toEqual(['t1a', 't1b']);
    });

    it('is byte-identical to the old behaviour when the chrome is absent', () => {
      // The zero default is what lets every existing call site and suite stay untouched.
      expect(computeOverflow(bar, widths, 260, 40, 0, 0)).toEqual(
        computeOverflow(bar, widths, 260, 40),
      );
      expect(computeOverflow(bar, widths, 150, 40, 0, 0)).toEqual(
        computeOverflow(bar, widths, 150, 40),
      );
    });

    it('reproduces the measured 1920 Row-1 case: fits on items, does not fit as laid out', () => {
      // Row 1 at 1920: container 1832, item widths 1782, chrome 128 + a 31 px residual the
      // group-level walk does not attribute (m0-measurement.md, M1-T1 addendum). 1782 < 1832, so
      // the old signature said "everything fits" — which is exactly what shipped.
      const one = [bar[0]!];
      const w = new Map([[one[0]!.item.id, 1782]]);
      expect(computeOverflow(one, w, 1832, 32).overflow).toEqual([]);
      expect(computeOverflow(one, w, 1832, 32, 159).overflow).toEqual([one[0]!.item.id]);
    });
  });
});
