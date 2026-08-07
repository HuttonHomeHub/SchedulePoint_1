import type { ActivitySummary, BaselineVarianceRow, DependencySummary } from '@repo/types';

import { formatConstraint } from '@/lib/constraint-format';
import { formatCalendarDate } from '@/lib/format-date';
import { formatFinishVariance } from '@/lib/schedule-format';

/**
 * Pure text builders for the TSLD's parallel accessible representation (ADR-0026 D7, M5). Kept out
 * of the component so the three-tier disclosure — lean per-keystroke name (Tier 1), on-demand
 * summary (Tier 2), and chain navigation — is exhaustively unit-testable with no DOM/React.
 */

/** Pluralise a whole-day count: `1 day`, `3 days`. */
function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'} float`;
}

/**
 * The activity's identity — `{code} {name}` when a code is set, else the name. This is the
 * single source both the on-canvas bar label and the accessible name (`describeActivity`,
 * `chainNeighbour`) build on, so the visible label and the spoken/AT name can never disagree
 * on *which* activity a bar is (WCAG 2.5.3 label-in-name). Kept as a leading substring of both.
 */
export function activityLabel(a: { code: string | null; name: string }): string {
  return a.code ? `${a.code} ${a.name}` : a.name;
}

/**
 * The full on-canvas bar label: the {@link activityLabel} identity plus the working-day
 * duration for a real task (`… · 5d`); a milestone (zero duration) carries the identity only.
 * The duration is supplementary *visual* detail — the identity stays the shared,
 * accessible-name-consistent prefix, so this remains label-in-name-safe.
 */
export function activityBarLabel(a: {
  code: string | null;
  name: string;
  durationDays: number;
}): string {
  const identity = activityLabel(a);
  return a.durationDays > 0 ? `${identity} · ${a.durationDays}d` : identity;
}

/**
 * **Tier 1** — the one lean sentence spoken on every navigation keystroke:
 * `{code name}, {n working days}, {start}–{finish}, lane N, {float|critical}`. The working-day
 * duration is spoken because it is the same datum the on-canvas bar label shows (`· Nd`) and is
 * *not* derivable from the spoken calendar dates — working days skip weekends/holidays (WCAG
 * 1.1.1). Float is added where it informs: `critical` already implies zero float (so just
 * "critical"); `near-critical` states the days; otherwise the plain float; float is omitted when
 * uncomputed (null). A zero-duration milestone carries no duration clause; an unscheduled activity
 * says its duration and that it is not scheduled, nothing more.
 */
export function describeActivity(a: ActivitySummary, opts?: { overlapsInLane?: boolean }): string {
  const name = activityLabel(a);
  const duration =
    a.durationDays > 0
      ? `, ${a.durationDays} working ${a.durationDays === 1 ? 'day' : 'days'}`
      : '';
  if (a.earlyStart === null) return `${name}${duration}, not yet scheduled`;
  const dates =
    a.earlyFinish && a.earlyFinish !== a.earlyStart
      ? `${formatCalendarDate(a.earlyStart)} to ${formatCalendarDate(a.earlyFinish)}`
      : formatCalendarDate(a.earlyStart);
  const floatPart = a.isCritical
    ? ', critical'
    : a.totalFloat === null
      ? ''
      : a.isNearCritical
        ? `, near-critical, ${days(a.totalFloat)}`
        : `, ${days(a.totalFloat)}`;
  // Name a set date constraint so the pin drawn on the canvas has a spoken equivalent (WCAG 1.1.1).
  const constraint = formatConstraint(a);
  const constraintPart = constraint ? `, ${constraint.full}` : '';
  // Visual-Planning conflict cue (ADR-0033): the spoken equivalent of the warning triangle drawn on a
  // bar placed earlier than its earliest feasible start (WCAG 1.1.1). Kept a *separate* read-out from
  // float (SQ-c), since float is a pure-network fact and drift is a placement fact.
  const conflictPart =
    a.visualConflict && a.visualDriftDays !== null
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
      ? `, drift ${days(a.visualDriftDays)} later than its earliest start`
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
  return `${parts.description}${dim}${overAllocated}${parts.baseline ?? ''}${parts.wbsGroup ?? ''}`;
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
  slackByDependencyId?: ReadonlyMap<string, number>,
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
      .filter((x): x is { d: DependencySummary; gap: number } => (x.gap ?? 0) > 0)
      .map(({ d, gap }) => {
        const other = d.successor.id === id ? d.predecessor.name : d.successor.name;
        // Deliberately not the `days()` helper: that one says "float", and a tie's gap is not
        // float — it is the room in this one relationship, which is exactly the distinction the
        // canvas chip makes by sitting on the link rather than on the bar.
        return `${other} ${gap} ${gap === 1 ? 'day' : 'days'}`;
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
