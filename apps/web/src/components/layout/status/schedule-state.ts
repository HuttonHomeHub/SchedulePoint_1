/**
 * The plan's schedule state — **pure, and deliberately in a file of its own** (M2-T1).
 *
 * Extracted from `plan-status-bar.tsx` unchanged so that `PlanFacts` and `PlanStatusBar` can both
 * import it without one importing the other. It was already the separately-tested part: it became a
 * pure function in the first place because a defect hid inside a component that derived this inline
 * and could not be tested (`deriveScheduleState`'s own history).
 *
 * Nothing here is edited. `data-schedule-state` is a journey contract, so the values
 * {@link scheduleStateAttr} publishes are what they were.
 */
/**
 * What the plan's schedule owes its reader — three states, and Recalculate is attached to the one
 * that has a remedy (M3-T5).
 *
 * **Recalculate used to be a command on the toolbar, offered at every moment of every session.**
 * Auto-recalculation has fired on every structural edit since ADR-0032 M3, so on a healthy plan
 * that button did nothing a planner needed: it re-ran a calculation that had already run. It was a
 * button pretending to be a status, which is `design.md` §3's own phrase for what this bar exists
 * to fix. It now appears only where it can change something.
 *
 * The states are deliberately three rather than five. `no data date` is NOT one of them, because
 * the bar already carries `Data date · Not set` two facts to the left and a second sentence saying
 * the same thing in other words is the kind of redundancy a reader learns to skip. It arrives
 * instead as a {@link ScheduleState.refusal} on the stale state, where it is actionable — attached
 * to the control it explains rather than floating beside it.
 */
export type ScheduleState =
  /** Everything a planner has done is in the computed dates. **Renders nothing at all.** */
  | { kind: 'current' }
  /**
   * **The client does not yet know.** The schedule summary has not arrived, so whether the plan has
   * ever been calculated is unanswerable — and answering it anyway is what this kind exists to stop.
   *
   * Without it the derivation fell through to `current`, so the bar PUBLISHED "up to date" during a
   * window in which it was displaying `…` for every fact beside it: honest on screen and not on
   * `data-schedule-state`. A journey read that attribute, pressed nothing, and asserted success
   * while nothing had been computed — a green assertion proving the opposite of its name.
   *
   * Renders nothing, like `current`, because the facts already say `…`. It exists to be
   * distinguishable, not to be seen.
   */
  | { kind: 'pending' }
  /** A recalculation is in flight. */
  | { kind: 'recalculating' }
  /**
   * The computed dates are behind the plan, and the reader can see how far.
   *
   * `edits` is a count rather than a flag for the reason `PlanAutoRecalc.pendingEdits` is: "1 edit"
   * and "an afternoon of re-sequencing" are different facts and a reader acts on them differently.
   * `failed` distinguishes *nobody has calculated this yet* from *calculating it did not work* —
   * two states that look identical from the dates alone and want different sentences.
   *
   * `refusal`, when non-null, is why the reader may not recalculate: the pen, their role, or a
   * missing data date. The control is **shaded with the reason, never hidden** (ADR-0082) — a
   * planner who has just made an edit and cannot compute it is exactly the reader who needs to be
   * told which of the three it is.
   */
  | { kind: 'stale'; edits: number; failed: boolean; refusal: string | null };

/**
 * A stable hook for the journeys, in this repository's established shape (`data-toolbar-item`,
 * `data-plan-identity`, `data-tool-rail`).
 *
 * It exists because the three states are **not** all distinguishable by asking what is on screen:
 * `current` renders nothing, and "renders nothing" is indistinguishable from "has not painted yet"
 * by any point-in-time read — the trap `revealToolbarCommand`'s docblock records hitting on a slow
 * machine. An attribute that is always present turns a race into a wait.
 */
export function scheduleStateAttr(state: ScheduleState): string {
  return state.kind;
}

/**
 * Derive {@link ScheduleState} from the four things that decide it.
 *
 * **Pure, exported and separately tested, because the bug was HERE and nothing could see it.** This
 * was a `useMemo` inside `plan-workspace-toolbar.tsx` — a 1,600-line component whose own suite
 * mounts it and reads the DOM — so the mapping had no test of its own, and removing the
 * `pending` guard changed nothing in that suite while breaking a journey. A rule that decides what a
 * control publishes should be checkable in isolation rather than through a mounted workspace.
 *
 * The ORDER of these tests is the decision:
 *
 * 1. `recalculating` outranks everything: a run in flight is about to answer the question, and
 *    telling a planner the plan is behind while the request that fixes it is on the wire is true for
 *    a few hundred milliseconds and useless for all of them.
 * 2. `pending` — the summary has not arrived, so whether the plan has ever been calculated is
 *    unanswerable. A failure or an outstanding edit still outranks it, because both are facts THIS
 *    tab owns and neither needs the server to confirm them.
 * 3. `current` requires the summary to be present AND to show a computed finish.
 * 4. Everything else is `stale`, with the refusal derived from the same three terms
 *    `usePlanAutoRecalc`'s own `enabled` predicate uses, in the same order, so the sentence cannot
 *    disagree with the behaviour. `CANVAS_AUTHORING` is that predicate's fourth term and is
 *    deliberately absent: it is on in every published image (ADR-0088 D1), so a sentence about it
 *    could never reach a reader.
 */
export function deriveScheduleState({
  isRecalculating,
  pendingEdits,
  failed,
  activities,
  canRecalculate,
  refusalReason,
  hasDataDate,
}: {
  isRecalculating: boolean;
  pendingEdits: number;
  failed: boolean;
  /**
   * The plan's activities **as the client holds them**, or `undefined` while that query is
   * unresolved.
   *
   * **Deliberately NOT the schedule summary, and that distinction is the defect this parameter
   * fixes.** The first version asked the summary for `activityCount` and `projectFinish` — and the
   * summary query is invalidated by a **recalculation**, not by an edit. So on a plan whose
   * summary was fetched while it was empty, adding two activities left `activityCount` at 0
   * forever: `neverCalculated` was false, the state was `current`, and `e2e-toolbar` opened a
   * diagram with no bars while the status bar said the schedule was up to date. The bar's own
   * `Finish` fact read `Not calculated` at the same moment, from the same stale summary — the two
   * halves disagreeing in one row.
   *
   * These rows are what the reader is looking at, so no cache can go stale relative to the screen.
   */
  activities: readonly { earlyStart: string | null }[] | undefined;
  canRecalculate: boolean;
  /** Why not, when `canRecalculate` is false. */
  refusalReason: string | null;
  hasDataDate: boolean;
}): ScheduleState {
  if (isRecalculating) return { kind: 'recalculating' };
  if (activities === undefined && !failed && pendingEdits === 0) return { kind: 'pending' };
  /**
   * **The case a first-time reader meets, and the one a client-side EDIT COUNTER structurally
   * cannot see.** A plan whose activities all lack an `earlyStart` has never been computed —
   * imported, seeded, or built in somebody else's session. The edit counter only knows what THIS
   * tab did, which is why the rows are consulted as well.
   *
   * Guarded on a non-empty list because an empty plan has no dates either, and offering to
   * calculate nothing is the do-nothing control this whole change removes.
   */
  const neverCalculated =
    activities !== undefined &&
    activities.length > 0 &&
    !activities.some((activity) => activity.earlyStart !== null);
  if (!failed && pendingEdits === 0 && !neverCalculated) return { kind: 'current' };
  const refusal = !canRecalculate
    ? (refusalReason ?? 'The schedule cannot be recalculated.')
    : hasDataDate
      ? null
      : 'Set a data date before the schedule can be calculated.';
  return { kind: 'stale', edits: pendingEdits, failed, refusal };
}
