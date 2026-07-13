import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  TOOLBAR_GROUPS,
  computeOverflow,
  groupRank,
  partitionByTier,
  resolveItems,
  type ResolvedToolbarItem,
  type ToolbarGroupId,
  type ToolbarItem,
} from './toolbar-registry';
import { ToolbarButton } from './ToolbarButton';
import { ToolbarOverflow } from './ToolbarOverflow';

import { cn } from '@/lib/utils';

const OVERFLOW_ID = '__overflow__';
/** Fallback width (px) reserved for the `⋯` button before it has been measured. */
const OVERFLOW_WIDTH_FALLBACK = 44;

export interface ToolbarProps<Ctx> {
  /** The registry (validated via `defineToolbar`). */
  items: ToolbarItem<Ctx>[];
  /** The evaluated context passed to every predicate/callback. */
  context: Ctx;
  /** Accessible name for the `role="toolbar"` container. */
  label: string;
  /**
   * Whether the pen-gated **authoring** group is enabled (ADR-0028). When false, every `penGated`
   * item is disabled as a set. Defaults to `true` (no pen layer).
   */
  authoringEnabled?: boolean;
  /** Human labels for each `role="group"`; falls back to a humanised group id. */
  groupLabels?: Partial<Record<ToolbarGroupId, string>>;
  className?: string;
}

const DEFAULT_GROUP_LABELS: Record<ToolbarGroupId, string> = {
  frame: 'View',
  lens: 'Display',
  find: 'Find',
  tools: 'Author',
  object: 'Plan actions',
  history: 'History',
  help: 'Help',
};

/**
 * The generic **toolbar primitive** (ADR-0031). Renders a {@link ToolbarItem} registry as an APG
 * `role="toolbar"`: items partitioned into the fixed 7-group taxonomy (`role="group"` each), the
 * Tier-1/2 controls inline and Tier-3 in the `⋯` overflow, with lowest-priority inline items demoted
 * into overflow when width runs out (measured by one `ResizeObserver`). One roving tabindex spans
 * every focusable control (Arrow/Home/End); pen-gated items flip as a set. The component is generic
 * and TSLD-agnostic — commands are data supplied by the consumer.
 *
 * `render` items (segmented controls, chips, Tier-2 popovers) stay on the bar and manage their own
 * width; only plain `onActivate` buttons demote into overflow — you don't stuff a popover into a
 * menu. Each `render` item must spread `api.itemProps` on its single focusable control.
 */
export function Toolbar<Ctx>({
  items,
  context,
  label,
  authoringEnabled = true,
  groupLabels,
  className,
}: ToolbarProps<Ctx>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [overflowedIds, setOverflowedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const resolved = useMemo(
    () => resolveItems(items, context, authoringEnabled),
    [items, context, authoringEnabled],
  );
  const { bar, overflow: staticOverflow } = useMemo(() => partitionByTier(resolved), [resolved]);

  // Only plain buttons demote; render items (popovers/segmented/chips) stay pinned inline.
  const demotable = useMemo(
    () => bar.filter((r) => typeof r.item.onActivate === 'function'),
    [bar],
  );

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const available = container.clientWidth;
    const widthOf = (id: string): number =>
      itemRefs.current.get(id)?.getBoundingClientRect().width ?? 0;
    const pinnedWidth = bar
      .filter((r) => typeof r.item.onActivate !== 'function')
      .reduce((sum, r) => sum + widthOf(r.item.id), 0);
    const widths = new Map(demotable.map((r) => [r.item.id, widthOf(r.item.id)]));
    const overflowWidth =
      itemRefs.current.get(OVERFLOW_ID)?.getBoundingClientRect().width ?? OVERFLOW_WIDTH_FALLBACK;
    const { overflow } = computeOverflow(
      demotable,
      widths,
      Math.max(0, available - pinnedWidth),
      overflowWidth,
    );
    const next = new Set(overflow);
    setOverflowedIds((prev) => (sameSet(prev, next) ? prev : next));
  }, [bar, demotable]);

  // Measure synchronously after layout, and on every container resize (one observer).
  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure]);

  // The inline bar items (pinned render items + non-overflowed buttons), in canonical order.
  const inlineBar = useMemo(
    () => bar.filter((r) => !overflowedIds.has(r.item.id)),
    [bar, overflowedIds],
  );
  const overflowItems = useMemo(
    () =>
      [...staticOverflow, ...demotable.filter((r) => overflowedIds.has(r.item.id))].sort(
        byCanonical,
      ),
    [staticOverflow, demotable, overflowedIds],
  );

  // The ordered list of focusable ids (inline items, then ⋯) that roving tabindex walks.
  const focusableIds = useMemo(
    () => [...inlineBar.map((r) => r.item.id), ...(overflowItems.length ? [OVERFLOW_ID] : [])],
    [inlineBar, overflowItems.length],
  );

  // Derive the roving tab stop from state, falling back to the first control when `activeId` is
  // unset or has been removed from the bar — no effect/setState-in-effect needed to stay valid.
  const effectiveActiveId =
    activeId && focusableIds.includes(activeId) ? activeId : (focusableIds[0] ?? null);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const key = event.key;
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
      const ids = focusableIds;
      if (ids.length === 0) return;
      const current =
        effectiveActiveId && ids.includes(effectiveActiveId) ? ids.indexOf(effectiveActiveId) : 0;
      let nextIndex = current;
      if (key === 'ArrowRight' || key === 'ArrowDown') nextIndex = (current + 1) % ids.length;
      else if (key === 'ArrowLeft' || key === 'ArrowUp')
        nextIndex = (current - 1 + ids.length) % ids.length;
      else if (key === 'Home') nextIndex = 0;
      else if (key === 'End') nextIndex = ids.length - 1;
      event.preventDefault();
      const nextId = ids[nextIndex]!;
      setActiveId(nextId);
      // Focus by the marker attribute — for render items the focusable is the item's own control,
      // not the wrapper the ref (used for measurement) sits on.
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-toolbar-item="${CSS.escape(nextId)}"]`)
        ?.focus();
    },
    [focusableIds, effectiveActiveId],
  );

  const tabIndexFor = (id: string): number => (id === effectiveActiveId ? 0 : -1);
  // A direct ref callback per element (runs at commit) tracks the DOM node for width measurement —
  // the same pattern the virtualized tree uses. Keyed by item id so stale nodes are simply overwritten.
  const setItemRef = (id: string, node: HTMLElement | null): void => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  };

  // Group the inline bar items by taxonomy group, preserving canonical order.
  const groups = useMemo(() => {
    const byGroup = new Map<ToolbarGroupId, ResolvedToolbarItem<Ctx>[]>();
    for (const r of inlineBar) {
      const list = byGroup.get(r.item.group) ?? [];
      list.push(r);
      byGroup.set(r.item.group, list);
    }
    return TOOLBAR_GROUPS.filter((g) => byGroup.has(g)).map((g) => ({
      group: g,
      items: byGroup.get(g)!,
    }));
  }, [inlineBar]);

  const labels = { ...DEFAULT_GROUP_LABELS, ...groupLabels };

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn('flex min-w-0 items-center gap-1 overflow-hidden', className)}
    >
      {groups.map(({ group, items: groupItems }, i) => (
        <div
          key={group}
          role="group"
          aria-label={labels[group]}
          className={cn(
            'flex items-center gap-1',
            i > 0 && 'border-border ml-1 border-l pl-2', // a hairline separates groups
          )}
        >
          {groupItems.map((r) =>
            r.item.render ? (
              <span
                key={r.item.id}
                ref={(node) => setItemRef(r.item.id, node)}
                className="inline-flex items-center"
              >
                {r.item.render(context, {
                  disabled: !r.enabled,
                  active: r.active,
                  itemProps: {
                    tabIndex: tabIndexFor(r.item.id),
                    'data-toolbar-focusable': '',
                    'data-toolbar-item': r.item.id,
                    onFocus: () => setActiveId(r.item.id),
                  },
                })}
              </span>
            ) : (
              <ToolbarButton
                key={r.item.id}
                ref={(node) => setItemRef(r.item.id, node)}
                itemId={r.item.id}
                label={r.item.label}
                icon={r.item.icon}
                showLabel={r.item.tier === 1}
                {...(r.item.isActive ? { pressed: r.active } : {})}
                disabled={!r.enabled}
                disabledReason={r.disabledReason}
                tabIndex={tabIndexFor(r.item.id)}
                onActivate={() => r.item.onActivate!(context)}
                onFocus={() => setActiveId(r.item.id)}
              />
            ),
          )}
        </div>
      ))}

      {overflowItems.length > 0 && (
        <div className="border-border ml-auto flex items-center border-l pl-1">
          <ToolbarOverflow
            ref={(node) => setItemRef(OVERFLOW_ID, node)}
            items={overflowItems}
            context={context}
            tabIndex={tabIndexFor(OVERFLOW_ID)}
            onFocus={() => setActiveId(OVERFLOW_ID)}
          />
        </div>
      )}
    </div>
  );
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function byCanonical<Ctx>(a: ResolvedToolbarItem<Ctx>, b: ResolvedToolbarItem<Ctx>): number {
  return groupRank(a.item.group) - groupRank(b.item.group) || a.item.order - b.item.order;
}
