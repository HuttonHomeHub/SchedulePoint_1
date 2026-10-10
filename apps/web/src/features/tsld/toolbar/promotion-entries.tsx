import { DEPENDENCY_TYPES, type ActivityType, type DependencyType } from '@repo/types';
import {
  ChartArea,
  DollarSign,
  Flame,
  FlagTriangleLeft,
  FlagTriangleRight,
  GitCompareArrows,
  HeartPulse,
  Share2,
  Sunset,
  Telescope,
  TriangleAlert,
} from 'lucide-react';

import type { ColourMode, FilterAttr } from '../render/lenses';
import type { TsldViewToggles } from '../render/paint';

import { PROMOTION_LADDER, type LadderRank } from './promotion-ladder';
import type { TsldToolbarContext } from './tsld-toolbar-context';

import { isPromoted, type PromotableEntry } from '@/components/ui/toolbar/toolbar-promotion';
import {
  CANVAS_AUTHORING_ENABLED,
  CANVAS_LENSES_ENABLED,
  CANVAS_LIVE_FEEDBACK_ENABLED,
  EARNED_VALUE_ENABLED,
  GUEST_SHARE_LINKS_ENABLED,
  RESOURCE_CURVES_ENABLED,
} from '@/config/env';
import { ACTIVITY_TYPE_LABELS } from '@/features/activities';
import { DEPENDENCY_TYPE_LABELS } from '@/features/dependencies';

/**
 * **Every menu command that can come out onto the bar, as data** (toolbar-redesign M5, spec §4.11).
 *
 * Only the *promotable* rows are here. The export formats, Go to date, Recent edits, View's set-once
 * settings and each menu's **anchor** stay hand-written JSX in `tsld-toolbar-items.tsx`, because they
 * never move: that is what keeps a source trigger present — and its menu non-empty — at every width
 * (UX N3, "commands stay in place"). The anchors are Filter's Has constraint, Analysis's
 * Baselines…, Share & export's formats and Print…, Link's Start → Finish and Add's Task and Level
 * of effort. A structural test asserts each renders unconditionally.
 *
 * **One definition of each command.** The bar's button and the menu row it left both read the entry
 * (through {@link isPromoted}), so the handler, the pressed state and the refusal exist once. The
 * menu omits the row while the entry is on the bar — it does not shade it — and each stage's `at`
 * is the committed table in `promotion-ladder.ts`.
 */

/** The phrase "Add" completes: "…to add activities". Shared with the Add split button's refusal. */
export const ADD_ACTION = 'add activities';
/** As {@link ADD_ACTION}, for the Link tool. */
export const LINK_ACTION = 'link activities';
export const SHARE_NO_PERMISSION_REASON = 'You don’t have permission to share this plan';
/** Shared disabled reason for the insight lenses on an empty/uncomputed canvas. */
export const LENS_NO_DIAGRAM_REASON = 'Add an activity first';

/**
 * Presentation order for the colour modes — default first, then the two analytical lenses.
 * (Driving-resource is a deferred fast-follow, CQ-1.)
 */
export const COLOUR_MODE_ORDER: readonly ColourMode[] = ['criticality', 'totalFloat', 'wbs'];

export const COLOUR_MODE_LABELS: Record<ColourMode, string> = {
  criticality: 'Criticality',
  totalFloat: 'Total float',
  wbs: 'WBS group',
};

/**
 * Pick a link kind: set it and arm the tool in one gesture (a pick always means "link now"). The
 * `Link ▾` menu row and the promoted preset both call this, so the same choice behaves the same at
 * every width. Changing the kind while already linking just re-arms.
 */
export function pickLinkKind(ctx: TsldToolbarContext, type: DependencyType): void {
  ctx.setLinkType(type);
  if (!ctx.isLinking) ctx.toggleLinkMode();
}

/** As {@link pickLinkKind} for the Add tool: `setCreateType` itself arms add mode (the host wires it). */
export function pickAddKind(ctx: TsldToolbarContext, type: ActivityType): void {
  ctx.setCreateType(type);
}

const noDiagram = (ctx: TsldToolbarContext): string | undefined =>
  ctx.hasDiagram ? undefined : LENS_NO_DIAGRAM_REASON;

/** The ladder `at` for a rank — the one place an entry reads it. */
const at = (rank: LadderRank): PromotableEntry<TsldToolbarContext>['at'] => PROMOTION_LADDER[rank];

/** Filter attribute → the entry that promotes it. An attribute with no entry never leaves the menu. */
export const FILTER_ATTR_ENTRIES: Partial<Record<FilterAttr, PromotableEntry<TsldToolbarContext>>> =
  {
    critical: {
      id: 'critical-only',
      label: 'Critical only',
      menuLabel: 'Critical',
      menuName: 'Filter',
      icon: <Flame className="size-4" />,
      from: 'filter',
      rank: 1,
      at: at('L1'),
      isVisible: () => CANVAS_LENSES_ENABLED,
      // Pressed from the same set the trigger reads (`filterAttrs.size > 0`), so the two agree.
      isActive: (ctx) => ctx.filterAttrs.has('critical'),
      isEnabled: (ctx) => ctx.hasDiagram,
      disabledReason: noDiagram,
      onActivate: (ctx) => ctx.toggleFilterAttr('critical'),
    },
    conflict: {
      id: 'has-conflict-only',
      label: 'Has conflict only',
      menuLabel: 'Has conflict',
      menuName: 'Filter',
      icon: <TriangleAlert className="size-4" />,
      from: 'filter',
      rank: 6,
      at: at('L6'),
      isVisible: () => CANVAS_LENSES_ENABLED,
      isActive: (ctx) => ctx.filterAttrs.has('conflict'),
      isEnabled: (ctx) => ctx.hasDiagram,
      disabledReason: noDiagram,
      onActivate: (ctx) => ctx.toggleFilterAttr('conflict'),
    },
  };

/**
 * The colour modes as a **flat pressed set** inside the View group — not a nested `role="group"`
 * (#154). Each name carries the set ("Colour by: Total float") while the printed text is the value
 * under a "Colour" caption, so a sighted reader is not read it twice and WCAG 2.5.3 holds.
 * `aria-pressed` is true on exactly one; pressing the pressed one is a no-op.
 */
export const COLOUR_ENTRIES: readonly PromotableEntry<TsldToolbarContext>[] = COLOUR_MODE_ORDER.map(
  (mode, index) => ({
    id: `colour-by-${mode}`,
    label: `Colour by: ${COLOUR_MODE_LABELS[mode]}`,
    visibleLabel: COLOUR_MODE_LABELS[mode],
    menuLabel: `Colour · ${COLOUR_MODE_LABELS[mode]}`,
    menuName: 'View',
    // A set member carries no glyph: the caption names the set and a row of three identical palettes
    // would say nothing.
    icon: undefined,
    from: 'view',
    // Grouped just after the View trigger; the second decimal keeps the members in order.
    rank: 2 + index / 10,
    at: at('L2'),
    ...(index === 0 ? { captionBefore: 'Colour' } : {}),
    isVisible: () => CANVAS_LENSES_ENABLED,
    isActive: (ctx: TsldToolbarContext) => ctx.colourMode === mode,
    onActivate: (ctx: TsldToolbarContext) => ctx.setColourMode(mode),
  }),
);

/** `TsldViewToggles` keys that can be promoted, and the entry that promotes each. */
export const VIEW_TOGGLE_ENTRIES: Partial<
  Record<keyof TsldViewToggles, PromotableEntry<TsldToolbarContext>>
> = {
  lateOverlay: {
    id: 'late-start-overlay',
    label: 'Late-start overlay',
    menuLabel: 'Late-start overlay',
    menuName: 'View',
    icon: <Sunset className="size-4" />,
    from: 'view',
    rank: 3,
    at: at('L3'),
    isActive: (ctx) => ctx.viewToggles.lateOverlay,
    onActivate: (ctx) => ctx.toggleView('lateOverlay'),
  },
  floatTails: {
    id: 'feasible-window',
    label: 'Feasible window',
    menuLabel: 'Feasible window',
    menuName: 'View',
    icon: <Telescope className="size-4" />,
    from: 'view',
    rank: 4,
    at: at('L4'),
    isVisible: () => CANVAS_LIVE_FEEDBACK_ENABLED,
    isActive: (ctx) => ctx.viewToggles.floatTails === true,
    onActivate: (ctx) => ctx.toggleView('floatTails'),
  },
};

export const HEALTH_CHECK_ENTRY: PromotableEntry<TsldToolbarContext> = {
  id: 'health-check',
  label: 'Health check',
  menuLabel: 'Health check…',
  menuName: 'Analysis',
  icon: <HeartPulse className="size-4" />,
  from: 'analysis',
  rank: 1,
  at: at('P1'),
  // Pressed from the dock itself, so it stays in step when the dock is closed from its own button.
  isActive: (ctx) => ctx.healthOpen,
  onActivate: (ctx) => ctx.toggleHealthCheck(),
};

export const COMPARE_REVISIONS_ENTRY: PromotableEntry<TsldToolbarContext> = {
  id: 'compare-revisions',
  label: 'Compare revisions',
  menuLabel: 'Compare revisions…',
  menuName: 'Analysis',
  icon: <GitCompareArrows className="size-4" />,
  from: 'analysis',
  rank: 6,
  at: at('P6'),
  isActive: (ctx) => ctx.revisionsOpen,
  onActivate: (ctx) => ctx.toggleRevisionCompare(),
};

export const EARNED_VALUE_ENTRY: PromotableEntry<TsldToolbarContext> = {
  id: 'earned-value',
  label: 'Earned value…',
  menuLabel: 'Earned value…',
  menuName: 'Analysis',
  icon: <DollarSign className="size-4" />,
  from: 'analysis',
  rank: 7,
  at: at('P7'),
  isVisible: () => EARNED_VALUE_ENABLED,
  onActivate: (ctx) => ctx.openEarnedValue(),
};

export const RESOURCE_HISTOGRAM_ENTRY: PromotableEntry<TsldToolbarContext> = {
  id: 'resource-histogram',
  label: 'Resource histogram…',
  menuLabel: 'Resource histogram…',
  menuName: 'Analysis',
  icon: <ChartArea className="size-4" />,
  from: 'analysis',
  rank: 8,
  at: at('P8'),
  isVisible: () => RESOURCE_CURVES_ENABLED,
  onActivate: (ctx) => ctx.openResourceHistogram(),
};

export const SHARE_ENTRY: PromotableEntry<TsldToolbarContext> = {
  id: 'share',
  label: 'Share…',
  menuLabel: 'Share…',
  menuName: 'Share & export',
  icon: <Share2 className="size-4" />,
  from: 'export',
  rank: 4,
  at: at('P4'),
  isVisible: () => GUEST_SHARE_LINKS_ENABLED,
  // A permission, not a state: shaded with the reason rather than hidden, so a Viewer learns that
  // sharing exists and why they cannot (ADR-0082) — the same gate the menu row carries.
  isEnabled: (ctx) => ctx.canShare,
  disabledReason: (ctx) => (ctx.canShare ? undefined : SHARE_NO_PERMISSION_REASON),
  onActivate: (ctx) => ctx.openShare(),
};

/**
 * The Add kind presets: **kind presets that arm their tool, exactly as the menu pick does**.
 * `aria-pressed` is "the tool is armed *and* the kind is this one"; pen-gated with the same refusal.
 * Task is the menu's anchor and never promotes.
 */
export const ADD_KIND_ENTRIES: readonly PromotableEntry<TsldToolbarContext>[] = (
  [
    ['START_MILESTONE', 'P2', 2, <FlagTriangleRight key="s" className="size-4" />],
    ['FINISH_MILESTONE', 'P3', 3, <FlagTriangleLeft key="f" className="size-4" />],
  ] as const
).map(([type, rank, place, icon]) => ({
  id: `add-${type === 'START_MILESTONE' ? 'start' : 'finish'}-milestone`,
  label: `Add: ${ACTIVITY_TYPE_LABELS[type]}`,
  menuLabel: ACTIVITY_TYPE_LABELS[type],
  menuName: 'Add',
  icon,
  from: 'add-activity',
  rank: place,
  at: at(rank),
  isVisible: () => CANVAS_AUTHORING_ENABLED,
  penGated: true,
  activeKind: 'armed' as const,
  isActive: (ctx: TsldToolbarContext) => ctx.isAddingActivity && ctx.createType === type,
  disabledReason: (ctx: TsldToolbarContext) => ctx.scheduleRefusal(ADD_ACTION) ?? undefined,
  onActivate: (ctx: TsldToolbarContext) => pickAddKind(ctx, type),
}));

/**
 * The Link kind presets — a flat pressed set under a "Link" caption, arming the tool as the menu pick
 * does. **Start → Finish is Link's unconditional anchor** and never promotes: "Stop linking" renders
 * only while linking, so it cannot anchor a menu that must never empty.
 */
export const LINK_PROMOTABLE_KINDS: readonly DependencyType[] = DEPENDENCY_TYPES.filter(
  (type) => type !== 'SF',
);

/**
 * The caption over the promoted link kinds. "Link" would repeat the split button beside it — two
 * adjacent "Link" labels read as one control — so it says what the buttons choose.
 */
const LINK_KIND_CAPTION = 'Type';

export const LINK_KIND_ENTRIES: readonly PromotableEntry<TsldToolbarContext>[] =
  LINK_PROMOTABLE_KINDS.map((type, index) => ({
    id: `link-${type.toLowerCase()}`,
    label: `Link: ${DEPENDENCY_TYPE_LABELS[type]}`,
    visibleLabel: DEPENDENCY_TYPE_LABELS[type],
    menuLabel: `${type} — ${DEPENDENCY_TYPE_LABELS[type]}`,
    menuName: 'Link',
    icon: undefined,
    from: 'link-tool',
    rank: 5 + index / 10,
    at: at('P5'),
    ...(index === 0 ? { captionBefore: LINK_KIND_CAPTION } : {}),
    isVisible: () => CANVAS_AUTHORING_ENABLED,
    penGated: true,
    activeKind: 'armed' as const,
    isActive: (ctx: TsldToolbarContext) => ctx.isLinking && ctx.linkType === type,
    disabledReason: (ctx: TsldToolbarContext) => ctx.scheduleRefusal(LINK_ACTION) ?? undefined,
    onActivate: (ctx: TsldToolbarContext) => pickLinkKind(ctx, type),
  }));

/** Lookups for the menus: the entry that promotes a given kind, or none (an anchor never has one). */
export const COLOUR_ENTRY_FOR: Partial<
  Record<ColourMode, PromotableEntry<TsldToolbarContext> | undefined>
> = Object.fromEntries(COLOUR_MODE_ORDER.map((mode, index) => [mode, COLOUR_ENTRIES[index]]));
export const ADD_ENTRY_FOR: Partial<
  Record<ActivityType, PromotableEntry<TsldToolbarContext> | undefined>
> = {
  START_MILESTONE: ADD_KIND_ENTRIES[0],
  FINISH_MILESTONE: ADD_KIND_ENTRIES[1],
};
export const LINK_ENTRY_FOR: Partial<
  Record<DependencyType, PromotableEntry<TsldToolbarContext> | undefined>
> = Object.fromEntries(
  LINK_PROMOTABLE_KINDS.map((type, index) => [type, LINK_KIND_ENTRIES[index]]),
);

/** Every non-lens entry, in the order the deck lists them. The lens entry (L5) is added by the registry. */
export const PROMOTION_ENTRIES: readonly PromotableEntry<TsldToolbarContext>[] = [
  ...Object.values(FILTER_ATTR_ENTRIES),
  ...COLOUR_ENTRIES,
  ...Object.values(VIEW_TOGGLE_ENTRIES),
  HEALTH_CHECK_ENTRY,
  COMPARE_REVISIONS_ENTRY,
  EARNED_VALUE_ENTRY,
  RESOURCE_HISTOGRAM_ENTRY,
  SHARE_ENTRY,
  ...ADD_KIND_ENTRIES,
  ...LINK_KIND_ENTRIES,
];

/**
 * Whether `entry` is on the bar right now — promoted at this viewport **and** offered at all (its
 * build flag). What every source menu asks before it renders the row: a row is omitted exactly when
 * the bar shows the command, and a flag-off command is on neither, so nothing is both or neither.
 */
export function entryOnBar(
  entry: PromotableEntry<TsldToolbarContext> | undefined,
  ctx: TsldToolbarContext,
): boolean {
  return (
    entry !== undefined && isPromoted(entry.at, ctx.promotion) && (entry.isVisible?.(ctx) ?? true)
  );
}

/** The visibility predicate `derivePromotedItems` is given: the viewport has reached the entry's stage. */
export function reachedStage(
  entry: PromotableEntry<TsldToolbarContext>,
  ctx: TsldToolbarContext,
): boolean {
  return isPromoted(entry.at, ctx.promotion);
}
