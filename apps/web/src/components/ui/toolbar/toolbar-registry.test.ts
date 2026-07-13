import { describe, expect, it } from 'vitest';

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
});
