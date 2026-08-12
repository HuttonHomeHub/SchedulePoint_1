import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useToolbarBandWidth } from './toolbar-band';
import {
  TOOLBAR_GROUPS,
  bandIsAtLeast,
  computeOverflow,
  groupRank,
  partitionByTier,
  resolveItems,
  resolveLayoutMode,
  type ResolvedToolbarItem,
  type ToolbarGroupId,
  type ToolbarItem,
  type ToolbarLayoutMode,
} from './toolbar-registry';
import { ToolbarButton } from './ToolbarButton';
import { ToolbarOverflow } from './ToolbarOverflow';

import { cn } from '@/lib/utils';

const OVERFLOW_ID = '__overflow__';
/** Fallback width (px) reserved for the `⋯` button before it has been measured. */
const OVERFLOW_WIDTH_FALLBACK = 44;

/**
 * Extra px an `'auto'` item costs once labelled, on top of its rendered text: the icon→label gap
 * plus the wider horizontal padding a labelled control carries. Deliberately generous — over-
 * estimating loses a label the row could just afford, which is invisible; under-estimating pushes a
 * command into the overflow, which costs the user a click.
 */
const LABEL_CHROME_PX = 14;

/**
 * Headroom (px) the row must have left over **after** labelling every `'auto'` item before any of
 * them is labelled. Two jobs: it absorbs the text-measurement estimate's error, and it stops the
 * bar flipping labels on and off around a single-pixel boundary as a user drags a window edge.
 */
const LABEL_PROMOTION_MARGIN_PX = 32;

/**
 * The row's own chrome, **derived from the registry — never read from the DOM**.
 *
 * `computeOverflow` was handed only item widths, so it answered "do these boxes sum to less than
 * this number" while the row needed "does this fit as laid out". Measured at 1920, Row 1's items
 * summed to 1782 against an 1832 px container while the row laid out at 1941: the function said it
 * fitted, no `⋯` rendered, and two controls were painted outside the row — which was then
 * `overflow-hidden` — at zero visible width (`docs/specs/workspace-layout/m0-measurement.md`).
 *
 * **Why derived and not measured.** The obvious implementation puts a ref on each `role="group"`
 * wrapper and reads its box. Those wrappers are rendered from `groups` → `inlineBar` → *the very
 * `overflowedIds` this calculation is about to set*, so a measured chrome is downstream of the
 * previous decision: when a group's last inline member demotes the wrapper unmounts, its rule leaves
 * the DOM, the next pass sees more budget and can promote the item back, which recreates the rule.
 * The group that happens to is `help` — `legend` and `shortcuts` — i.e. exactly the two controls
 * this repair exists to make clickable. Deriving from static group membership removes the
 * entanglement rather than damping it, and costs no layout reads at all. Same argument as
 * {@link measureLabelWidth}'s, one level down.
 *
 * **Erring high is the safe direction here**, and it is the opposite of {@link LABEL_CHROME_PX}'s:
 * over-estimating demotes a command that would just have fitted, which costs a click;
 * under-estimating paints it outside the box, which costs the command.
 */
const ITEM_GAP_PX = 4; // `gap-1` — between the container's children, and within each group
const GROUP_RULE_PX = 13; // `ml-1` (4) + `border-l` (1) + `pl-2` (8), on every group after the first

/**
 * What no group-level accounting can attribute: per-item margins (the search field's `ml-3`), the
 * overflow wrapper's own `border-l pl-1`, and sub-pixel box rounding.
 *
 * **Measured, not guessed** (M1-T1, `m0-measurement.md`): after naming every gap and group rule, the
 * unattributed remainder is a *constant* 26–31 px on Row 1 at all eight widths and 50–55 px on Row 2.
 * This takes the worst measured case and rounds up — deliberately generous, for the reason above.
 */
const CHROME_RESIDUAL_PX = 56;

/**
 * Is this row's width **imposed by its container**, or does it size to its own content?
 *
 * **A shrink-to-fit row can never need demotion**, because its `clientWidth` *is* its content: ask
 * "does the content fit?" and the answer is always yes, by construction. Charging such a row the
 * chrome makes the answer falsely no by exactly the chrome, and it demotes commands for no reason.
 *
 * That is not hypothetical — it is what this function was written for. The chrome charge landed on
 * all three `<Toolbar>` instances, and the third is the floating **selection bar**
 * (`selection-actions.tsx:395`), which shrink-wraps to its content and is only centre-clamped to the
 * viewport. CI caught it: `e2e-library` timed out clicking **Resources**, because that command had
 * been pushed into the `⋯` on a bar with no width problem at all. The component review predicted the
 * shape ("the fix propagates by construction") and this is its inverse — propagating somewhere the
 * premise does not hold.
 *
 * `flexGrow` is the right signal precisely because it is **not** downstream of the overflow decision:
 * a flex item that grows has its width handed to it, one that does not sizes to content, and neither
 * changes when an item moves into the `⋯`. Reading `scrollWidth` instead would have been the
 * oscillation trap one level along — it shrinks the moment a demotion succeeds.
 */
function isWidthConstrained(container: HTMLElement): boolean {
  if (typeof getComputedStyle !== 'function') return true;
  return parseFloat(getComputedStyle(container).flexGrow || '0') > 0;
}

/**
 * Derive the fixed chrome a row carries, from the resolved bar alone. Independent of
 * `overflowedIds` by construction — which is the property that matters (see above), and the reason
 * this takes `bar` rather than `inlineBar`.
 */
function deriveChromeWidth<Ctx>(bar: ResolvedToolbarItem<Ctx>[]): number {
  if (bar.length === 0) return 0;
  const groupCount = new Set(bar.map((r) => r.item.group)).size;
  const rules = Math.max(0, groupCount - 1) * GROUP_RULE_PX;
  // One gap between each pair of adjacent children, whether the boundary is inside a group or
  // between two groups — which totals `items − 1` either way.
  const gaps = Math.max(0, bar.length - 1) * ITEM_GAP_PX;
  return rules + gaps + CHROME_RESIDUAL_PX;
}

/**
 * Measure a label's rendered width **without touching layout**, memoised per `font` + text.
 *
 * The obvious implementation — render the labels, measure the row, retract if it didn't fit — is a
 * feedback loop: labelling widens the bar, the widened bar overflows, overflowing narrows it, and
 * the narrower bar can afford labels again. A `ResizeObserver` sat in that cycle flip-flops every
 * frame. Measuring text off the layout tree breaks the loop at the source, so the promotion
 * decision can be a pure function of the container's width — an input that does not change with
 * what we render inside it.
 *
 * Returns `null` where no 2D context is available (older browsers, minimal test environments); the
 * caller then leaves `'auto'` items icon-only, which is the pre-existing behaviour.
 */
const labelWidthCache = new Map<string, number>();
let measuringContext: CanvasRenderingContext2D | null | undefined;

function measureLabelWidth(text: string, font: string): number | null {
  if (measuringContext === undefined) {
    measuringContext =
      typeof document === 'undefined'
        ? null
        : (document.createElement('canvas').getContext('2d') ?? null);
  }
  const ctx = measuringContext;
  if (!ctx || typeof ctx.measureText !== 'function') return null;
  const key = `${font}\u0000${text}`;
  const hit = labelWidthCache.get(key);
  if (hit !== undefined) return hit;
  ctx.font = font;
  const width = ctx.measureText(text).width;
  labelWidthCache.set(key, width);
  return width;
}

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
   * Push this group (and any groups after it) to the trailing edge with `margin-inline-start: auto`
   * (ADR-0031 two-row amendment). Used on Row 1 to right-align the status read-outs (Finish / Summary /
   * Legend). No-op if the group isn't currently rendered inline.
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
  // and `Toolbar` wraps every group — including a single-item one — in `role="group"` with its label,
  // so a screen-reader user tabbing into Row 2's trailing edge heard "Share & export, group" then
  // "Share & export, button". This surface already engineers around exactly that redundancy twice:
  // the `lens` group is "Display" so a `View ▾` trigger cannot sit inside a group named View, and
  // ADR-0090 M2-T5 renamed `Plan ▾` to `Analysis` for the same reason. This is the one new trigger
  // where the rule was not applied (ux gate, M5).
  output: 'Deliver',
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
  alignEndGroup,
  className,
}: ToolbarProps<Ctx>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  // Last-known measured width per item. A demotable item that is currently in the `⋯` overflow has no
  // inline node, so its live `getBoundingClientRect().width` reads 0 — feeding that 0 back into
  // `computeOverflow` would drop the total below the threshold, promote the item inline, re-measure a
  // non-zero width, overflow it again… a per-frame flip-flop (ResizeObserver overflow loop) that makes
  // the bar jitter. Caching each item's real width (updated only while it's inline, > 0) keeps the
  // overflow decision deterministic and stable. Item widths are content-driven, so a cached value stays
  // valid across container resizes (pinned render items are always inline, so they re-measure fresh).
  const widthCacheRef = useRef(new Map<string, number>());
  const [overflowedIds, setOverflowedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  // Whether this row currently has room to label its `'auto'` items. All-or-nothing per row on
  // purpose: labelling an arbitrary subset of one group reads as inconsistency rather than as a
  // response to width, and the M0 measurement found the rows are decisively on one side or the
  // other anyway (~0.1px of slack at 1280px, 760–1000px at 1680–1920px).
  const [autoLabelsFit, setAutoLabelsFit] = useState(false);
  /**
   * The row's measured band (M3-T1). Starts `comfortable` and stays there until something has
   * actually been laid out — the same rule `anythingMeasured` applies to the chrome charge, and for
   * the same reason: a row with no width has not been measured, and `resolveLayoutMode` would read
   * that zero as `collapsed` and fold commands away on the strength of nothing. It also keeps the
   * ~25 existing suites a genuine before/after oracle, since jsdom has no layout at all.
   *
   * **This is not a feedback loop, and the distinction is worth stating.** The band changes what the
   * row renders, so it changes the row's *content* width — but the input is `clientWidth`, which the
   * container imposes (see `isWidthConstrained`). A mode never moves its own boundary.
   */
  const [layout, setLayout] = useState<ToolbarLayoutMode>('comfortable');

  // Read straight into `measure`'s closure and declared as a dependency. A ref assigned during
  // render was the first shape and it is a `react-hooks` violation for a good reason: React may
  // render without committing, so the ref could hold a width from a render that never happened.
  // The dependency is cheap — this value changes only when the band actually resizes, which
  // already re-runs the measurement.
  const bandWidth = useToolbarBandWidth();

  const resolved = useMemo(
    () => resolveItems(items, context, authoringEnabled, layout),
    [items, context, authoringEnabled, layout],
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
    // A row with no width has not been laid out — it is inside a `hidden` pane, or in an environment
    // with no layout engine at all. Deciding anything from that is deciding from nothing, and now
    // that the budget carries a non-zero chrome term it would decide to demote **everything**: the
    // old arithmetic happened to survive it only because 0 ≤ 0. Hold the previous state instead.
    if (available <= 0) return;
    // Functional update, so `measure` need not depend on `layout` — which would rebuild the callback
    // on every band change and re-run the layout effect for no reason.
    // **The band's width, not this row's** (ADR-0091 M-fix). `available` answers "does my content
    // fit my box"; the density band answers "how much room does this surface have", and those stop
    // being the same number the moment anything sits beside the toolbar. Shipped consequence: the
    // project-finish chip beside Row 1 took 136 px out of its container and cost the four viewport
    // commands their labels on a 1646 px screen. See `toolbar-band.tsx` for the other two
    // occurrences. Falls back to `available` for a toolbar that genuinely is its own surface.
    setLayout((prev) => resolveLayoutMode(bandWidth ?? available, prev));
    // Read the live width when the item is inline (caching it), else fall back to its last-known width
    // so overflowed items don't collapse to 0 and cause an overflow flip-flop (see widthCacheRef).
    const widthOf = (id: string): number => {
      const live = itemRefs.current.get(id)?.getBoundingClientRect().width ?? 0;
      if (live > 0) {
        widthCacheRef.current.set(id, live);
        return live;
      }
      return widthCacheRef.current.get(id) ?? 0;
    };
    const pinnedWidth = bar
      .filter((r) => typeof r.item.onActivate !== 'function')
      .reduce((sum, r) => sum + widthOf(r.item.id), 0);
    const widths = new Map(demotable.map((r) => [r.item.id, widthOf(r.item.id)]));
    const overflowWidth =
      itemRefs.current.get(OVERFLOW_ID)?.getBoundingClientRect().width ?? OVERFLOW_WIDTH_FALLBACK;
    // Derived from the WHOLE bar, not the inline set — see `deriveChromeWidth`. Charged to the
    // demotable budget, because the pinned items cannot pay it.
    //
    // **Only once something has actually measured.** A row whose every item reports zero width has
    // not been laid out — no layout engine, or not yet painted — and charging it a chrome it cannot
    // yet be carrying would demote every command on the strength of nothing. This also keeps the
    // ~25 existing suites a genuine before/after oracle: under jsdom every box is zero, so the
    // budget stays byte-identical to the pre-M1 arithmetic and those tests keep testing what they
    // were written to test.
    const anythingMeasured = bar.some((r) => widthOf(r.item.id) > 0);
    const chromeWidth =
      anythingMeasured && isWidthConstrained(container) ? deriveChromeWidth(bar) : 0;
    const { overflow } = computeOverflow(
      demotable,
      widths,
      Math.max(0, available - pinnedWidth),
      overflowWidth,
      chromeWidth,
      ITEM_GAP_PX,
    );
    const next = new Set(overflow);
    setOverflowedIds((prev) => (sameSet(prev, next) ? prev : next));

    // Could this row afford to label its `'auto'` items at the width it actually has? Costed
    // against `available` (the container), never against leftover slack — see `measureLabelWidth`
    // for why that distinction is what keeps this from oscillating. An item already labelled is
    // costed at its live width; one still icon-only is costed at its live width plus the estimate.
    const autoItems = bar.filter(
      (r) => typeof r.item.onActivate === 'function' && labelPolicy(r.item, layout) === 'auto',
    );
    if (autoItems.length === 0) {
      setAutoLabelsFit(false);
      return;
    }
    const font = fontOf(itemRefs.current.get(autoItems[0]!.item.id));
    const inlineTotal = bar.reduce((sum, r) => sum + widthOf(r.item.id), 0);
    let labelCost = 0;
    for (const r of autoItems) {
      const text = measureLabelWidth(r.item.label, font);
      // No measuring context ⇒ no honest estimate ⇒ stay icon-only rather than guess.
      if (text === null) {
        setAutoLabelsFit(false);
        return;
      }
      labelCost += autoLabelsFit ? 0 : text + LABEL_CHROME_PX;
    }
    // Costed against the same honest total the overflow decision uses. Without `chromeWidth` here
    // the two halves of one pass disagree about how wide the row is — which is how a row could
    // promote labels it had already been told it could not afford, then overflow its container.
    const projected =
      inlineTotal + chromeWidth + labelCost + (overflow.length > 0 ? overflowWidth : 0);
    setAutoLabelsFit(projected + LABEL_PROMOTION_MARGIN_PX <= available);
  }, [bar, demotable, autoLabelsFit, bandWidth]);

  // Re-measure synchronously after layout whenever the resolved items change, keeping the ref current.
  const measureRef = useRef(measure);
  useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  }, [measure]);

  // Attach the ResizeObserver **once** on mount, reading the latest `measure` via the ref, so an
  // unrelated parent re-render never tears down and rebuilds the observer (perf review, ADR-0031).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

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

  // The ordered list of focusable ids (interactive inline items, then ⋯) that roving tabindex walks.
  // Presentational read-outs (the finish chip) are inline but never a stop — nothing to operate.
  const focusableIds = useMemo(
    () => [
      ...inlineBar.filter((r) => !r.item.presentational).map((r) => r.item.id),
      ...(overflowItems.length ? [OVERFLOW_ID] : []),
    ],
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
      // Never steal the arrow / Home / End keys from a form field inside a toolbar item (e.g. the
      // native date input in the "Go to date" popover or the "Project start" control): those keys drive
      // native segment editing (month/day/year), and hijacking them both breaks entry and — via the
      // popover's focusout-closes handler — yanks the picker shut mid-interaction (WCAG 2.1.1). A
      // portalled popover is still a React-tree descendant, so its keydown bubbles here.
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
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
      /*
       * `overflow-x-auto` is the sub-floor remedy (M1-T5, remedy (b)), chosen after remedy (a) was
       * measured and failed.
       *
       * Below the row's pinned floor there is nothing left to demote: Row 1's `render` items measure
       * ~1177 px against an 872 px container at Surface Pro portrait, and a `render` item can never
       * demote (`Toolbar.tsx` "you don't stuff a popover into a menu"). So the width has to go
       * somewhere, and there are only two honest answers — hide part of the row, or let the reader
       * reach it. `overflow-hidden` chose the first and that is precisely the defect this milestone
       * exists to remove: at 1024 it clipped `isolate-logic` to 0 px visible with no `⋯` route,
       * which is the shipped bug in a tidier costume.
       *
       * The accepted cost is a scroll affordance on the two narrowest widths in the target list.
       * `overflow-y-hidden` keeps it to one axis so the row can never grow a vertical scrollbar and
       * eat canvas height. M3's responsive ladder should make this unreachable in practice; until
       * then, reachable-by-scrolling beats hidden.
       */
      className={cn('flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden', className)}
    >
      {groups.map(({ group, items: groupItems }, i) => (
        <div
          key={group}
          role="group"
          aria-label={labels[group]}
          className={cn(
            // Groups keep their natural width and are never clipped: the sub-floor remedy is the
            // row's `overflow-x-auto` (on the container above), not shrinking the groups.
            //
            // **Two earlier attempts are recorded because each looked right and was measured wrong.**
            // `min-w-0` alone let a group's box shrink while its `whitespace-nowrap` buttons kept
            // theirs, so the content spilled over the `⋯` — Playwright called that button "visible,
            // enabled and stable" and then could not click it. Adding `overflow-hidden` fixed the
            // overlap and traded it for something worse: at 1024 `isolate-logic` was clipped to
            // **0 px visible**, and a `render` item can never demote, so there was no route to it at
            // all. Hiding a command inside a tidy row is the same defect as pushing it out of an
            // untidy one.
            'flex items-center gap-1',
            i > 0 && 'border-border ml-1 border-l pl-2', // a hairline separates groups
            // Right-align this group (and everything after it) — the trailing status read-outs on Row 1.
            group === alignEndGroup && 'ml-auto',
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
                  disabledReason: r.disabledReason,
                  active: r.active,
                  layout,
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
                ref={(node) => setItemRef(r.item.id, node)}
                itemId={r.item.id}
                label={r.item.label}
                {...(r.item.description ? { description: r.item.description } : {})}
                // The RESOLVED icon (the raw `item.icon` may be a ctx function, never a node).
                icon={r.icon}
                {...(r.busy ? { busy: true } : {})}
                // Presentation reads the item's own label policy — never its `tier`, which is
                // priority and answers a different question (TECH_DEBT #61).
                showLabel={
                  labelPolicy(r.item, layout) === 'always' ||
                  (labelPolicy(r.item, layout) === 'auto' && autoLabelsFit)
                }
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

      {/*
        `shrink-0`: the `⋯` is the escape hatch, so it must be the **last** thing to lose width,
        never the first. Measured before this: at 1440 it was 32 px wide with **1 px visible**, and
        at 960 with **none** — a button holding the only route to ~15 commands, shrunk out of
        existence by the flex line it shares with the groups it exists to rescue.
      */}
      {overflowItems.length > 0 && (
        <div className="border-border ml-auto flex shrink-0 items-center border-l pl-1">
          <ToolbarOverflow
            ref={(node) => setItemRef(OVERFLOW_ID, node)}
            items={overflowItems}
            groupLabels={labels}
            context={context}
            tabIndex={tabIndexFor(OVERFLOW_ID)}
            onFocus={() => setActiveId(OVERFLOW_ID)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * An item's label policy. The default is `'auto'` — the primitive never reads {@link ToolbarTier}
 * to decide presentation, which is the whole point of the split (TECH_DEBT #61): `tier` answers
 * "what demotes into `⋯` first", and nothing else.
 */
function labelPolicy<Ctx>(
  item: ToolbarItem<Ctx>,
  layout: ToolbarLayoutMode,
): 'always' | 'auto' | 'never' {
  const policy = item.showLabel ?? 'auto';
  // The band form collapses to the two static answers here, so every call site downstream keeps
  // seeing the three-value union it always did — the widening is contained to this function
  // (ADR-0091 D3a).
  if (typeof policy === 'object') return bandIsAtLeast(layout, policy.atLeast) ? 'always' : 'never';
  return policy;
}

/** The shorthand `font` of a rendered control, for text measurement. Falls back to a sane default. */
function fontOf(node: HTMLElement | undefined): string {
  if (!node || typeof getComputedStyle !== 'function') return '14px sans-serif';
  const style = getComputedStyle(node);
  return style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function byCanonical<Ctx>(a: ResolvedToolbarItem<Ctx>, b: ResolvedToolbarItem<Ctx>): number {
  return groupRank(a.item.group) - groupRank(b.item.group) || a.item.order - b.item.order;
}
