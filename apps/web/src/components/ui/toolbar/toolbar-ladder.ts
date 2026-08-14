/**
 * **The toolbar's degradation ladder** (ADR-0091 M7) — one pure function deciding, for a given
 * width, which commands are labelled, which tier-3 candidates are admitted to the row, and which
 * items demote into the `⋯`.
 *
 * ---
 *
 * ## Why this is a function and not a method on `Toolbar`
 *
 * Until now the decision lived inside `Toolbar.measure`, which reads the DOM — so **jsdom could not
 * reach it at all**: `measure` early-returns at `available <= 0` and every box in jsdom is zero, so
 * ~35 unit suites exercise the *unmeasured default* and nothing in the repository tested the
 * arithmetic itself. Every defect it has shipped was found in a browser, by a person, after release.
 * Extracting the decision makes it testable at the only price that matters: the caller must hand it
 * numbers rather than let it fetch them.
 *
 * ## The termination argument, which is the reason for the shape
 *
 * The old pass was **not a pure function of its inputs**. It read each plain button's *live* width,
 * and a plain button's live width is an **output** — it is wider when labelled. So labelling widened
 * the row, the widened row could not afford labels, and the narrower row could. A constant
 * (`LABEL_CHROME_PX`, over-stated by 8 px per item) was damping that loop rather than removing it,
 * and the damping was itself a defect: it made the projection differ between the two label states by
 * `8 × N` px, so a 72 px band of widths existed on Row 2 in which the row was stable **both** ways.
 *
 * The fix is not a better constant. It is to stop measuring the thing that moves:
 *
 * | quantity                        | how it is obtained | why                                            |
 * | ------------------------------- | ------------------ | ---------------------------------------------- |
 * | a plain button, icon-only       | **derived**        | `px-2`×2 + `size-4` — fixed by the CVA          |
 * | what its label would add        | **derived**        | `gap-1.5` + `measureText`, off the layout tree  |
 * | a `render` item (popover, chip) | measured           | a function of `layout` and `ctx`, never of this |
 *
 * A `render` item's width depends on the density band and the context and on nothing this function
 * decides, so measuring it closes no loop. With plain buttons derived, the pass is
 * `f(available, layout, ctx, static widths) → (labelled, admitted, overflowed)` with **no output on
 * the input side**: idempotent, and the `ResizeObserver` settles in one pass.
 *
 * **The derivation is measured, not assumed** (`docs/specs/workspace-modes/m7-ladder-measurement.md`):
 * every icon-only button on Row 2 renders at exactly **32 px**, and `recalculate` at 119 px against a
 * 32 px icon-only baseline plus an 87 px label — which is `gap-1.5` + `measureText("Recalculate")`.
 *
 * ## The ladder, in the order the product owner asked for it
 *
 * 1. **Labels first, and all of them if they fit.** The label decision is taken before any `⋯` is
 *    reserved, so a row that can be fully labelled is.
 * 2. **Then labels fall one at a time, least-wanted first.** Not the row-level all-or-nothing this
 *    replaces. The order is the **exact reverse of the demotion queue** — one key, not two, or a row
 *    could demote a command into the `⋯` while keeping a label on one it wants less.
 * 3. **Then, and only then, demotion into the `⋯`.**
 * 4. **Admission of tier-3 candidates happens only when nothing demoted** — so it is one-directional:
 *    admission reads the label decision and never the reverse. A `⋯` with nothing left in it does not
 *    render at all, which is what makes the button "hidden unless in use".
 *
 * Both loops `break` on the first refusal rather than `continue`. Best-fit would label a cheap
 * unimportant control while a costlier, more important one stayed icon-only, which reads as a
 * rendering fault rather than as a response to width. `break` makes the labelled set always a
 * **prefix** of importance order: predictable, and testable as such.
 */
import type { ToolbarGroupId } from './toolbar-registry';

/**
 * A plain button's width with no label: `px-2` on both sides plus a `size-4` icon
 * (`toolbar-styles.ts`). Under a coarse pointer the padding is `px-3`.
 */
const BUTTON_PAD_FINE_PX = 16;
const BUTTON_PAD_COARSE_PX = 24;
const ICON_PX = 16;
/** `gap-1.5` — the only width a label adds beyond its own text. */
export const ICON_LABEL_GAP_PX = 6;

/**
 * Headroom charged **per label** before that label may be promoted, and not charged when deciding
 * whether to keep one. That asymmetry is the hysteresis: without it a row sitting exactly on a
 * label's cost flips it on and off as a window edge moves by one pixel.
 *
 * **Per label rather than per row**, because the error it absorbs is per label: each label's cost is
 * a `measureText` estimate against the real rendered box, so a row wearing nine of them carries nine
 * times the uncertainty of a row wearing one.
 */
const LABEL_HYSTERESIS_PX = 24;

/** The same headroom, for admitting a tier-3 candidate — same shape, same reason. */
const ADMISSION_HYSTERESIS_PX = 24;

/** The gap between two adjacent inline children (`gap-1`). */
export const ITEM_GAP_PX = 4;
/** `ml-1` + `border-l` + `pl-2` on every group after the first. */
export const GROUP_RULE_PX = 13;

export function iconOnlyWidth(hasIcon: boolean, coarsePointer: boolean): number {
  return (coarsePointer ? BUTTON_PAD_COARSE_PX : BUTTON_PAD_FINE_PX) + (hasIcon ? ICON_PX : 0);
}

/** One row item, reduced to what the ladder needs to know about it. */
export interface LadderItem {
  id: string;
  group: ToolbarGroupId;
  /** Registry position — the last tie-break, so the order is total. */
  index: number;
  order: number;
  /** Higher survives longer. Defaults to `-order` at the caller (see `priorityOf`). */
  priority: number;
  demotionGroup?: string | undefined;
  /**
   * `true` for a plain `onActivate` button — the only kind that can demote, and the only kind whose
   * width is derived. A `render` item is pinned and measured.
   */
  demotable: boolean;
  /** A demotable item's width with no label; a pinned item's measured width. */
  baseWidth: number;
  /**
   * What labelling this item would add — `gap-1.5` + the measured text. `null` where the item never
   * takes a label (a `render` item, a `showLabel: 'never'` item, or no measuring context).
   */
  labelDelta: number | null;
  /** Resolved from `showLabel` (the band form is already collapsed by the caller). */
  labelPolicy: 'always' | 'auto' | 'never';
}

export interface LadderInput {
  /** The row's own container width — never the band's (see `toolbar-band.tsx`). */
  available: number;
  /**
   * Group rules and named per-item margins the row carries whatever is inline — **excluding the
   * item gaps**, which this function charges itself so that a demotion can credit one back.
   */
  chrome: number;
  /** Tiers 1–2: what the row holds unconditionally. */
  core: LadderItem[];
  /** Tier 3: what the row may admit if there is room. */
  candidates: LadderItem[];
  /** The `⋯` button plus its wrapper, as measured (or a fallback before first paint). */
  overflowWidth: number;
  /**
   * `false` for a row whose width is **its own content** rather than something a container imposes.
   *
   * **On such a row `available` is an output, so demotion is a one-way door.** Demote an item, the
   * row shrink-wraps narrower, and the narrower row can never afford to take it back. Measured, in
   * the browser, on the `shrink-0` mode row: a transient narrow first pass pushed `Diagram` and
   * `Gantt` into the `⋯`, the row collapsed to **37 px holding nothing but that button**, and it
   * stayed there — three journeys failed looking for a view switch that no longer existed. It is the
   * exact feedback loop this module's docblock claims to remove, arriving through the container
   * rather than through item widths, and it only became reachable when plain-button widths stopped
   * reading 0 on the first unlaid-out pass.
   *
   * Labels are still decided normally: the budget left after the base widths is what the current
   * labels occupy, which retains them and promotes nothing.
   */
  allowDemotion?: boolean;
  /** Last pass's answers — read only to give promotion its hysteresis. */
  previouslyLabelled: ReadonlySet<string>;
  previouslyAdmitted: ReadonlySet<string>;
}

export interface LadderResult {
  labelled: Set<string>;
  admitted: Set<string>;
  overflowed: Set<string>;
}

/**
 * Importance order, **most-wanted first**. Shared with the demotion queue by construction: this is
 * that comparator reversed, so the two can never disagree about which command the row values least.
 */
export function byImportance(a: LadderItem, b: LadderItem): number {
  return b.priority - a.priority || a.order - b.order || a.index - b.index;
}

/**
 * How many of `items` (already in importance order) can be afforded, charging `cost` for each and
 * requiring `headroom` on top of every one.
 *
 * Returns a **prefix length**, never a subset — see the class docblock for why `break` beats
 * best-fit here.
 */
function affordablePrefix(
  items: LadderItem[],
  budget: number,
  cost: (item: LadderItem) => number | null,
  headroom: number,
): number {
  let spent = 0;
  let n = 0;
  for (const item of items) {
    const c = cost(item);
    if (c === null) break;
    if (spent + c + headroom > budget) break;
    spent += c;
    n += 1;
  }
  return n;
}

export function computeLadder(input: LadderInput): LadderResult {
  const { available, chrome, core, candidates, overflowWidth } = input;

  const labelled = new Set<string>();
  const admitted = new Set<string>();
  const overflowed = new Set<string>();

  // Everything the row pays before a single optional label or candidate is considered: its chrome,
  // every core item at its unlabelled width, the gaps between them, and the labels it has no choice
  // about (`showLabel: 'always'`, and the band-conditional form the caller has already resolved).
  let budget = available - chrome;
  for (const item of core) {
    budget -= item.baseWidth;
    if (item.labelPolicy === 'always' && item.labelDelta !== null) {
      budget -= item.labelDelta;
      labelled.add(item.id);
    }
  }
  budget -= Math.max(0, core.length - 1) * ITEM_GAP_PX;

  // ── Stage 1 · labels ──────────────────────────────────────────────────────────────────────────
  // Decided before any `⋯` is reserved, which is what makes "everything labelled" the first thing
  // the row tries rather than something it arrives at once the overflow has taken its cut.
  const auto = core.filter((i) => i.labelPolicy === 'auto' && i.labelDelta !== null);
  auto.sort(byImportance);
  const costOfLabel = (item: LadderItem): number | null => item.labelDelta;
  const promote = affordablePrefix(auto, budget, costOfLabel, LABEL_HYSTERESIS_PX);
  const retain = affordablePrefix(auto, budget, costOfLabel, 0);
  const previously = auto.filter((i) => input.previouslyLabelled.has(i.id)).length;
  // Clamp last pass's answer into [promote, retain]: grow only with headroom, shrink only when the
  // labels genuinely no longer fit. `promote <= retain` always, since the same costs are charged
  // with less headroom.
  const keep = Math.min(Math.max(previously, promote), retain);
  for (const item of auto.slice(0, keep)) {
    labelled.add(item.id);
    budget -= item.labelDelta!;
  }

  // ── Stage 2 · demotion ────────────────────────────────────────────────────────────────────────
  // Only if the row is still short after labelling. Note that labels are NOT recomputed afterwards:
  // that would put an output back on the input side, which is the loop this module exists to remove.
  //
  // **The `⋯` is charged BEFORE the shortfall test whenever it is certain to render — not inside
  // the branch that test guards.** A row holding an un-admitted tier-3 candidate renders the button
  // whatever this stage decides, and Stage 3 charges it unconditionally for exactly that reason
  // (see its comment, which also explains why it is not released when the last candidate is
  // admitted). Reserving it only inside `budget < 0` made the test ask *"is this row short without
  // the button it is already painting?"* — so a row that overflowed by less than the button's own
  // width answered **no**, demoted nothing, and laid out past its container.
  //
  // Found by measurement, not by reading (ADR-0094 M0-T1): promoting `next-conflict` to tier 1 put
  // Row 1 **8 px past its 1008 px container at 1024** with `e2e-toolbar-fit` S4 red, and the
  // instrumented ladder input showed it believing it had 13 px spare while paying 41 px for an `⋯`
  // it had never budgeted. The first hypothesis — that the new conflict read-out was the cost —
  // was wrong: giving that read-out a band floor changed the overhang by exactly zero, because the
  // fixture plan has no conflicts and the read-out was never rendering. The 8 px predates this
  // epic; one more tier-1 item is what made it visible.
  const overflowAlreadyRenders = candidates.length > 0;
  if (overflowAlreadyRenders) budget -= overflowWidth;

  if (budget < 0 && input.allowDemotion !== false) {
    // Only when it is not already reserved: a demotion creates the button on a row that had none.
    if (!overflowAlreadyRenders) budget -= overflowWidth;
    const queue = [...core].filter((i) => i.demotable).sort((a, b) => byImportance(b, a));
    const companionsOf = (item: LadderItem): LadderItem[] =>
      item.demotionGroup
        ? core.filter((o) => o.demotionGroup === item.demotionGroup && o.id !== item.id)
        : [];
    for (const item of queue) {
      if (budget >= 0) break;
      if (overflowed.has(item.id)) continue;
      // A `demotionGroup` leaves as one unit, or a two-state segment ends up with one half on the
      // bar and the other in a menu.
      for (const member of [item, ...companionsOf(item)]) {
        if (overflowed.has(member.id)) continue;
        overflowed.add(member.id);
        budget +=
          member.baseWidth + (labelled.has(member.id) ? (member.labelDelta ?? 0) : 0) + ITEM_GAP_PX;
        labelled.delete(member.id);
      }
    }
    // Nothing is admitted on a row that could not hold what it already had.
    for (const c of candidates) overflowed.add(c.id);
    return { labelled, admitted, overflowed };
  }

  // ── Stage 3 · admission ───────────────────────────────────────────────────────────────────────
  // The top of the ladder: a row with room takes its tier-3 commands back out of the menu. Reached
  // only when Stage 2 did nothing, so admission reads the label decision and nothing reads admission.
  if (candidates.length === 0) return { labelled, admitted, overflowed };

  // **Reserved unconditionally, and deliberately not released when the last candidate is admitted.**
  // Releasing it is the circular case: admitting the final candidate empties the `⋯`, which frees
  // the width that would have paid for that admission. Charging it throughout costs the row one
  // narrow band in which the last candidate could have been admitted and is not — a command that
  // stays one click away, which is the direction this whole ladder errs in everywhere else.
  //
  // The charge itself now happens above, before Stage 2's shortfall test, because that test needs
  // it too — see there. This stage's rule is unchanged; only the line that applies it moved.
  const coreGroups = new Set(core.map((i) => i.group));
  const ordered = [...candidates].sort(byImportance);
  for (const candidate of ordered) {
    // A candidate that opens a group the core does not have brings a group rule with it. Charged
    // here rather than folded into `chrome`, because `chrome` must stay derived from the core alone
    // — deriving it from what is admitted would make it downstream of this very decision.
    const opensGroup =
      !coreGroups.has(candidate.group) && !admittedOpens(admitted, ordered, candidate.group);
    const cost =
      candidate.baseWidth +
      (candidate.labelDelta ?? 0) +
      ITEM_GAP_PX +
      (opensGroup ? GROUP_RULE_PX : 0);
    const headroom = input.previouslyAdmitted.has(candidate.id) ? 0 : ADMISSION_HYSTERESIS_PX;
    if (budget - cost < headroom) break;
    budget -= cost;
    admitted.add(candidate.id);
    if (candidate.labelDelta !== null && candidate.labelPolicy !== 'never') {
      labelled.add(candidate.id);
    }
  }
  for (const c of candidates) if (!admitted.has(c.id)) overflowed.add(c.id);
  return { labelled, admitted, overflowed };
}

/** Has an already-admitted candidate opened this group? (Two candidates in one new group pay one rule.) */
function admittedOpens(
  admitted: Set<string>,
  ordered: LadderItem[],
  group: ToolbarGroupId,
): boolean {
  return ordered.some((i) => admitted.has(i.id) && i.group === group);
}
