import { useCallback, useMemo, useRef, useState } from 'react';

import { containerShouldStandDown, vetoesKey } from './toolbar-keyboard';
import {
  groupRank,
  resolveItems,
  TOOLBAR_GROUPS,
  type ResolvedToolbarItem,
  type ToolbarGroupId,
  type ToolbarItem,
} from './toolbar-registry';
import { ToolbarButton } from './ToolbarButton';

import { cn } from '@/lib/utils';

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
  /**
   * Push this group (and any groups after it) to the trailing edge with `margin-inline-start: auto`.
   *
   * **At most one auto margin per line, and that is a shipped defect rather than a tidiness rule.**
   * Free space in a flex line is distributed EQUALLY among every auto margin on it, not given to
   * the last one — so two of them put a control at the midpoint of the gap and the next at the
   * midpoint of what was left, which is exactly the "stranded in the middle of the row" the product
   * owner reported (ADR-0091 M7 S10). There is now only one caller and one such margin.
   */
  alignEndGroup?: ToolbarGroupId;
  className?: string;
}

const DEFAULT_GROUP_LABELS: Record<ToolbarGroupId, string> = {
  // "Navigate", not "View": the Lens group holds the `View▾` display-toggles popover, so naming this
  // group "View" too would announce two unrelated "View"s to AT (UX review, ADR-0031).
  frame: 'Navigate',
  lens: 'Display',
  find: 'Find',
  tools: 'Author',
  object: 'Plan actions',
  // "Deliver", not "Share & export": that string is the `ExportMenuControl` **trigger's** own name,
  // and every group — including a single-item one — is wrapped in `role="group"` with its label, so
  // a screen-reader user heard "Share & export, group" then "Share & export, button".
  output: 'Deliver',
  help: 'Help',
};

/**
 * The **toolbar primitive** (ADR-0031). Renders a {@link ToolbarItem} registry as an APG
 * `role="toolbar"`: items partitioned into the fixed 7-group taxonomy (`role="group"` each), with
 * one roving tabindex spanning every focusable control (Arrow/Home/End) and pen-gated items
 * flipping as a set. Generic and TSLD-agnostic — commands are data supplied by the consumer.
 *
 * ## It no longer measures anything, and that is the change (workspace redesign, 2026-08-24)
 *
 * This component used to own a **width ladder**: a `ResizeObserver` on its container, a per-item
 * width cache, a priority ranking, band floors with hysteresis, a label-demotion pass and a `⋯`
 * overflow menu that the losers were demoted into. Four epics (ADR-0090/0091/0092/0094) tuned that
 * machinery, and it was deleted in one commit when the product owner's complaint — "the overflow is
 * not what we agreed to; we need all commands visible when we can" — was traced to its premise.
 *
 * The premise was that a command surface must stay ONE ROW TALL. Drop it and the whole apparatus is
 * unnecessary: the workspace's command surface is now {@link Deck}, which wraps. Everything the
 * ladder existed to decide — what to hide, what to unlabel, in what order — is a question that only
 * arises if hiding is on the table.
 *
 * What is left here serves the surfaces that never needed a ladder in the first place — chiefly
 * the floating **selection bar**, which carries a handful of object actions and was paying for
 * machinery it could not use.
 *
 * **This toolbar is horizontal, full stop.** It carried an `orientation` prop for the 48 px mode
 * rail until 2026-08-26; ADR-0109 D2 deleted that rail and left the prop with **no consumer at
 * all**, while `DESIGN_SYSTEM.md` went on documenting the rule that governed it — dead code kept
 * alive by documentation (`docs/TECH_DEBT.md` #190). Both went in one commit, so the standard and
 * the code could not disagree. If a vertical surface is wanted again, the branch is a few lines and
 * the ANNOUNCEMENT is the part to get right: a stack that tells assistive technology it is
 * horizontal is wrong about the only thing `aria-orientation` exists to say.
 *
 * `render` items (segmented controls, chips, popover triggers) manage their own width and must
 * spread `api.itemProps` on their single focusable control.
 */
export function Toolbar<Ctx>({
  items,
  context,
  label,
  authoringEnabled = true,
  groupLabels,
  alignEndGroup,
  className,
}: ToolbarProps<Ctx>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // `'comfortable'` is passed as a constant rather than measured. It is the band in which nothing
  // folds, so every `isVisible` predicate that takes an env resolves exactly what it always did —
  // deleting the ladder must not quietly change which items a registry produces.
  const resolved = useMemo(
    () => resolveItems(items, context, authoringEnabled, 'comfortable'),
    [items, context, authoringEnabled],
  );

  const focusableIds = useMemo(
    () => resolved.filter((r) => !r.item.presentational).map((r) => r.item.id),
    [resolved],
  );

  // Derived, not repaired in an effect: an `activeId` naming an item a predicate has since hidden
  // falls back to the first control, so the roving stop can never point at nothing.
  const effectiveActiveId =
    activeId && focusableIds.includes(activeId) ? activeId : (focusableIds[0] ?? null);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const key = event.key;
      const isNext = key === 'ArrowRight' || key === 'ArrowDown';
      const isPrev = key === 'ArrowLeft' || key === 'ArrowUp';
      if (!isNext && !isPrev && key !== 'Home' && key !== 'End') return;
      // A descendant that already handled the key wins; then the focused control's own claim.
      // Both rules live in `toolbar-keyboard.ts` and are shared with `Deck` — this primitive used
      // to carry its own copy, and when the copy in `Deck` was fixed this one was not, which is
      // exactly the drift the shared module exists to make impossible.
      if (containerShouldStandDown(event)) return;
      if (vetoesKey(event.target, key)) return;
      const ids = focusableIds;
      if (ids.length === 0) return;
      const current = effectiveActiveId ? ids.indexOf(effectiveActiveId) : -1;
      const from = current === -1 ? 0 : current;
      let nextIndex = from;
      if (isNext) nextIndex = (from + 1) % ids.length;
      else if (isPrev) nextIndex = (from - 1 + ids.length) % ids.length;
      else if (key === 'Home') nextIndex = 0;
      else nextIndex = ids.length - 1;
      event.preventDefault();
      const nextId = ids[nextIndex]!;
      setActiveId(nextId);
      // Focus by the marker attribute — for a render item the focusable is the item's own control,
      // not the wrapper around it.
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-toolbar-item="${CSS.escape(nextId)}"]`)
        ?.focus();
    },
    [focusableIds, effectiveActiveId],
  );

  const tabIndexFor = (id: string): number => (id === effectiveActiveId ? 0 : -1);

  const groups = useMemo(() => {
    const byGroup = new Map<ToolbarGroupId, ResolvedToolbarItem<Ctx>[]>();
    for (const r of [...resolved].sort(
      (a, b) => groupRank(a.item.group) - groupRank(b.item.group) || a.item.order - b.item.order,
    )) {
      const list = byGroup.get(r.item.group) ?? [];
      list.push(r);
      byGroup.set(r.item.group, list);
    }
    return TOOLBAR_GROUPS.filter((g) => byGroup.has(g)).map((g) => ({
      group: g,
      items: byGroup.get(g)!,
    }));
  }, [resolved]);

  const labels = { ...DEFAULT_GROUP_LABELS, ...groupLabels };

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        'flex gap-1',
        // A toolbar WRAPS rather than scrolls. Under the ladder this was `overflow-x-auto`, the
        // least-bad answer once hiding had been ruled out and demotion had run out of things to
        // demote. With no ladder there is nothing to run out of: a line that cannot fit becomes
        // two lines.
        'flex-wrap items-center',
        className,
      )}
    >
      {groups.map(({ group, items: groupItems }, i) => (
        <div
          key={group}
          role="group"
          aria-label={labels[group]}
          className={cn(
            'flex flex-wrap items-center gap-1',
            // A hairline separates groups along the axis the toolbar runs.
            i > 0 && 'border-border ml-1 border-l pl-2',
            group === alignEndGroup && 'ml-auto',
          )}
        >
          {groupItems.map((r) =>
            r.item.render ? (
              <span key={r.item.id} className="inline-flex items-center">
                {r.item.render(context, {
                  disabled: !r.enabled,
                  disabledReason: r.disabledReason,
                  active: r.active,
                  layout: 'comfortable',
                  itemProps: r.item.presentational
                    ? { tabIndex: -1, 'data-toolbar-item': r.item.id }
                    : {
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
                itemId={r.item.id}
                label={r.item.label}
                {...(r.item.description ? { description: r.item.description } : {})}
                icon={r.icon}
                {...(r.busy ? { busy: true } : {})}
                // The item's own policy decides, with `'auto'` now meaning "yes": under the
                // ladder `'auto'` meant "if the row can afford it", and a row that wraps can
                // always afford it.
                showLabel={(r.item.showLabel ?? 'auto') !== 'never'}
                {...(r.item.isActive ? { pressed: r.active } : {})}
                disabled={!r.enabled}
                disabledReason={r.disabledReason}
                srDescription={r.srDescription}
                tabIndex={tabIndexFor(r.item.id)}
                onActivate={() => r.item.onActivate!(context)}
                onFocus={() => setActiveId(r.item.id)}
              />
            ),
          )}
        </div>
      ))}
    </div>
  );
}
