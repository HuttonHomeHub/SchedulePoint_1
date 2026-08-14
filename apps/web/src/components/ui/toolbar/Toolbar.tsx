import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useToolbarBandWidth } from './toolbar-band';
import {
  GROUP_RULE_PX,
  ICON_LABEL_GAP_PX,
  computeLadder,
  iconOnlyWidth,
  type LadderItem,
  type LadderResult,
} from './toolbar-ladder';
import {
  TOOLBAR_GROUPS,
  bandIsAtLeast,
  groupRank,
  partitionByTier,
  priorityOf,
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
 * Per-item margins no group-level accounting can attribute, plus sub-pixel box rounding.
 *
 * **Re-measured for M7** (`docs/specs/workspace-modes/m7-ladder-measurement.md`), and the figure
 * fell by more than half. It was 56, taken from a 26–31 px (Row 1) / 50–55 px (Row 2) remainder — but
 * that measurement was made with the harness's item-width convention, and `data-toolbar-item` sits on
 * a split button's **primary half**, so each of Row 2's two split buttons dropped a ~26 px caret into
 * the following gap and it was counted as unattributed chrome. `Toolbar` never made that mistake: a
 * `render` item's ref is the wrapping `<span>`, which holds both halves.
 *
 * With every gap on both rows attributed by name, what is genuinely left over is the search field's
 * `ml-3` — **12 px, on Row 1 only** — and rounding. 16 covers it with room to spare.
 *
 * The 44 px this recovers is not a tidy-up: it is within a couple of pixels of the width that costs
 * Row 2 its labels at the product owner's 1646 (§2 of that document). An addend you can name is one
 * a later composition change invalidates loudly; a generous constant absorbs the change silently and
 * charges every row for it.
 */
const CHROME_RESIDUAL_PX = 16;

/**
 * The `⋯`'s wrapper: its `gap-1` from the previous child, its `border-l`, and its `pl-1`. The
 * measured node is the button, so this was uncounted — a small charge, but one that only ever
 * applied when the row was already short.
 */
const OVERFLOW_WRAPPER_PX = 9;

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
 * The row's own chrome, **derived from the registry — never read from the DOM**.
 *
 * The overflow decision was once handed only item widths, so it answered "do these boxes sum to less than
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
 * **Erring high is the safe direction here.** Over-estimating demotes a command that would just
 * have fitted, which costs a click; under-estimating paints it outside the box, which costs the
 * command. The term is charged identically whatever the row currently renders, which is what makes
 * that trade a safe one — the constant it replaced was charged in only one of two label states and
 * therefore biased the comparison rather than padding it.
 */
function deriveChromeWidth<Ctx>(bar: ResolvedToolbarItem<Ctx>[]): number {
  if (bar.length === 0) return 0;
  const groupCount = new Set(bar.map((r) => r.item.group)).size;
  // Rules and the residual only. The **item gaps are `computeLadder`'s**, because a demotion has to
  // credit one back and a demotion is its decision to make.
  return Math.max(0, groupCount - 1) * GROUP_RULE_PX + CHROME_RESIDUAL_PX;
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
  // Last-known measured width per item. An item currently in the `⋯` has no inline node, so its live
  // `getBoundingClientRect().width` reads 0 — feeding that 0 into the ladder would drop the total
  // below the threshold, promote the item inline, re-measure a non-zero width, overflow it again… a
  // per-frame flip-flop that makes the bar jitter. Caching each real width (updated only while the
  // item is inline, > 0) keeps the decision deterministic. Since M7 this matters only for `render`
  // items, which are the only ones still measured — a plain button's width is derived and never 0.
  const widthCacheRef = useRef(new Map<string, number>());
  const [overflowedIds, setOverflowedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * Which `'auto'` items currently show their label, and which tier-3 candidates the row has taken
   * out of the `⋯`. Both are decided together by {@link computeLadder}.
   *
   * **This replaces a single row-level `autoLabelsFit` boolean, and the reasoning it replaces was
   * explicit**: labelling an arbitrary subset of one group "reads as inconsistency rather than as a
   * response to width". That is a real cost and the product owner has accepted it, asking for labels
   * that fall *one at a time, least important first* rather than a row that goes from fully labelled
   * to fully bare in one step. Two adjacent controls in one group differing is what that necessarily
   * looks like. Recorded rather than quietly deleted (ADR-0091).
   *
   * Mirrored into refs because the ladder reads the previous answer to give promotion its hysteresis,
   * and `measure` must not take a dependency on its own output.
   */
  const [labelledIds, setLabelledIds] = useState<Set<string>>(new Set());
  const [admittedIds, setAdmittedIds] = useState<Set<string>>(new Set());
  const labelledIdsRef = useRef(labelledIds);
  const admittedIdsRef = useRef(admittedIds);
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
  /**
   * Is the `⋯` menu open? While it is, the ladder **holds its previous answer**.
   *
   * Tier-3 admission gave an item a way OUT of the overflow menu, and that is new: before it, a
   * tier-3 command could only ever move in, so a `MenuItem` could never vanish from under a reader
   * who had arrow-keyed onto it. Now a resize that finds room removes it, and `Menu` manages focus
   * on open and on close but not on its item list shrinking — so focus lands on `<body>`
   * (WCAG 2.4.3). Freezing is the honest fix rather than teaching `Menu` to recover: the reader
   * asked to see this list, and rearranging it underneath them is wrong whether or not focus
   * survives. The next pass runs the moment they close it.
   *
   * A ref rather than state, because nothing renders differently — `measure` only reads it.
   */
  const menuOpenRef = useRef(false);

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
  // `bar` is the **core** (tiers 1–2, held unconditionally); `staticOverflow` is the tier-3
  // **candidates**, which the ladder may admit back onto the row when there is room.
  const { bar, overflow: staticOverflow } = useMemo(() => partitionByTier(resolved), [resolved]);

  /**
   * Commit one ladder answer. Every set goes through `sameSet` first, because this runs from a
   * `ResizeObserver` and a fresh `Set` with identical contents would re-render the whole row on
   * every observed frame.
   */
  const applyLadder = useCallback((next: LadderResult) => {
    labelledIdsRef.current = next.labelled;
    admittedIdsRef.current = next.admitted;
    setLabelledIds((prev) => (sameSet(prev, next.labelled) ? prev : next.labelled));
    setAdmittedIds((prev) => (sameSet(prev, next.admitted) ? prev : next.admitted));
    setOverflowedIds((prev) => (sameSet(prev, next.overflowed) ? prev : next.overflowed));
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    // See `menuOpenRef`: never rearrange a list somebody is reading.
    if (menuOpenRef.current) return;
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
    const overflowWidth =
      (itemRefs.current.get(OVERFLOW_ID)?.getBoundingClientRect().width ??
        OVERFLOW_WIDTH_FALLBACK) + OVERFLOW_WRAPPER_PX;

    // Two consequences follow from this one reading, and they are the same fact twice: a row whose
    // width comes from its own content has no deficit to pay (so it is charged no chrome) and cannot
    // safely give anything up (so it never demotes) — because on such a row `clientWidth` is an
    // OUTPUT of the demotion decision, which makes demotion a one-way door. See
    // `LadderInput.allowDemotion` for the 37 px row this was measured on.
    const widthConstrained = isWidthConstrained(container);
    // Only when something on the row could take a label: `getComputedStyle` is a style recalc, and a
    // row whose every item is `showLabel: 'always'` has nothing to measure text for (perf gate).
    const needsFont = bar.some(
      (r) => typeof r.item.onActivate === 'function' && labelPolicy(r.item, layout) !== 'never',
    );
    const font = needsFont ? fontOf(itemRefs.current.get(bar[0]?.item.id ?? '')) : '';
    const coarsePointer =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false;

    const toLadderItem = (r: ResolvedToolbarItem<Ctx>, index: number): LadderItem => {
      const demotable = typeof r.item.onActivate === 'function';
      const policy = labelPolicy(r.item, layout);
      // **Derived for a plain button, measured for a `render` item** — the distinction the whole
      // pass rests on. A plain button's box is fixed by the CVA and changes only with the label
      // this function is deciding, so measuring it puts an output on the input side. A `render`
      // item's box is a function of `layout` and `ctx` and of nothing decided here.
      const baseWidth = demotable
        ? iconOnlyWidth(r.icon != null, coarsePointer)
        : widthOf(r.item.id);
      const text =
        demotable && policy !== 'never' && needsFont ? measureLabelWidth(r.item.label, font) : null;
      return {
        id: r.item.id,
        group: r.item.group,
        index,
        order: r.item.order,
        priority: priorityOf(r.item),
        demotionGroup: r.item.demotionGroup,
        demotable,
        baseWidth,
        // No measuring context ⇒ no honest estimate ⇒ the item never takes a label, which is the
        // pre-existing icon-only fallback rather than a guess.
        labelDelta: text === null ? null : text + ICON_LABEL_GAP_PX,
        labelPolicy: policy,
      };
    };

    applyLadder(
      computeLadder({
        available,
        // Group rules and named margins only — `computeLadder` charges the item gaps itself, so a
        // demotion can credit one back.
        //
        // **Zero for a row that sizes to its own content**, which is the whole of the
        // `isWidthConstrained` fix and is preserved here unchanged: such a row's `clientWidth` *is*
        // its content, so charging it a chrome makes the answer falsely negative by exactly the
        // chrome and demotes commands from a bar with no width problem — which is how `e2e-library`
        // once timed out clicking **Resources** on the floating selection bar.
        //
        // It is deliberately expressed as a zero chrome rather than as "do not demote", which was
        // the first attempt and is wrong: jsdom reports `flex-grow: 0` — the CSS *initial* value —
        // for every element, so a demotion switch keyed on it would have turned demotion off in
        // every unit test in the repository. A zero chrome leaves the arithmetic intact and simply
        // stops it inventing a deficit.
        chrome: widthConstrained ? deriveChromeWidth(bar) : 0,
        allowDemotion: widthConstrained,
        core: bar.map(toLadderItem),
        candidates: staticOverflow.map((r, i) => toLadderItem(r, bar.length + i)),
        overflowWidth,
        previouslyLabelled: labelledIdsRef.current,
        previouslyAdmitted: admittedIdsRef.current,
      }),
    );
  }, [bar, staticOverflow, applyLadder, bandWidth, layout]);

  // Re-measure synchronously after layout whenever the resolved items change, keeping the ref current.
  const measureRef = useRef(measure);
  useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  }, [measure]);

  // Attach the ResizeObserver **once** on mount, reading the latest `measure` via the ref, so an
  // unrelated parent re-render never tears down and rebuilds the observer (perf review, ADR-0031).
  const observerRef = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(container);
    observerRef.current = ro;
    return () => {
      observerRef.current = null;
      ro.disconnect();
    };
  }, []);

  /**
   * Also watch every **`render` item's** own box.
   *
   * A `render` item is the one kind the ladder measures rather than derives, and its width can change
   * with no container resize at all — so nothing wakes the row. The Project-finish chip is exactly
   * that: it renders "Finish …" while its query is in flight and a real date when it resolves, which
   * is wider.
   *
   * **This landed once, was reverted twice by accident, and that is worth recording.** Both times a
   * `git checkout --` used to verify an unrelated test red took the uncommitted work with it, and
   * both times a green gate and a commit message claiming the effect existed were the only evidence
   * anyone had. Two specialist reviews found it missing independently, by reading the code rather
   * than the message.
   *
   * **It does not close a loop.** A render item's width is a function of `ctx` and of the density
   * band, and the band is driven by the *band's* width (`toolbar-band.tsx`), never by this row's
   * content — so a width change here can never move the boundary that caused it.
   *
   * Runs on every commit with no dependency array: the set of mounted nodes is what it tracks, and
   * that is a commit-time fact. `observe` on an already-observed element replaces the existing
   * observation rather than adding a second, so re-running is idempotent; the `disconnect` above
   * drops all of them at unmount.
   */
  useLayoutEffect(() => {
    const ro = observerRef.current;
    if (!ro) return;
    for (const [id, node] of itemRefs.current) {
      if (id !== OVERFLOW_ID) ro.observe(node);
    }
  });

  // The inline bar: the core minus anything demoted, **plus any admitted tier-3 candidate**, in
  // canonical order — an admitted candidate takes its registry position, not a place at the end.
  const inlineBar = useMemo(
    () =>
      [
        ...bar.filter((r) => !overflowedIds.has(r.item.id)),
        ...staticOverflow.filter((r) => admittedIds.has(r.item.id)),
      ].sort(byCanonical),
    [bar, staticOverflow, overflowedIds, admittedIds],
  );
  // Whatever is left: unadmitted candidates and demoted core items. When this is empty the `⋯` does
  // not render at all — which is the whole of "hidden unless in use", and falls out of admission
  // rather than needing a rule of its own.
  //
  // The two halves are asked **different questions**, and that asymmetry is what keeps the
  // unmeasured default right (design review, B5). A core item is inline unless it demoted; a
  // candidate is in the menu unless it was admitted. Asking `overflowedIds.has(…)` of a candidate
  // would put every tier-3 command on the row the moment `measure` returns early — which is exactly
  // what it does under jsdom, where ~35 suites are written against tier 3 being in the `⋯`.
  const overflowItems = useMemo(
    () =>
      [
        ...bar.filter((r) => overflowedIds.has(r.item.id)),
        ...staticOverflow.filter((r) => !admittedIds.has(r.item.id)),
      ].sort(byCanonical),
    [bar, staticOverflow, overflowedIds, admittedIds],
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

  /**
   * Is an `alignEndGroup` group currently on the row?
   *
   * **This decides whether the `⋯` may claim an auto margin, and getting it wrong is a shipped
   * defect rather than a tidiness question.** Free space in a flex line is distributed **equally
   * among every auto margin on that line**, not given to the last one. So with `ml-auto` on both the
   * trailing group and the `⋯` wrapper — which is what shipped — a row with 382 px of slack put
   * *191 px* in front of each: `Summary ▾` sat at the midpoint of the gap and the `⋯` sat at the
   * midpoint of what was left, which is exactly the "stranded in the middle of the row" the product
   * owner reported. Neither control was at the trailing edge, and each looked individually plausible.
   *
   * At most one auto margin per row, therefore. The trailing group keeps it when it is inline (it is
   * further left, so it pushes the `⋯` along with everything else after it); the `⋯` takes it only
   * when there is no such group to ride behind.
   */
  const alignEndGroupInline =
    alignEndGroup !== undefined && groups.some((g) => g.group === alignEndGroup);

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
                showLabel={labelPolicy(r.item, layout) === 'always' || labelledIds.has(r.item.id)}
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

      {/*
        `shrink-0`: the `⋯` is the escape hatch, so it must be the **last** thing to lose width,
        never the first. Measured before this: at 1440 it was 32 px wide with **1 px visible**, and
        at 960 with **none** — a button holding the only route to ~15 commands, shrunk out of
        existence by the flex line it shares with the groups it exists to rescue.
      */}
      {overflowItems.length > 0 && (
        <div
          className={cn(
            'border-border flex shrink-0 items-center border-l pl-1',
            // See `alignEndGroupInline`: a second auto margin on the line halves the slack in front
            // of the trailing group instead of pushing this button to the edge.
            !alignEndGroupInline && 'ml-auto',
          )}
        >
          <ToolbarOverflow
            ref={(node) => setItemRef(OVERFLOW_ID, node)}
            items={overflowItems}
            groupLabels={labels}
            context={context}
            tabIndex={tabIndexFor(OVERFLOW_ID)}
            onFocus={() => setActiveId(OVERFLOW_ID)}
            onOpenChange={(open) => {
              menuOpenRef.current = open;
              // Re-measure on close, so a resize that happened while the menu was open is not lost.
              if (!open) measureRef.current();
            }}
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
