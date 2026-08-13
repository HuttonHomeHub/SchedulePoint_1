import { describe, expect, it, vi } from 'vitest';

import {
  computeOverflow,
  defineToolbar,
  groupRank,
  partitionByTier,
  resolveItems,
  resolveLayoutMode,
  splitByRow,
  TOOLBAR_LAYOUT_HYSTERESIS_PX,
  type ResolvedToolbarItem,
  type ToolbarItem,
  type ToolbarLayoutMode,
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
  it('orders the taxonomy frame < lens < find < tools < object < output < help', () => {
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

  describe('the `⋯` a Tier-3 item already put on the row (ADR-0091 M-final, D2)', () => {
    /**
     * `partitionByTier` sends Tier 3 to the overflow **unconditionally**, and those items never
     * reach `bar` here. So on every row that registers one — which, on this product, is both of
     * them — the `⋯` renders whether or not anything demotes, and this function was reserving its
     * width only *after* the first demotion, i.e. one demotion too late.
     *
     * Verified red: without `overflowAlreadyShown` the first case returns no overflow.
     */

    it('demotes when the standing `⋯` is what pushes the row over', () => {
      // 400 px of items against a 420 px container fits on widths alone — but 40 px of that
      // container is already spent on a `⋯` this function was never told about.
      expect(computeOverflow(bar, widths, 420, 40, 0, 0, true).overflow).not.toEqual([]);
      expect(computeOverflow(bar, widths, 420, 40, 0, 0, false).overflow).toEqual([]);
    });

    it('does not charge the button twice once something has demoted', () => {
      // Past the early return the loop reserves the button itself, so the two flags must agree
      // about every row that was going to overflow anyway. A second charge would demote one item
      // too many — the mirror of the defect above, and the reason this is a flag rather than an
      // unconditional term.
      expect(computeOverflow(bar, widths, 150, 40, 0, 0, true)).toEqual(
        computeOverflow(bar, widths, 150, 40, 0, 0, false),
      );
    });

    it('defaults to the old behaviour, keeping every existing call site a before/after oracle', () => {
      expect(computeOverflow(bar, widths, 420, 40, 0, 0)).toEqual(
        computeOverflow(bar, widths, 420, 40, 0, 0, false),
      );
    });
  });

  describe('priority is not order, and a segment is one unit (M1-T6/T7)', () => {
    /**
     * `order` answers "where does this sit in its group"; `priority` answers "what can this row
     * afford to lose". They were the same number, so the first question silently answered the
     * second — and on Row 1 that demoted Zoom −/+/Fit/Go-to-today **before** Legend and Keyboard
     * shortcuts (`docs/specs/workspace-layout/m0-measurement.md`).
     */
    const priced = (
      id: string,
      order: number,
      extra: Partial<ToolbarItem<Ctx>> = {},
    ): ResolvedToolbarItem<Ctx> => ({
      item: {
        id,
        group: 'frame',
        tier: 2,
        order,
        label: id,
        onActivate: () => {},
        ...extra,
      },
      enabled: true,
      active: false,
      disabledReason: undefined,
    });

    it('demotes the low-priority item even though it sits leftmost', () => {
      // `zoom` sits at order 0 (leftmost) and `help` at order 9 (rightmost). Under the old rule the
      // rightmost went first; priority says the help link is the cheaper loss.
      const bar = [priced('zoom', 0, { priority: 90 }), priced('help', 9, { priority: 1 })];
      const widths = new Map([
        ['zoom', 100],
        ['help', 100],
      ]);
      const { inline, overflow } = computeOverflow(bar, widths, 150, 40);
      expect(inline).toEqual(['zoom']);
      expect(overflow).toEqual(['help']);
    });

    it('falls back to order when no priority is set — the existing suites stay the oracle', () => {
      const bar = [priced('a', 0), priced('b', 9)];
      const widths = new Map([
        ['a', 100],
        ['b', 100],
      ]);
      expect(computeOverflow(bar, widths, 150, 40).overflow).toEqual(['b']);
    });

    it('takes both halves of a segment or neither', () => {
      // `left`/`right` are one switch. Without `demotionGroup` the higher order goes first and the
      // planner is left with one state on the bar and the other inside a menu.
      const bar = [
        priced('keep', 0, { priority: 90, tier: 1 }),
        priced('left', 1, { demotionGroup: 'view-mode' }),
        priced('right', 2, { demotionGroup: 'view-mode' }),
      ];
      const widths = new Map([
        ['keep', 100],
        ['left', 100],
        ['right', 100],
      ]);
      // Budget forces one demotion's worth of space; the pair must still leave together.
      const { inline, overflow } = computeOverflow(bar, widths, 210, 40);
      expect(overflow).toEqual(['left', 'right']);
      expect(inline).toEqual(['keep']);
    });

    it('never splits the pair at any width', () => {
      const bar = [
        priced('keep', 0, { priority: 90, tier: 1 }),
        priced('left', 1, { demotionGroup: 'view-mode' }),
        priced('right', 2, { demotionGroup: 'view-mode' }),
      ];
      const widths = new Map([
        ['keep', 100],
        ['left', 100],
        ['right', 100],
      ]);
      for (let available = 0; available <= 400; available += 1) {
        const { overflow } = computeOverflow(bar, widths, available, 40);
        expect(overflow.includes('left')).toBe(overflow.includes('right'));
      }
    });
  });
});

/**
 * **The layout ladder and its hysteresis** (ADR-0090 M3-T1).
 *
 * The plan asks for "unit at all six boundary edges" — three boundaries, each in both directions —
 * and that count is the point. Each boundary therefore appears twice, and the widening half is the
 * half that carries the weight.
 *
 * **Verified red by replacing the body with a bare `width >= min` ladder**, rather than assumed:
 * five assertions fail (all three widening cases, the rung-by-rung case and the sweep) and the three
 * narrowing cases pass. So a suite that only walked the width downwards would have been green
 * against a build with no hysteresis at all — which is why the direction is spelt out in each name.
 *
 * The thresholds are computed from `TOOLBAR_LAYOUT_HYSTERESIS_PX` rather than typed in, so changing
 * the margin changes the test's expectations rather than breaking it — the constant is the decision,
 * and a literal here would silently become a second, disagreeing one.
 */
describe('resolveLayoutMode', () => {
  const H = TOOLBAR_LAYOUT_HYSTERESIS_PX;
  const BOUNDARIES: { min: number; wider: ToolbarLayoutMode; narrower: ToolbarLayoutMode }[] = [
    { min: 1536, wider: 'comfortable', narrower: 'compact' },
    { min: 1280, wider: 'compact', narrower: 'condensed' },
    { min: 1024, wider: 'condensed', narrower: 'collapsed' },
  ];

  for (const { min, wider, narrower } of BOUNDARIES) {
    it(`narrows to ${narrower} the moment the row drops below ${min}`, () => {
      expect(resolveLayoutMode(min, wider)).toBe(wider);
      expect(resolveLayoutMode(min - 1, wider)).toBe(narrower);
    });

    it(`holds ${narrower} until ${min} + ${H} on the way back up`, () => {
      // The asymmetry itself. Every width in the hysteresis band is above the boundary and must
      // still not promote — which is exactly what a `width >= min` implementation gets wrong.
      expect(resolveLayoutMode(min, narrower)).toBe(narrower);
      expect(resolveLayoutMode(min + H - 1, narrower)).toBe(narrower);
      expect(resolveLayoutMode(min + H, narrower)).toBe(wider);
    });
  }

  it('promotes rung by rung, never stranding the row two bands below its width', () => {
    // Growing from `collapsed` to 1550: that width clears `compact`'s floor by 270 px but misses
    // `comfortable`'s hysteresis by 34. Testing only the band the width falls in would answer
    // "stay collapsed" — a row two rungs denser than the space it has.
    expect(resolveLayoutMode(1550, 'collapsed')).toBe('compact');
    expect(resolveLayoutMode(1536 + H, 'collapsed')).toBe('comfortable');
  });

  it('narrows by as many rungs as the width demands, in one step', () => {
    expect(resolveLayoutMode(800, 'comfortable')).toBe('collapsed');
  });

  it('does not oscillate anywhere on a slow drag across the whole range', () => {
    // The property the six edge cases imply but do not state: sweeping the width down and back up
    // must cross each boundary exactly once per direction. A build with no hysteresis flips at the
    // same pixel both ways, so the two crossing sets are identical — here they must differ.
    const sweep = (from: number, to: number, step: number): number[] => {
      const changes: number[] = [];
      let mode: ToolbarLayoutMode = resolveLayoutMode(from, 'comfortable');
      for (let w = from; step > 0 ? w <= to : w >= to; w += step) {
        const next = resolveLayoutMode(w, mode);
        if (next !== mode) changes.push(w);
        mode = next;
      }
      return changes;
    };
    const down = sweep(1800, 800, -1);
    const up = sweep(800, 1800, 1);
    expect(down).toEqual([1535, 1279, 1023]);
    expect(up).toEqual([1024 + H, 1280 + H, 1536 + H]);
  });
});

/**
 * **The `demotionGroup` tier invariant** (ADR-0090 M5, component gate). Verified red by removing the
 * check from `defineToolbar`.
 */
describe('defineToolbar — demotionGroup companions share a tier', () => {
  const seg = (id: string, tier: 1 | 2 | 3): ToolbarItem<Ctx> =>
    base({ id, tier, demotionGroup: 'view-mode', isActive: () => false });

  it('accepts a pair on the same tier', () => {
    expect(() => defineToolbar([seg('left', 1), seg('right', 1)])).not.toThrow();
  });

  it('rejects a pair whose tiers disagree, naming the group', () => {
    // A tier-3 companion is in the STATIC overflow and never enters `computeOverflow`'s pair map, so
    // the segment would split: one half always in the `⋯`, the other only sometimes. That is the
    // exact state `demotionGroup` exists to prevent, and it would look correct in the registry.
    expect(() => defineToolbar([seg('left', 1), seg('right', 3)])).toThrow(/view-mode/);
  });
});

/**
 * **The `demotionGroup` row invariant** (ADR-0091 M1, B2). The same guard one axis over, added with
 * the `mode` row because a third row is the first thing that makes splitting a pair across rows
 * expressible at all — before it, `row` had two values and both companions were always on one of
 * them. `companionsOf` resolves a pair from ONE row's `bar`, so a split pair loses its companion
 * entirely and each half demotes on its own row's arithmetic.
 *
 * Verified red by removing the row check from `defineToolbar`.
 */
describe('defineToolbar — demotionGroup companions share a row', () => {
  const seg = (id: string, row: 'mode' | 'look' | 'do'): ToolbarItem<Ctx> =>
    base({ id, tier: 1, row, demotionGroup: 'view-mode', isActive: () => false });

  it('accepts a pair on the same row', () => {
    expect(() => defineToolbar([seg('left', 'mode'), seg('right', 'mode')])).not.toThrow();
  });

  it('treats an absent row as `look`, so a bare pair still agrees', () => {
    const bare = (id: string): ToolbarItem<Ctx> =>
      base({ id, tier: 1, demotionGroup: 'view-mode', isActive: () => false });
    expect(() => defineToolbar([bare('left'), seg('right', 'look')])).not.toThrow();
  });

  it('rejects a pair whose rows disagree, naming both rows', () => {
    expect(() => defineToolbar([seg('left', 'mode'), seg('right', 'look')])).toThrow(
      /spans rows "mode" and "look"/,
    );
  });
});

/**
 * `splitByRow` is total by construction (ADR-0091 M1, B1) — it was a ternary, which is total for two
 * rows and silently routes a third into `look`.
 */
describe('splitByRow — every row is a key, and the default is `look`', () => {
  it('partitions all three rows and defaults a row-less item to look', () => {
    const rows = splitByRow([
      base({ id: 'm', tier: 1, row: 'mode' }),
      base({ id: 'l', tier: 1, row: 'look' }),
      base({ id: 'd', tier: 1, row: 'do' }),
      base({ id: 'bare', tier: 1 }),
    ]);
    expect(rows.mode.map((i) => i.id)).toEqual(['m']);
    expect(rows.look.map((i) => i.id)).toEqual(['l', 'bare']);
    expect(rows.do.map((i) => i.id)).toEqual(['d']);
  });

  it('returns an entry for every row even when the registry is empty', () => {
    // The mode row must exist as an empty array rather than `undefined`: the workspace renders
    // `rows.mode` unconditionally, and a missing key is a crash rather than an empty toolbar.
    expect(splitByRow([])).toEqual({ mode: [], look: [], do: [] });
  });
});
