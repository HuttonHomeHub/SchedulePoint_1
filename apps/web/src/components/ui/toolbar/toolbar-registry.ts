import type { ReactNode } from 'react';

/**
 * The declarative **toolbar-item registry** (ADR-0031). A toolbar is described as *data* — an
 * array of {@link ToolbarItem}s — which a single generic {@link Toolbar} primitive renders. Adding
 * a command means registering one item; the primitive owns grouping, tiering, gating, overflow and
 * the APG keyboard model, so no consumer re-implements chrome or a11y.
 *
 * This module is the **contract + the pure resolution/overflow maths** only — no React rendering,
 * no DOM — so the ordering, gating and demotion rules are exhaustively unit-testable. The
 * `Toolbar` component measures widths and delegates the actual decisions here.
 */

/**
 * The fixed command-group taxonomy, in canonical left→right order (ADR-0031). Encoded as a `const`
 * tuple so {@link ToolbarGroupId} is a closed union the compiler enforces — a new command must pick
 * an existing group, it can't invent one. Reserved groups (find/history) may hold only stubs today.
 */
export const TOOLBAR_GROUPS = [
  'frame', // 1 · frame/navigate — scale, zoom, fit (today-recenter reserved)
  'lens', // 2 · lens/display — view toggles, view-mode switch (reserved)
  'find', // 3 · find/focus — filter, critical-only (reserved)
  'tools', // 4 · tools/author — add activity, link (pen-gated)
  'object', // 5 · object/plan actions — recalculate, baselines, calendar…
  'history', // 6 · history/status — undo/redo (reserved), pen status
  'help', // 7 · help — shortcuts, legend
] as const;

export type ToolbarGroupId = (typeof TOOLBAR_GROUPS)[number];

/** Zero-based rank of a group in the canonical order (for stable left→right layout). */
export function groupRank(group: ToolbarGroupId): number {
  return TOOLBAR_GROUPS.indexOf(group);
}

/**
 * Prominence tier. `1` = always-visible inline control; `2` = a labelled popover trigger on the bar
 * (View/Summary/Legend/Filter); `3` = lives in the overflow `⋯` from the start. Tier-1 and tier-2
 * both render inline until width forces a demotion into overflow (tier-2 demote before tier-1).
 */
export type ToolbarTier = 1 | 2 | 3;

/**
 * Which of the two toolbar rows an item belongs to (ADR-0031 two-row amendment). `look` = the
 * always-live view/navigate/find row; `do` = the build-&-manage row (its pen-gated authoring cluster
 * shades as a set). Absent ⇒ `look`. The workspace renders one {@link Toolbar} per row, so this only
 * partitions items — grouping, tiering, gating and overflow are unchanged within each row.
 */
export type ToolbarRow = 'look' | 'do';

/** What the primitive passes an item's `render` escape-hatch so it can reflect gating + roving focus. */
export interface ToolbarItemRenderApi {
  /** Resolved enabled state (respects `isEnabled` + pen-gating) — mirror it on custom controls. */
  disabled: boolean;
  /** Resolved active/pressed state (`isActive`). */
  active: boolean;
  /**
   * Spread these onto the item's single focusable control so it joins the toolbar's roving-tabindex
   * model (APG). Carries the managed `tabIndex`, the marker attributes the toolbar queries, and the
   * focus sync. An interactive `render` item MUST spread this on exactly one focusable element. For a
   * {@link ToolbarItem.presentational} item (a non-interactive read-out) the toolbar omits the
   * focusable marker + `onFocus` and pins `tabIndex: -1`, so the item does **not** take a roving stop.
   */
  itemProps: {
    tabIndex: number;
    'data-toolbar-item': string;
    'data-toolbar-focusable'?: '';
    onFocus?: () => void;
  };
}

/**
 * One toolbar command, generic over the consumer's context `Ctx` (built from the route model + local
 * UI state; the primitive never inspects `Ctx` itself — it only calls these predicates). Exactly one
 * of {@link onActivate} / {@link render} is provided (enforced by {@link defineToolbar}): a plain
 * button, or an escape-hatch for segmented controls, chips and Tier-2 popover triggers.
 */
export interface ToolbarItem<Ctx> {
  /** Stable unique id (test/telemetry handle; dedup key). */
  id: string;
  group: ToolbarGroupId;
  /** Which toolbar row this item lives on (ADR-0031 two-row amendment). Absent ⇒ `look`. */
  row?: ToolbarRow;
  tier: ToolbarTier;
  /** Sort order **within the group** (ascending). Ties break by registry order. */
  order: number;
  /** Accessible name — always required (icon-only buttons still need it). */
  label: string;
  /** Optional leading icon (decorative; `aria-hidden`). */
  icon?: ReactNode;
  /**
   * Part of the **authoring set** (group 4). The primitive disables every pen-gated item together
   * when authoring is not enabled (ADR-0028), so read-only ↔ editing flips as one coherent state.
   */
  penGated?: boolean;
  /** Whether the item is present at all in this context. Absent ⇒ always visible. */
  isVisible?: (ctx: Ctx) => boolean;
  /** Whether the item is actionable. Absent ⇒ always enabled. Combined with pen-gating. */
  isEnabled?: (ctx: Ctx) => boolean;
  /** Toggle/segment pressed state → `aria-pressed`. Absent ⇒ not a toggle. */
  isActive?: (ctx: Ctx) => boolean;
  /** Human reason shown/announced when disabled (e.g. "Start editing to add activities"). */
  disabledReason?: (ctx: Ctx) => string | undefined;
  /** Plain-button activation. Mutually exclusive with {@link render}. */
  onActivate?: (ctx: Ctx) => void;
  /**
   * A non-interactive **read-out** (e.g. the pinned Project-finish figure): rendered inline in its
   * group but **excluded from the roving-tabindex order** — not a Tab/Arrow stop, since there's
   * nothing to operate. Its `render` still receives `itemProps` (to spread `data-toolbar-item`) but
   * without the focusable marker / `onFocus`, and with `tabIndex: -1`. Must be a `render` item.
   */
  presentational?: boolean;
  /** Escape hatch for non-button controls (segmented scale, Project-finish chip, Tier-2 popovers). */
  render?: (ctx: Ctx, api: ToolbarItemRenderApi) => ReactNode;
}

/** An item after its context predicates have been evaluated — what the renderer consumes. */
export interface ResolvedToolbarItem<Ctx> {
  item: ToolbarItem<Ctx>;
  enabled: boolean;
  active: boolean;
  disabledReason: string | undefined;
}

/**
 * Validate a registry and return it unchanged (dev-time invariants; a no-op cost in prod). Catches
 * the mistakes the type system can't: duplicate ids, empty labels, and the onActivate/render XOR.
 * Throws in dev so a malformed registry fails loudly at module load rather than mis-rendering.
 */
export function defineToolbar<Ctx>(items: ToolbarItem<Ctx>[]): ToolbarItem<Ctx>[] {
  if (import.meta.env.DEV) {
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.id) throw new Error('ToolbarItem: every item needs a non-empty id');
      if (seen.has(item.id)) throw new Error(`ToolbarItem: duplicate id "${item.id}"`);
      seen.add(item.id);
      if (!item.label)
        throw new Error(`ToolbarItem "${item.id}": label is required (accessible name)`);
      const hasActivate = typeof item.onActivate === 'function';
      const hasRender = typeof item.render === 'function';
      if (hasActivate === hasRender) {
        throw new Error(
          `ToolbarItem "${item.id}": provide exactly one of onActivate or render (got ${
            hasActivate ? 'both' : 'neither'
          })`,
        );
      }
    }
  }
  return items;
}

/**
 * Partition a registry into the two toolbar rows (ADR-0031 two-row amendment). Items with no `row`
 * default to `look`. Pure — the workspace renders one {@link Toolbar} per returned array.
 */
export function splitByRow<Ctx>(items: ToolbarItem<Ctx>[]): {
  look: ToolbarItem<Ctx>[];
  do: ToolbarItem<Ctx>[];
} {
  const look: ToolbarItem<Ctx>[] = [];
  const build: ToolbarItem<Ctx>[] = [];
  for (const item of items) ((item.row ?? 'look') === 'do' ? build : look).push(item);
  return { look, do: build };
}

/**
 * Resolve every item's context-dependent state and drop the invisible ones, returning the survivors
 * in **canonical order**: by group rank, then by `order`, then by registry index (stable). Pen-gated
 * items are disabled as a set when `authoringEnabled` is false. Pure — no DOM, no measurement.
 */
export function resolveItems<Ctx>(
  items: ToolbarItem<Ctx>[],
  ctx: Ctx,
  authoringEnabled: boolean,
): ResolvedToolbarItem<Ctx>[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.isVisible?.(ctx) ?? true)
    .sort((a, b) => {
      const byGroup = groupRank(a.item.group) - groupRank(b.item.group);
      if (byGroup !== 0) return byGroup;
      const byOrder = a.item.order - b.item.order;
      if (byOrder !== 0) return byOrder;
      return a.index - b.index;
    })
    .map(({ item }) => {
      const penBlocked = item.penGated === true && !authoringEnabled;
      const enabled = !penBlocked && (item.isEnabled?.(ctx) ?? true);
      return {
        item,
        enabled,
        active: item.isActive?.(ctx) ?? false,
        disabledReason: enabled ? undefined : item.disabledReason?.(ctx),
      };
    });
}

/** Split resolved items into the bar (tiers 1–2, order preserved) and the always-overflow set (tier 3). */
export function partitionByTier<Ctx>(resolved: ResolvedToolbarItem<Ctx>[]): {
  bar: ResolvedToolbarItem<Ctx>[];
  overflow: ResolvedToolbarItem<Ctx>[];
} {
  const bar: ResolvedToolbarItem<Ctx>[] = [];
  const overflow: ResolvedToolbarItem<Ctx>[] = [];
  for (const r of resolved) (r.item.tier === 3 ? overflow : bar).push(r);
  return { bar, overflow };
}

/** A bar item paired with its measured pixel width, for the overflow computation. */
export interface MeasuredItem {
  id: string;
  width: number;
}

/**
 * Given the bar items' measured widths, the available width, and the overflow `⋯` button's width,
 * decide which bar items stay inline and which demote into overflow. **Deterministic**: demotion
 * runs from the lowest-priority end — highest tier first (tier-2 before tier-1), then highest
 * `order` — so the demotion order never depends on measurement noise, only on the registry. The
 * overflow button's width is always reserved whenever anything overflows, so `⋯` stays reachable.
 *
 * Kept pure (widths in, ids out) so it is unit-testable without a DOM — the component supplies the
 * real measurements from a single `ResizeObserver`.
 */
export function computeOverflow<Ctx>(
  bar: ResolvedToolbarItem<Ctx>[],
  measured: Map<string, number>,
  availableWidth: number,
  overflowButtonWidth: number,
): { inline: string[]; overflow: string[] } {
  const ids = bar.map((r) => r.item.id);
  const widthOf = (id: string): number => measured.get(id) ?? 0;
  const totalWidth = ids.reduce((sum, id) => sum + widthOf(id), 0);

  // Everything fits (no overflow button needed) → all inline.
  if (totalWidth <= availableWidth) return { inline: ids, overflow: [] };

  // Demotion priority: highest tier number first, then highest order, then latest registry position.
  const byIndex = new Map(bar.map((r, i) => [r.item.id, i]));
  const demotionQueue = [...bar]
    .sort((a, b) => {
      const byTier = b.item.tier - a.item.tier; // tier 2 demotes before tier 1
      if (byTier !== 0) return byTier;
      const byOrder = b.item.order - a.item.order; // higher order demotes first
      if (byOrder !== 0) return byOrder;
      return (byIndex.get(b.item.id) ?? 0) - (byIndex.get(a.item.id) ?? 0);
    })
    .map((r) => r.item.id);

  const overflowed = new Set<string>();
  // Once anything overflows, the ⋯ button occupies width too — reserve it up front.
  let inlineWidth = totalWidth + overflowButtonWidth;
  for (const id of demotionQueue) {
    if (inlineWidth <= availableWidth) break;
    overflowed.add(id);
    inlineWidth -= widthOf(id);
  }

  return {
    inline: ids.filter((id) => !overflowed.has(id)),
    overflow: ids.filter((id) => overflowed.has(id)),
  };
}
