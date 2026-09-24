import type { ActivitySummary, BaselineVarianceRow, DependencySummary } from '@repo/types';

import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';
import { formatConstraint } from '@/lib/constraint-format';
import { formatCalendarDate } from '@/lib/format-date';
import { formatFinishVariance } from '@/lib/schedule-format';

import type { LinkGap } from './link-gap';

/**
 * Pure text builders for the TSLD's parallel accessible representation (ADR-0026 D7, M5). Kept out
 * of the component so the three-tier disclosure — lean per-keystroke name (Tier 1), on-demand
 * summary (Tier 2), and chain navigation — is exhaustively unit-testable with no DOM/React.
 */

/**
 * Pluralise a whole-day count of float: `1 day float left`, `3 days float left`.
 *
 * **`left` is the label, and it is load-bearing** (M-E-T7). This sentence used to read
 * `3 days float` over `totalFloat`, and now reads over `remainingFloat` — the slack left from
 * where the bar is DRAWN rather than from where the network would put it. On an unplaced activity
 * the two are equal, so the word is the only thing that tells a reader which question the number
 * answered; without it the sentence would silently change meaning the first time somebody places
 * a bar, which is exactly the defect class this register files most often.
 */
function floatDays(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'} float left`;
}

/**
 * Pluralise a whole-day count that is **not** float: `1 day`, `3 days`.
 *
 * **Split out of {@link floatDays} because sharing it had shipped a broken sentence.** The drift
 * clause below read `days(...)`, which appended the word *float*, so a bar placed later than its
 * earliest start announced `drift 2 days float later than its earliest start` — a sentence that
 * names the wrong quantity and does not parse. It shipped that way and M-E-T7 made it worse before
 * anybody noticed, because **nothing in the estate asserts that sentence at all**: it was found by
 * reading the function after a journey failed on a different line.
 */
function plainDays(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/**
 * The activity's identity — `{code} {name}` when a code is set, else the name. This is the
 * single source both the on-canvas bar label and the accessible name (`describeActivity`,
 * `chainNeighbour`) build on, so the visible label and the spoken/AT name can never disagree
 * on *which* activity a bar is (WCAG 2.5.3 label-in-name). Kept as a leading substring of both.
 */
export function activityLabel(a: { code: string | null; name: string }): string {
  // **A code identical to the name is printed once** (`docs/TECH_DEBT.md` #376). The XER importer
  // gives a WBS summary `code = wbs_short_name` and `name = wbs_name ?? wbs_short_name`
  // (`packages/interchange/src/xer-adapter.ts:475-476`), and P6's project-root node commonly holds
  // the project's short name in both — so the label read "EDF - Hynamics Proposal EDF - Hynamics
  // Proposal". The second copy carries nothing, and this string is also the accessible name.
  return a.code && a.code !== a.name ? `${a.code} ${a.name}` : a.name;
}

/**
 * The **centre item** printed under a bar (NetPoint-layout M1, spec §4.6): the working-day duration,
 * followed by the float left when the engine has computed one — `5d · 3d float left` in full,
 * `5d` short. The duration used to ride the name row (`{identity} · 5d`); it moved here so the
 * name row states identity and nothing else.
 *
 * **Null for a milestone.** The item never leaves its own bar, and a milestone has no bar to hold
 * it — its float is spoken in the Tier-1 sentence and drawn by the feasible window.
 *
 * **Null for a WBS summary too** (`docs/TECH_DEBT.md` #375). A summary's dates are an engine rollup
 * of its children (ADR-0038) but its stored duration is not: the importer writes `0`
 * (`xer-adapter.ts:478`) and recalculation never writes a summary's duration back
 * (`apps/api/src/modules/schedule/schedule.repository.ts:840-902`). So the item printed "0d · 0d
 * float left" under a bar spanning eleven months. The honest rolled-up figure needs the span in
 * working days on the right calendar, which the engine would have to write; until it does, the
 * item says nothing rather than something false.
 *
 * "float left" rather than "float" because the figure is `remainingFloat` on the placed basis
 * (ADR-0148): the room from where the bar IS, not from where the network would put it.
 */
export function centreItemText(
  a: {
    durationDays: number;
    remainingFloat: number | null | undefined;
    milestone: boolean;
    summary: boolean;
  },
  form: 'full' | 'short',
): string | null {
  if (a.milestone || a.summary) return null;
  const duration = `${a.durationDays}d`;
  if (form === 'short' || a.remainingFloat == null) return duration;
  return `${duration} · ${a.remainingFloat}d float left`;
}

/**
 * **Tier 1** — the one lean sentence spoken on every navigation keystroke:
 * `{code name}, {n working days}, {start}–{finish}, lane N, {float|critical}`. The working-day
 * duration is spoken because it is the same datum the on-canvas centre item shows (`Nd`) and is
 * *not* derivable from the spoken calendar dates — working days skip weekends/holidays (WCAG
 * 1.1.1). Float is added where it informs: `critical` already implies zero float (so just
 * "critical"); `near-critical` states the days; otherwise the plain float; float is omitted when
 * uncomputed (null). A zero-duration milestone carries no duration clause; an unscheduled activity
 * says its duration and that it is not scheduled, nothing more.
 */
export function describeActivity(
  a: ActivitySummary,
  opts?: { overlapsInLane?: boolean; barDateSource?: BarDateSource },
): string {
  const name = activityLabel(a);
  const duration =
    a.durationDays > 0
      ? `, ${a.durationDays} working ${a.durationDays === 1 ? 'day' : 'days'}`
      : '';
  /**
   * **The spoken dates are the DRAWN dates, through the one shared resolver** — and they were the
   * network's until the M-J gate pass (one-planning-surface), which is a WCAG 1.1.1/1.3.1 failure
   * on the only route ADR-0026 D7 gives an AT user to a bar.
   *
   * Since M-F every bar draws from `visualEffective*` (`barDateSourceFor` returns `'visual'` unless
   * the read-only Late overlay is on), so for any activity carrying a placement the canvas showed
   * one span and this sentence announced another. `floatPart` three lines below was moved to the
   * placed basis at M-E-T7, with a comment explaining why; the dates above it were not — the
   * one-neighbour-and-not-the-other shape, inside the epic's own file.
   *
   * **It resolves through `barDatesFor` rather than reading `visualEffective*` here**, so a second
   * opinion about where a bar is cannot exist: the painter, the Gantt, the print document and this
   * sentence all ask the same function (the ADR-0065 one-implementation argument). That also makes
   * the Late overlay correct for free — while it is on, the bar draws at late dates and so does
   * this.
   *
   * **The caller passes the source.** Defaulting it here would be a second place that decides the
   * basis, which is the defect this fix removes.
   *
   * **And there is deliberately NO fallback to `earlyStart` when the placed date is null**, though
   * that state is reachable: `visual_effective_start` was added with no backfill, so a plan whose
   * last recalculation predates 2026-07-14 has early dates and no placed ones. Such a bar is **not
   * drawn at all** — `to-render-model.ts` passes `barDatesFor`'s answer straight through and
   * `activityRect` returns null for a null start — so "not yet scheduled" is what the picture
   * shows. A fallback here would describe a bar that is not there, which is the disagreement this
   * whole fix removes, pointing the other way.
   *
   * Found independently by the accessibility and UX reviews of M-J-T1. The epic's own widened-hazard
   * census (`m-f/no-placement-parity.md` §5) found the two sibling instances — the CSV export and
   * the guest share view — and structurally could not find this one: its method was "every file that
   * lost a `schedulingMode` reference", and this file never held one to lose.
   */
  const drawn = barDatesFor(a, opts?.barDateSource ?? 'visual');
  if (drawn.start === null) return `${name}${duration}, not yet scheduled`;
  const dates =
    drawn.finish && drawn.finish !== drawn.start
      ? `${formatCalendarDate(drawn.start)} to ${formatCalendarDate(drawn.finish)}`
      : formatCalendarDate(drawn.start);
  // **`remainingFloat`, not `totalFloat`** (M-E-T7). Criticality still comes from the engine's own
  // flags, which are pure-network facts and stay so: an activity is critical because of the
  // network, not because a planner spent its slack. Only the NUMBER moves to the placed basis, and
  // `floatDays()` labels it.
  const floatPart = a.isCritical
    ? ', critical'
    : a.remainingFloat === null
      ? ''
      : a.isNearCritical
        ? `, near-critical, ${floatDays(a.remainingFloat)}`
        : `, ${floatDays(a.remainingFloat)}`;
  // Name a set date constraint so the pin drawn on the canvas has a spoken equivalent (WCAG 1.1.1).
  const constraint = formatConstraint(a);
  const constraintPart = constraint ? `, ${constraint.full}` : '';
  /**
   * The spoken equivalent of the warning triangle drawn on a conflicting bar (WCAG 1.1.1). Kept a
   * *separate* read-out from float (SQ-c), since float is a pure-network fact and drift is a
   * placement fact.
   *
   * **It branches on the REASON, not the boolean** — and it did not until the M-J gate pass, where
   * the accessibility and UX reviews reached the same finding independently. M-D split the flag into
   * two reasons and `visualConflictReason`'s own docblock says to "prefer the reason wherever the
   * sentence matters"; this sentence kept gating on `visualConflict`, which is now true for both,
   * and hard-coded "before its earliest feasible start".
   *
   * **For `LATER_THAN_BOUND` that was backwards, not merely vague.** Drift is
   * `placed − earliest` (`engine/compute.ts:348`), so it is NEGATIVE for an early placement and
   * POSITIVE for one past a ceiling — and `Math.abs()` erased the sign before the word "before" was
   * applied to it. A bar placed five days PAST a "no later than" date was announced as placed five
   * days BEFORE its earliest start, in the same breath as a constraint clause naming the date it had
   * overrun. The one case M-D exists to detect was the one case this described wrongly.
   *
   * The late sentence needs no number: `constraintPart` immediately before it names the bound, and
   * the drift is measured from the earliest start, which is not what was breached. It is written to
   * stand alone anyway, so it stays true if a future reason fires without a constraint clause.
   */
  const conflictPart =
    a.visualConflictReason === 'LATER_THAN_BOUND'
      ? ', conflict: placed past the constraint on it'
      : a.visualConflict && a.visualDriftDays !== null
        ? `, conflict: placed ${Math.abs(a.visualDriftDays)} working ${
            Math.abs(a.visualDriftDays) === 1 ? 'day' : 'days'
          } before its earliest feasible start`
        : '';
  // Same-lane time-overlap cue (TECH_DEBT #24c): the spoken equivalent of the stacked-squares badge
  // on a bar a manual lane drop left overlapping another in its lane (WCAG 1.1.1). Derived (not a
  // persisted field), so the caller passes it — computed at the mapping seam (`laneOverlapIds`).
  const overlapPart = opts?.overlapsInLane ? ', overlaps another activity in its lane' : '';
  // POSITIVE drift — placed LATER than the pure-network early start (ADR-0054 §4). This is the
  // ordinary Visual-mode case and the one the left-hand drift tail actually draws for, yet it had
  // no spoken form at all: `conflictPart` above covers only the opposite, rarer sign (placed
  // *earlier* than feasible), so the common case was a new visual mark with no text alternative
  // (WCAG 1.1.1). Stated separately from float for the same reason the conflict clause is —
  // float is a pure-network fact, drift is a placement fact.
  const driftPart =
    !a.visualConflict && a.visualDriftDays !== null && a.visualDriftDays > 0
      ? `, drift ${plainDays(a.visualDriftDays)} later than its earliest start`
      : '';
  return `${name}${duration}, ${dates}, lane ${a.laneIndex + 1}${floatPart}${constraintPart}${conflictPart}${driftPart}${overlapPart}`;
}

// ── Lens marks: the listbox row's text equivalents for what the canvas is currently drawing ──────
//
// These are deliberately NOT part of `describeActivity`. That function speaks properties of the
// *activity* (duration, dates, lane, float, constraint, drift); a colour lens's group and a baseline
// overlay's ghost are properties of **what is on screen right now**, which is why the pre-existing
// marks (`filtered out`, `off the logic path`, `over-allocated`) are already composed at the row and
// not here. It also protects the memo: `optionDescriptions` is keyed on the activities alone
// precisely because re-running `describeActivity` per render measured ~1.3 s at 2,000 activities, and
// threading lens state into it would rebuild every row on every lens change for no benefit.

/**
 * The spoken equivalent of the **Colour by WBS group** lens (WCAG 1.4.1 — the lens conveys membership
 * by fill alone). `(group: {label})` when the activity is filed under a group the plan holds;
 * `(ungrouped)` when it is top-level; **nothing** for a summary, which *is* a group rather than an
 * activity missing one.
 *
 * An activity whose `parentId` names a row that is not present is an orphan and reads as ungrouped —
 * the same resolution `features/wbs/model/wbs-groups.ts` and the Gantt row model use, applied here by
 * a plain lookup miss in {@link wbsGroupLabelById}'s map rather than by a second rule.
 */
export function wbsGroupClause(
  activity: Pick<ActivitySummary, 'parentId' | 'type'>,
  labelById: ReadonlyMap<string, string>,
): string {
  const label = activity.parentId === null ? undefined : labelById.get(activity.parentId);
  if (label !== undefined) return ` (group: ${label})`;
  return activity.type === 'WBS_SUMMARY' ? '' : ' (ungrouped)';
}

/**
 * The spoken equivalent of a **baseline ghost bar** (WCAG 1.4.1 — the ghost is an outline and nothing
 * else): the captured span, plus the finish variance in working days. The direction word comes from
 * the variance table's own {@link formatFinishVariance}, so "behind"/"ahead" cannot come to mean the
 * opposite here from what the table shows; only the phrasing is speech-shaped (`5 working days
 * behind` rather than the table's `5 d behind`).
 *
 * Deliberately the finish variance **only**, not every variance column — a row read on every arrow
 * keystroke has to stay short enough to listen to.
 *
 * Returns `''` where there is no ghost to describe, which is the same test `buildBaselineGhosts`
 * applies: absence is not narrated. When the Late overlay is also on the live bars follow the late
 * dates, so the clause qualifies the comparison exactly as the legend does (`TsldLegend`).
 */
export function baselineGhostClause(
  row: BaselineVarianceRow,
  opts?: { lateView?: boolean },
): string {
  if (row.removed || row.baselineStart === null || row.baselineFinish === null) return '';
  const span =
    row.baselineFinish !== row.baselineStart
      ? `${formatCalendarDate(row.baselineStart)} to ${formatCalendarDate(row.baselineFinish)}`
      : formatCalendarDate(row.baselineStart);
  const view = opts?.lateView === true ? ' vs the late view' : '';
  const { tone } = formatFinishVariance(row);
  const days = row.finishVarianceDays;
  const variance =
    tone === 'onTrack'
      ? ', finish on baseline'
      : (tone === 'behind' || tone === 'ahead') && days !== null
        ? `, finish ${Math.abs(days)} working ${Math.abs(days) === 1 ? 'day' : 'days'} ${tone}`
        : '';
  return ` (baseline ${span}${view}${variance})`;
}

/**
 * The spoken equivalent of the revision-comparison change picture (ADR-0127) — a list of the work
 * the overlay draws that a screen-reader user has **no other route to**.
 *
 * The canvas is `aria-hidden` and its parallel listbox is built from the plan's LIVE activities
 * (ADR-0063), so a removed activity has no row there and no bar to focus: the picture would say
 * something to a sighted planner that it says to nobody else (WCAG 1.4.1). Activities that merely
 * MOVED are already reachable — their live row exists and gains a clause — so only removals are
 * listed here.
 *
 * **Returns the sentences and not the markup**, so the one caller decides where they live: inside
 * the diagram region, because a landmark-navigating reader lands INSIDE a region and never passes
 * a preceding sibling (ADR-0122 D2).
 *
 * `undrawable` is stated rather than dropped: a diagram has no "showing N of M", so a picture
 * quietly missing rows is unnoticeable — see `RevisionCompare.ghostsUndrawable`.
 */
export function compareOverlaySummary(
  ghosts: readonly { activityId: string; name: string; removed: boolean }[],
  undrawable: number,
  /**
   * The changed-link counts. Stated as a NUMBER and never as a list of links, because a link is not
   * a selectable object in this product and there is no listbox of edges — inventing one would
   * invent an interaction no other surface offers (spec §4.8, ADR-0122). The sentence points at the
   * change list, which carries every logic change in words.
   */
  links: { readonly drawn: number; readonly undrawable: number } = { drawn: 0, undrawable: 0 },
  /**
   * **Why a changed bar could not be drawn, and it is NOT the same reason in both comparisons.**
   *
   * Same-plan (`'NOT_RECORDED'`, the default) the old side genuinely did not record a position: a
   * baseline captured before the snapshot extension has no lane, and no backfill is possible.
   *
   * Cross-plan (`'NOT_COMPARABLE'`) the other plan **did** record it — the position simply does not
   * mean anything here, because two independently imported plans derive their lane order
   * separately (one may be packed by time and the other still in source order), so the index names
   * a different row in each. Reusing the same-plan sentence would state something FALSE about the
   * other plan's data, and it is the likeliest defect in this milestone precisely because the
   * mechanism is correct and reusing it feels like reuse.
   *
   * One function with one discriminator, never two call sites: two sentences maintained apart is
   * how one comes to be edited and the other not.
   */
  undrawableReason: 'NOT_RECORDED' | 'NOT_COMPARABLE' = 'NOT_RECORDED',
): {
  readonly heading: string;
  /**
   * The removed activities, **each with its id** (`docs/TECH_DEBT.md` #255 item 6).
   *
   * This was `readonly string[]` and the consumer rendered `key={name}`, so two removed activities
   * sharing a name produced a duplicate React key — React treats them as one row and drops the
   * second from the list a screen-reader user is given, in the one channel with no way to check.
   * It is reachable rather than theoretical: nothing makes an activity name unique here, only
   * `code` carries a per-plan unique index, and two removed "Excavate" rows are what a re-sequenced
   * programme produces.
   *
   * The **name** is still what a reader hears; the id is a key and never copy.
   */
  readonly removed: readonly { readonly activityId: string; readonly name: string }[];
  /** How many changed things the picture could not draw — bars plus links. */
  readonly undrawn: number;
  /** The VISIBLE sentence for that count. Empty when there is nothing withheld. */
  readonly undrawnLabel: string;
} | null {
  if (ghosts.length === 0 && undrawable === 0 && links.drawn === 0 && links.undrawable === 0) {
    return null;
  }
  const removed = ghosts
    .filter((g) => g.removed)
    .map((g) => ({ activityId: g.activityId, name: g.name }));
  const moved = ghosts.length - removed.length;
  const parts: string[] = [];
  if (moved > 0) parts.push(`${String(moved)} moved`);
  if (removed.length > 0) parts.push(`${String(removed.length)} removed`);
  if (undrawable > 0) {
    // Never "0 undrawable" and never silence: the reader is told the picture is incomplete AND why,
    // because both reasons are facts about the data rather than faults they can act on. The
    // cross-plan wording points at the change list, which carries the same work in words — where a
    // lane index is irrelevant and nothing is lost.
    parts.push(
      undrawableReason === 'NOT_COMPARABLE'
        ? `${String(undrawable)} not shown because the two plans lay their activities out ` +
            `independently, so there is no matching row to draw them on — they are listed under Changes`
        : `${String(undrawable)} not shown because the old revision did not record where they were`,
    );
  }
  if (links.drawn > 0) {
    parts.push(`${String(links.drawn)} changed ${links.drawn === 1 ? 'link' : 'links'}`);
  }
  if (links.undrawable > 0) {
    parts.push(
      `${String(links.undrawable)} changed ${links.undrawable === 1 ? 'link' : 'links'} not shown ` +
        `because an activity they joined is no longer in the plan`,
    );
  }
  const logic =
    links.drawn > 0 || links.undrawable > 0
      ? ' Logic changes are listed in words under Changes.'
      : '';
  const undrawn = undrawable + links.undrawable;
  return {
    heading: `Comparison overlay: ${parts.join(', ')}.${logic}`,
    removed,
    undrawn,
    // One sentence for both kinds, because the reader's question is "is this picture complete?"
    // and the answer is no for the same reason in both cases: the old side did not record enough
    // to place the thing. Never rendered as "0 not shown" — see the caller's guard.
    undrawnLabel:
      undrawn === 0
        ? ''
        : `${String(undrawn)} ${undrawn === 1 ? 'change is' : 'changes are'} not shown — the ` +
          `earlier revision did not record where they were.`,
  };
}

/** The parts of one parallel-listbox row, in the order they are spoken. */
export interface ListboxRowParts {
  /** The memoised Tier-1 sentence ({@link describeActivity}). */
  description: string;
  /** Why the bar is dimmed — filter, isolate, float path. Reading order, fixed by the caller. */
  dimReasons?: readonly string[];
  overAllocated?: boolean;
  /** {@link baselineGhostClause} for this row, when the overlay draws it a ghost. */
  baseline?: string | undefined;
  /** {@link wbsGroupClause} for this row, when the WBS colour lens is the active mode. */
  wbsGroup?: string | undefined;
  /** {@link compareClause} for this row, when the comparison overlay draws it a ghost. */
  compare?: string | undefined;
  /** {@link levelledGhostClause} for this row, when the levelled lens draws it a ghost. */
  levelled?: string | undefined;
}

/**
 * The spoken twin of ONE compare ghost — where this activity was in the earlier revision.
 *
 * The sibling of {@link baselineGhostClause}, and it exists for the identical reason: the canvas is
 * `aria-hidden`, so a dashed outline saying "this bar used to be here" reaches a sighted planner
 * and nobody else (WCAG 1.4.1). ADR-0127 D6 asserted that a changed activity "already has a route,
 * it is an option in the parallel listbox" — true about the ROW existing and silent about the
 * comparison, which is a different claim; the M8 accessibility review caught the gap, and the
 * epic's own plan had called this clause "real work, and it is not optional".
 *
 * Returns `''` where the overlay draws no ghost for the row — absence is not narrated — which is
 * the same test the painter applies, because both walk the same gated array.
 */
export function compareClause(ghost: { fromStart: string; fromFinish: string }): string {
  const span =
    ghost.fromFinish !== ghost.fromStart
      ? `${formatCalendarDate(ghost.fromStart)} to ${formatCalendarDate(ghost.fromFinish)}`
      : formatCalendarDate(ghost.fromStart);
  return ` (earlier revision ${span})`;
}

/**
 * What the **levelled-placement lens** is showing — including, and especially, when it is showing
 * nothing (M-E-T6).
 *
 * **The undrawn case is the COMMON one, not an edge case.** FC-1 predicts zero visual placements
 * across the estate, and resource levelling is opt-in and off by default (ADR-0041's parity gate),
 * so on the day this ships the lens lights and draws nothing on very nearly every plan there is. A
 * control that lights and does nothing is the lit-but-inert dead end this register has recorded
 * five times; the difference between that and a working feature is one sentence.
 *
 * **Two empty states, never collapsed into one**, which is ADR-0073 C1's finding applied to a
 * diagram: "levelling never ran" and "levelling ran and moved nothing" are different facts, the
 * first naming a setting a planner can change and the second reporting a result. A reader given
 * one sentence for both cannot tell a switched-off feature from a satisfied one. The control's
 * shaded reason covers only the first (M-E-T3), because the other two states are not refusals —
 * so this sentence is the ONLY place the second is ever said.
 *
 * Returns the sentences and not the markup: the caller decides where they live, and both the
 * visible strip and the `sr-only` summary render from this one result, so the picture cannot be
 * explained two ways.
 */
export function levelledOverlaySummary(
  drawn: number,
  opts: { levelResources: boolean },
): { readonly heading: string; readonly undrawnLabel: string } | null {
  if (drawn > 0) {
    return {
      heading: `Levelled placement: ${String(drawn)} ${drawn === 1 ? 'activity' : 'activities'} moved by resource levelling.`,
      // Nothing is withheld — every activity levelling moved has a ghost, because the layer walks
      // the same array this count comes from.
      undrawnLabel: '',
    };
  }
  const why = opts.levelResources
    ? 'resource levelling did not move any activity'
    : 'resource levelling is off for this plan';
  return {
    heading: `Levelled placement: nothing to show — ${why}.`,
    undrawnLabel: `Levelled placement: ${why}.`,
  };
}

/**
 * The spoken equivalent of a **levelled-placement ghost** (WCAG 1.4.1 — the ghost is a dashed
 * outline and nothing else): where resource levelling moved this activity to.
 *
 * The third sibling of {@link baselineGhostClause} and {@link compareClause}, and it exists for
 * their identical reason: the canvas is `aria-hidden`, so an outline saying "levelling would put
 * this here" reaches a sighted planner and nobody else.
 *
 * **It states the ghost's START DATE rather than an offset, which is a deliberate departure from
 * both siblings.** The tempting field is `levelingDelayDays` — engine-owned, already in whole
 * working days, sitting on the same row — and it is `leveledStart - earlyStart`, while the bar is
 * drawn at the PLACED start. On an unplaced activity the two coincide, which is every plan in the
 * estate today (FC-1); on a placed one — the case this epic exists to create — it would report an
 * offset from a position the reader cannot see. Computing the true offset needs a working-day walk
 * a pure render leaf has no business doing, so the honest short answer is the date, which is exact
 * in every case.
 *
 * **This is the ONLY clause the two M-E overlays need, and that was found by driving the product.**
 * It began as one member describing both — the feasible window and this ghost — on the reasoning
 * that the row's length is a budget and both describe where a bar may sit. The journey's first run
 * printed the row, and the window's half was redundant to the last word: the Tier-1 sentence
 * already states the remaining float (M-E-T7), already names a positive drift, and already names
 * the negative-drift conflict. The window DRAWS two facts the sentence carries; it does not add a
 * third. Two unit suites cannot see that, because each is right about its own function — only a
 * reader looking at the finished sentence can (ADR-0081, `m-e/window.md` §11).
 *
 * Returns `''` where the overlay draws no ghost for the row — absence is not narrated — which is
 * the same test the painter applies, because both walk the same gated array.
 */
export function levelledGhostClause(leveledStart: string | null): string {
  return leveledStart === null ? '' : ` (levelled to ${formatCalendarDate(leveledStart)})`;
}

/**
 * Compose one listbox row's text. The **only** producer of it: both the rendered `<li>` and the
 * sentence `select()` announces go through here.
 *
 * That is the point of the helper rather than a tidy-up. Selection used to announce the Tier-1
 * sentence alone while the row it named carried that string *plus* the dim reasons and the
 * over-allocation mark — so selecting a filtered-out bar spoke a sentence the visible list did not
 * contain, and the two could only be compared by someone reading the list and listening at once.
 */
export function composeListboxRowText(parts: ListboxRowParts): string {
  const reasons = parts.dimReasons ?? [];
  const dim = reasons.length > 0 ? ` (${reasons.join(', ')})` : '';
  const overAllocated = parts.overAllocated === true ? ' (over-allocated)' : '';
  return `${parts.description}${dim}${overAllocated}${parts.baseline ?? ''}${parts.wbsGroup ?? ''}${parts.compare ?? ''}${parts.levelled ?? ''}`;
}

/**
 * The spoken form of a tie's type + lag — the accessible equivalent of the time-true anchor
 * offset the canvas draws (ADR-0052; WCAG 1.1.1): `FS` for a zero-lag tie, `SS + 3 working days`
 * for a lag, `FS - 1 working day` for a lead. A `TWENTY_FOUR_HOUR` lag is elapsed time, not
 * working time (ADR-0036 §6), and says so — the offset drawn on the canvas means the same thing.
 */
export function lagPhrase(
  tie: Pick<DependencySummary, 'type' | 'lagDays' | 'lagCalendar'>,
): string {
  if (tie.lagDays === 0) return tie.type;
  const n = Math.abs(tie.lagDays);
  const unit = tie.lagCalendar === 'TWENTY_FOUR_HOUR' ? 'elapsed' : 'working';
  return `${tie.type} ${tie.lagDays > 0 ? '+' : '-'} ${n} ${unit} ${n === 1 ? 'day' : 'days'}`;
}

/**
 * **Tier 2** — the on-demand (`Space`) detail: how many logic ties the activity has and which are
 * driving. `start driven by {name}` names the binding predecessor (the driving edge into it);
 * `drives {names}` names the successors whose start it drives. Derived purely from `dependencies`.
 * A lagged driving tie appends its {@link lagPhrase} (the spoken twin of the time-true anchor
 * offset, ADR-0052); a zero-lag tie adds nothing, keeping today's sentences verbatim.
 */
export function summarizeLogic(
  id: string,
  dependencies: readonly DependencySummary[],
  /**
   * Per-tie slack in whole days, keyed by dependency id (ADR-0054 §5) — the spoken equivalent of
   * the `Nd` chip the canvas draws on the selected activity's links. Without it that number is
   * sighted-pointer-only and cannot be inferred (deriving it means subtracting two dates and a
   * lag by hand), which is a WCAG 1.1.1 gap. Absent ⇒ the sentence is exactly as before.
   */
  slackByDependencyId?: ReadonlyMap<string, LinkGap>,
): string {
  const preds = dependencies.filter((d) => d.successor.id === id);
  const succs = dependencies.filter((d) => d.predecessor.id === id);
  const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const lagSuffix = (d: DependencySummary): string => (d.lagDays === 0 ? '' : ` (${lagPhrase(d)})`);
  let text = `${count(preds.length, 'predecessor')}, ${count(succs.length, 'successor')}`;
  const drivenBy = preds.find((d) => d.isDriving);
  if (drivenBy) text += `; start driven by ${drivenBy.predecessor.name}${lagSuffix(drivenBy)}`;
  const drives = succs.filter((d) => d.isDriving).map((d) => `${d.successor.name}${lagSuffix(d)}`);
  if (drives.length > 0) text += `; drives ${drives.join(', ')}`;
  // Only non-binding ties carry slack worth naming: a driving edge's gap is 0 by definition, and
  // it is already reported above as the driver.
  if (slackByDependencyId && slackByDependencyId.size > 0) {
    const waits = [...preds, ...succs]
      .filter((d) => !d.isDriving)
      .map((d) => ({ d, gap: slackByDependencyId.get(d.id) }))
      .filter((x): x is { d: DependencySummary; gap: LinkGap } => (x.gap?.days ?? 0) > 0)
      .map(({ d, gap }) => {
        const other = d.successor.id === id ? d.predecessor.name : d.successor.name;
        // Deliberately not the float helper: that one says "float", and a tie's gap is not
        // float — it is the room in this one relationship, which is exactly the distinction the
        // canvas chip makes by sitting on the link rather than on the bar.
        //
        // **This site avoided the trap and the drift clause above did not**, under the same shared
        // helper, which is why `plainDays` now exists: the correct reasoning was written down here
        // and never applied one function over.
        // In the unit the gap label prints (NetPoint grammar M3-T2): "3 working days", or "12
        // calendar days" where no calendar is loaded and the label reads `12 cal d`.
        const unit = gap.unit === 'working' ? 'working' : 'calendar';
        return `${other} ${gap.days} ${unit} ${gap.days === 1 ? 'day' : 'days'}`;
      });
    if (waits.length > 0) text += `; slack to ${waits.join(', ')}`;
  }
  return text;
}

export interface ChainNeighbour {
  id: string;
  name: string;
  /** Whether the tie to this neighbour is the driving edge. */
  driving: boolean;
}

/**
 * Driving-first chain navigation (`[` predecessor, `]` successor). Among the focused activity's
 * ties in the given direction, prefer the **driving** edge — the binding tie a planner traces up
 * (or down) the driving/critical path — falling back to the first tie in list order. Returns null
 * when there is no tie in that direction. Repeated presses walk the path, since selection follows.
 */
export function chainNeighbour(
  focusedId: string,
  dependencies: readonly DependencySummary[],
  direction: 'pred' | 'succ',
): ChainNeighbour | null {
  const edges = dependencies.filter((d) =>
    direction === 'pred' ? d.successor.id === focusedId : d.predecessor.id === focusedId,
  );
  if (edges.length === 0) return null;
  const chosen = edges.find((d) => d.isDriving) ?? edges[0]!;
  const endpoint = direction === 'pred' ? chosen.predecessor : chosen.successor;
  // Same identity builder as Tier-1 describeActivity, so the neighbour reads consistently.
  const name = activityLabel(endpoint);
  return { id: endpoint.id, name, driving: chosen.isDriving };
}

/** The spoken line for a chain-nav jump: names the neighbour and whether the tie drives. */
export function announceChainStep(
  direction: 'pred' | 'succ',
  neighbour: ChainNeighbour | null,
): string {
  const label = direction === 'pred' ? 'Predecessor' : 'Successor';
  if (!neighbour) return direction === 'pred' ? 'No predecessors.' : 'No successors.';
  return `${label}: ${neighbour.name}${neighbour.driving ? ', driving' : ''}.`;
}
