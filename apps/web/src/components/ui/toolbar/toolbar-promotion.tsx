import type { ReactNode } from 'react';

import type { ToolbarGroupId, ToolbarItem, ToolbarRow } from './toolbar-registry';

/**
 * **Promotion: a command that lives in a menu comes out onto the bar when there is room for it**
 * (toolbar-redesign M5, spec §4.11 — the product owner's requirement that free space be used by
 * items that are hidden in menus).
 *
 * This module is the **pure half**: the stage vocabulary, the `PromotableEntry` record, the one
 * predicate that decides whether an entry is on the bar, and the function that computes the
 * thresholds. No React, no DOM, no measurement — `usePromotionStage` reads the viewport and
 * everything else is arithmetic over a stage number, so the bar and the menu it came out of read the
 * same fact and cannot disagree (the ADR-0065 `routeOrthogonal` argument).
 *
 * **It is not a width ladder** (ADR-0109 D1). Nothing here measures a row. A stage is a committed
 * viewport threshold (`lib/breakpoints.ts`), an entry's stage is a committed constant, and
 * `computePromotionStages` is how those constants were derived and how a test re-derives them — it
 * never runs in the product.
 */

/** Which pointer set the widths and thresholds belong to (ADR-0183: `useCoarsePointer` is the reader). */
export type PromotionPointer = 'fine' | 'coarse';

/** The four viewport thresholds, narrowest first (`PROMOTE_80` … `PROMOTE_160` in `lib/breakpoints.ts`). */
export const PROMOTION_STAGE_NAMES = [
  'PROMOTE_80',
  'PROMOTE_90',
  'PROMOTE_119_5',
  'PROMOTE_160',
] as const;

export type PromotionStageName = (typeof PROMOTION_STAGE_NAMES)[number];

/**
 * How many of the four thresholds the viewport has reached: `0` below the first (nothing promotes —
 * the floor, the scroll line and every jsdom test), `4` at 160 rem and wider.
 */
export type PromotionStage = 0 | 1 | 2 | 3 | 4;

/** What a component asks: the viewport's stage, and which pointer set applies at it. */
export interface PromotionState {
  stage: PromotionStage;
  pointer: PromotionPointer;
}

/** The state of a viewport that has reached no stage — what every test that stubs nothing sees. */
export const NO_PROMOTION: PromotionState = { stage: 0, pointer: 'fine' };

/** The stage an entry is first on the bar at, or `'never'` — the ladder is exhausted for the room. */
export type PromotionThreshold = PromotionStageName | 'never';

/**
 * **`'always'`** is a permanent promotion (Baseline overlay, Resource view, Legend, Minimap): a
 * record the ladder never demotes, whatever the width. Otherwise a threshold **per pointer**, because
 * a finger-sized control is wider and the same command fits at a different stage.
 */
export type PromotionAt = 'always' | Readonly<Record<PromotionPointer, PromotionThreshold>>;

/** Zero-based position of a stage name in the ladder + 1, i.e. the {@link PromotionStage} it is. */
export function stageOf(name: PromotionStageName): PromotionStage {
  return (PROMOTION_STAGE_NAMES.indexOf(name) + 1) as PromotionStage;
}

/** Whether an entry declared with {@link PromotionAt} `at` is on the bar in `state`. */
export function isPromoted(at: PromotionAt, state: PromotionState): boolean {
  if (at === 'always') return true;
  const threshold = at[state.pointer];
  return threshold !== 'never' && state.stage >= stageOf(threshold);
}

/**
 * **A menu entry that can come out onto the bar.** One shape for every source menu (spec §4.11), and
 * only the *promotable* rows become data: the export formats, Go to date, the set-once View settings
 * and each menu's anchor stay hand-written JSX, because they never move.
 *
 * It **derives** a {@link ToolbarItem} ({@link derivePromotedItems}) rather than being one: a menu
 * row is JSX with its own checkbox or radio, and a `ToolbarItem` needs `onActivate` xor `render` and
 * a taxonomy group. The record is the single definition of the command; the bar item and the menu
 * row both read it (through {@link isPromoted}), so two definitions of `onActivate` cannot drift.
 */
export interface PromotableEntry<Ctx> {
  id: string;
  /** The bar's accessible name. For a member of a flat set it carries the set: "Colour by: Total float". */
  label: string;
  /**
   * The text painted on the button, when it is not the whole {@link label}. A set member shows its
   * value ("Total float") under a set caption, and its name carries the set — so WCAG 2.5.3
   * (label in name) holds because the visible text is contained in the name.
   */
  visibleLabel?: string;
  /**
   * The row's name **in the menu it left** — what a reader who learned the menu route heard. Used
   * to recognise "focus was on this entry's menu row" when a resize promotes it from under them
   * (E-1): the menus render this same string, so the match cannot drift.
   */
  menuLabel: string;
  /**
   * A caption printed once before this entry — the set's name over a flat pressed set ("Colour",
   * "Link"). `aria-hidden` and presentational: the accessible names already carry the set, so a
   * screen reader is not read it twice, and a sighted reader gets the cue the members' short
   * visible labels would otherwise lack.
   */
  captionBefore?: string;
  /** The source menu's name in prose — the tooltip says "Also in ‹menu›" and the hand-off says where it went. */
  menuName: string;
  icon: ReactNode;
  /** The id of the source menu's trigger (`ToolbarItem.id`). It is always on the bar, so it is the hand-off target. */
  from: string;
  /** Registry group; defaults to the trigger's. */
  group?: ToolbarGroupId;
  /** Order within the ladder's row, ascending; the derived item sorts at `trigger.order + rank / 100`. */
  rank: number;
  at: PromotionAt;
  /** Present ⇒ a toggle (`aria-pressed`). */
  isActive?: (ctx: Ctx) => boolean;
  /** Which kind of pressed a toggle takes; a kind preset that arms a tool is `'armed'`. */
  activeKind?: 'armed' | 'selected';
  isVisible?: (ctx: Ctx) => boolean;
  isEnabled?: (ctx: Ctx) => boolean;
  disabledReason?: (ctx: Ctx) => string | undefined;
  /** A pen-gated command shades with the rest of the authoring cluster. */
  penGated?: boolean;
  /** Supplementary tooltip clause; absent ⇒ "Also in ‹menuName›". */
  description?: string;
  onActivate: (ctx: Ctx) => void;
}

/** What the derivation needs to know about a source trigger to place the item after it. */
interface TriggerPlacement {
  group: ToolbarGroupId;
  row: ToolbarRow;
  order: number;
}

/**
 * The registry items for every entry — **derived**, never restated. Each takes its trigger's group
 * and row and sorts at `trigger.order + rank / 100`: `resolveItems` sorts by group rank, then
 * `order`, then index, so the item lands immediately after its trigger, and today's orders are
 * integers, so it cannot collide with a neighbour.
 *
 * Throws on an entry whose `from` is not in `items` — a ladder entry that names a trigger which does
 * not exist would otherwise render nowhere and read as "promoted" in the tests.
 */
export function derivePromotedItems<Ctx>(
  entries: readonly PromotableEntry<Ctx>[],
  items: readonly ToolbarItem<Ctx>[],
  visibleAt: (entry: PromotableEntry<Ctx>, ctx: Ctx) => boolean,
): ToolbarItem<Ctx>[] {
  const placements = new Map<string, TriggerPlacement>(
    items.map((item) => [
      item.id,
      { group: item.group, row: item.row ?? 'strip', order: item.order },
    ]),
  );
  return entries.flatMap((entry): ToolbarItem<Ctx>[] => {
    const trigger = placements.get(entry.from);
    if (trigger === undefined) {
      throw new Error(
        `PromotableEntry "${entry.id}": source trigger "${entry.from}" is not registered`,
      );
    }
    const visible = (ctx: Ctx): boolean =>
      visibleAt(entry, ctx) && (entry.isVisible?.(ctx) ?? true);
    const caption: ToolbarItem<Ctx>[] =
      entry.captionBefore === undefined
        ? []
        : [
            {
              id: `${entry.id}-caption`,
              group: entry.group ?? trigger.group,
              row: trigger.row,
              tier: 2,
              // Just before its first member, and after anything the trigger's own order ties with.
              order: trigger.order + entry.rank / 100 - 0.0005,
              label: entry.captionBefore,
              presentational: true,
              isVisible: visible,
              render: (_ctx, api) => (
                <span
                  {...api.itemProps}
                  aria-hidden="true"
                  className="text-muted-foreground inline-flex items-center px-1 text-xs whitespace-nowrap"
                >
                  {entry.captionBefore}
                </span>
              ),
            },
          ];
    return [
      ...caption,
      {
        id: entry.id,
        group: entry.group ?? trigger.group,
        row: trigger.row,
        tier: 2,
        // A promoted item is labelled at every width it exists at: it is on the bar *because* there is room.
        labelVisibility: 'always',
        order: trigger.order + entry.rank / 100,
        label: entry.label,
        ...(entry.visibleLabel === undefined ? {} : { visibleLabel: entry.visibleLabel }),
        description: entry.description ?? `Also in ${entry.menuName}`,
        icon: entry.icon,
        // Where focus goes if the window narrows while it is here (ADR-0135): the trigger, never gone.
        successorId: entry.from,
        lostReason: `Moved into the ${entry.menuName} menu.`,
        ...(entry.penGated ? { penGated: true } : {}),
        isVisible: visible,
        ...(entry.isActive === undefined
          ? {}
          : {
              isActive: entry.isActive,
              // Absent ⇒ `'selected'`, the registry's default: only a modal tool's preset says more.
              ...(entry.activeKind === 'armed' ? { activeKind: 'armed' as const } : {}),
            }),
        ...(entry.isEnabled === undefined ? {} : { isEnabled: entry.isEnabled }),
        ...(entry.disabledReason === undefined ? {} : { disabledReason: entry.disabledReason }),
        onActivate: entry.onActivate,
      },
    ];
  });
}

/** One ladder entry's committed width — `promotion-widths.<pointer>.json`'s `entries[]`. */
export interface PromotionWidthEntry {
  rank: string;
  row: 'look' | 'do';
  width: number;
}

/** The free width of one deck row at one stage: the base state, and with the worst stress state present. */
export interface PromotionFreeWidth {
  freeBase: number;
  freeWorst: number;
}

/** The committed record `computePromotionStages` reads — the shape of `promotion-widths.<pointer>.json`. */
export interface PromotionWidths {
  itemGapPx: number;
  entries: readonly PromotionWidthEntry[];
  /** Ladder order within each row, first promoted first — the product owner's ranking (D-n). */
  ladderOrder: Readonly<Record<'look' | 'do', readonly string[]>>;
  freeWidthByStage: Readonly<
    Record<'look' | 'do', Readonly<Record<PromotionStageName, PromotionFreeWidth>>>
  >;
}

/**
 * **Compute every entry's stage from the committed widths** (spec §4.11, "Thresholds are computed,
 * not judged"). Per deck row, walk the stages narrowest to widest:
 *
 * - **carry every promoted entry forward** — monotonic by construction, so widening a window never
 *   takes anything off the bar;
 * - **reserve the worst stress state**: the room is `freeWorst`, not `freeBase`, so a late-arriving
 *   conflict chip (LOOK) or a peer's pen (DO) cannot wrap a row that the ladder had filled;
 * - **fill the remainder in rank order, skipping an entry that does not fit** — a wide entry early in
 *   the ladder does not block a narrow one behind it.
 *
 * An entry's cost is its width plus the flex gap. **A menu's anchor is never an input**: it is not
 * in `entries`, so it can never be promoted — the function cannot take what it was never given.
 *
 * The result maps rank → stage name, or `'never'` where the ladder is exhausted for the room left.
 */
export function computePromotionStages(
  widths: PromotionWidths,
): Record<string, PromotionThreshold> {
  const result: Record<string, PromotionThreshold> = {};
  const byRank = new Map(widths.entries.map((entry) => [entry.rank, entry]));
  for (const row of ['look', 'do'] as const) {
    const ladder = widths.ladderOrder[row];
    for (const rank of ladder) {
      if (!byRank.has(rank)) throw new Error(`ladderOrder names "${rank}", which has no width`);
      result[rank] = 'never';
    }
    let carried = 0;
    for (const stage of PROMOTION_STAGE_NAMES) {
      let room = widths.freeWidthByStage[row][stage].freeWorst - carried;
      for (const rank of ladder) {
        if (result[rank] !== 'never') continue;
        const cost = (byRank.get(rank)?.width ?? Infinity) + widths.itemGapPx;
        if (cost > room) continue;
        result[rank] = stage;
        room -= cost;
        carried += cost;
      }
    }
  }
  return result;
}
