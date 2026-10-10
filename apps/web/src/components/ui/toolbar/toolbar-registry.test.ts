import { describe, expect, it, vi } from 'vitest';

import {
  defineToolbar,
  groupRank,
  resolveItems,
  splitByRow,
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

  /**
   * **The cardinality half of `primary`** (console epic M7). `primary` is the loudest treatment a
   * control can take, and "loudest" is a superlative: two of them is not a louder surface, it is a
   * surface with no loudest control.
   *
   * The primitive enforces the COUNT and says nothing about which control earns it — that stays a
   * product fact in the product's own registry. The reservation was first written as a name list in
   * one feature's structural test, which cannot see a control registered in a third registry; a
   * count can, at the point of declaration.
   */
  it('throws when two items declare themselves primary', () => {
    const loud = (id: string): ToolbarItem<Ctx> =>
      base({ id, activeKind: 'primary', isActive: () => true });
    expect(() => defineToolbar([loud('pen'), loud('other')])).toThrow(
      /2 items declare activeKind "primary" \(pen, other\)/,
    );
  });

  it('allows exactly one primary, which is the whole point of the rule', () => {
    const items = [
      base({ id: 'pen', activeKind: 'primary', isActive: () => true }),
      base({ id: 'b' }),
    ];
    expect(defineToolbar(items)).toBe(items);
  });

  /**
   * `activeKind` without `isActive` is a control declaring a picture it can never take — it reads
   * as covered and is not. The TSLD structural test makes the same assertion for the four modal
   * tools; this is the primitive refusing it for `primary` at declaration, where the author is.
   */
  it('throws when a primary item can never become active', () => {
    expect(() => defineToolbar([base({ id: 'pen', activeKind: 'primary' })])).toThrow(
      /activeKind "primary" needs isActive/,
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

/**
 * **`labelVisibility: 'roomy'` is refused where its tooltip cannot be mounted** (toolbar-redesign
 * M1). A `'roomy'` label vanishes under a container query with no JavaScript involved, so the control
 * must already carry the `description` tooltip that names it; only `ToolbarButton` mounts one.
 * Verified red by removing the two checks from `defineToolbar`: both rejections below pass through.
 */
describe('defineToolbar — only a plain, described item may be `roomy`', () => {
  it('accepts a plain onActivate item with a description', () => {
    expect(() =>
      defineToolbar([
        base({ id: 'ok', labelVisibility: 'roomy', description: 'Says what it does' }),
      ]),
    ).not.toThrow();
  });

  it('rejects a render item, whose trigger has no description tooltip to carry its name', () => {
    expect(() =>
      defineToolbar([
        base({
          id: 'trigger',
          labelVisibility: 'roomy',
          description: 'x',
          render: () => null,
        }),
      ]),
    ).toThrow(/trigger.*only for a plain onActivate item/);
  });

  it('rejects an item with no description, because a bare name-echo names nothing', () => {
    expect(() => defineToolbar([base({ id: 'bare', labelVisibility: 'roomy' })])).toThrow(
      /bare.*needs a description/,
    );
  });

  it("does not hold 'always' or 'never' to that rule", () => {
    expect(() =>
      defineToolbar([
        base({ id: 'a', labelVisibility: 'always', render: () => null }),
        base({ id: 'n', labelVisibility: 'never' }),
      ]),
    ).not.toThrow();
  });
});

/** `isVisible` is a predicate over the context and nothing else: nothing narrows an item on width. */
describe('resolveItems — isVisible takes the context alone', () => {
  it('passes the context and no second argument', () => {
    const ctx: Ctx = { editing: false, hasSelection: false };
    const isVisible = vi.fn(() => true);
    resolveItems([base({ id: 'a', isVisible })], ctx, true);
    expect(isVisible).toHaveBeenCalledTimes(1);
    expect(isVisible.mock.calls[0]).toEqual([ctx]);
  });
});

/**
 * **The `segment` row invariant** (ADR-0091 M1, B2). The same guard one axis over, added with
 * the `mode` row because a third row is the first thing that makes splitting a pair across rows
 * expressible at all — before it, `row` had two values and both companions were always on one of
 * them. A pair was resolved from ONE row's `bar`, so a split pair lost its companion entirely and
 * each half demoted on its own row's arithmetic.
 *
 * **That resolution — `companionsOf` — no longer exists** (deleted with the width ladder, ADR-0109
 * D1; `docs/TECH_DEBT.md` #193). The guard stays because `segment` still declares a unit and
 * this is the only thing that asserts it; the sentence above is now history rather than mechanism.
 *
 * Verified red by removing the row check from `defineToolbar`.
 */
describe('defineToolbar — a segment’s members share a row', () => {
  const seg = (id: string, row: 'mode' | 'strip'): ToolbarItem<Ctx> =>
    base({ id, tier: 1, row, segment: 'view-mode', isActive: () => false });

  it('accepts a pair on the same row', () => {
    expect(() => defineToolbar([seg('left', 'mode'), seg('right', 'mode')])).not.toThrow();
  });

  it('treats an absent row as `strip`, so a bare pair still agrees', () => {
    const bare = (id: string): ToolbarItem<Ctx> =>
      base({ id, tier: 1, segment: 'view-mode', isActive: () => false });
    expect(() => defineToolbar([bare('left'), seg('right', 'strip')])).not.toThrow();
  });

  it('rejects a pair whose rows disagree, naming both rows', () => {
    expect(() => defineToolbar([seg('left', 'mode'), seg('right', 'strip')])).toThrow(
      /spans rows "mode" and "strip"/,
    );
  });
});

/**
 * `splitByRow` is total by construction (ADR-0091 M1, B1) — it was a ternary, which is total for two
 * rows and silently routes a third into the default.
 *
 * **Graphite M5 merged `look` and `do` into `strip`, and this guard is what made that safe**: the
 * record is seeded with every key, so removing a member of the union is a typecheck failure at every
 * call site rather than a silent mis-partition. It failed at four of them, which is the point.
 */
describe('splitByRow — every row is a key, and the default is `strip`', () => {
  it('partitions every row and defaults a row-less item to the strip', () => {
    const rows = splitByRow([
      base({ id: 'i', tier: 1, row: 'identity' }),
      base({ id: 'm', tier: 1, row: 'mode' }),
      base({ id: 's', tier: 1, row: 'strip' }),
      base({ id: 'c', tier: 1, row: 'canvas' }),
      base({ id: 'bare', tier: 1 }),
    ]);
    expect(rows.identity.map((i) => i.id)).toEqual(['i']);
    expect(rows.mode.map((i) => i.id)).toEqual(['m']);
    expect(rows.canvas.map((i) => i.id)).toEqual(['c']);
    expect(rows.strip.map((i) => i.id)).toEqual(['s', 'bare']);
  });

  it('returns an entry for every row even when the registry is empty', () => {
    // The mode row must exist as an empty array rather than `undefined`: the workspace renders
    // `rows.mode` unconditionally, and a missing key is a crash rather than an empty toolbar.
    expect(splitByRow([])).toEqual({ identity: [], mode: [], strip: [], canvas: [] });
  });
});

describe('defineToolbar — a visibleLabel is contained in the name (WCAG 2.5.3)', () => {
  it('accepts a printed value that is inside the accessible name', () => {
    const items = [
      base({ id: 'colour', label: 'Colour by: Total float', visibleLabel: 'Total float' }),
    ];
    expect(defineToolbar(items)).toBe(items);
  });

  it('refuses a printed text the name does not contain: a speech-recognition user would say it and fail', () => {
    expect(() =>
      defineToolbar([
        base({ id: 'colour', label: 'Colour by: Total float', visibleLabel: 'Slack' }),
      ]),
    ).toThrow(/label in name/);
  });

  it('is only for a plain onActivate item', () => {
    expect(() =>
      defineToolbar([
        base({ id: 'menu', label: 'Menu', visibleLabel: 'Menu', render: () => null }),
      ]),
    ).toThrow(/plain onActivate/);
  });
});
