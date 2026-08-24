import { CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { formatCalendarDate } from '@/lib/format-date';

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
 * The plan **status bar** — grid row 3 (ADR-0099 D5, Graphite M7).
 *
 * ## Facts, and what that word decides
 *
 * `design.md` §3 gives this surface one job: *"Facts only. **Recalculate stops being a button
 * pretending to be a status**"*. That is the discriminator for everything here. A fact is a
 * property of the plan a reader looks at; a command is something they do to it. The critical
 * **count** is a fact and lives here; **Next conflict**, which walks them, is a command and stays
 * on the strip (ADR-0093's rule, one row down).
 *
 * ## Announcements: none, deliberately
 *
 * `plan.md` §A14 predicted the failure this avoids. `announcer.tsx` is a **single shared app-wide
 * polite region** that clears-then-sets on an animation frame, so wiring five facts to it means one
 * recalculation — which changes finish, critical count and the run state together — drops at least
 * one message silently, and the reader cannot tell which.
 *
 * So this component announces **nothing**. Everything on it is a fact a reader can look at, and the
 * one transition that needs proactive notice — a recalculation finishing — is already announced
 * once, by the thing that started it. A second announcement from here would be the race §A14
 * describes, not extra service.
 */
export function PlanStatusBar({
  activityCount,
  criticalCount,
  dataDate,
  projectFinish,
  scheduleState,
  onRecalculate,
  pending,
}: {
  activityCount: number | undefined;
  criticalCount: number | undefined;
  dataDate: string | null | undefined;
  projectFinish: string | null | undefined;
  /** What the schedule owes the reader — see {@link ScheduleState}. */
  scheduleState: ScheduleState;
  /** Run a recalculation now. Called only from the `stale` state with no refusal. */
  onRecalculate: () => void;
  /** The summary has not arrived. Distinct from "arrived and empty", which is a real answer. */
  pending: boolean;
}): React.ReactElement {
  return (
    <div
      data-schedule-state={scheduleStateAttr(scheduleState)}
      className="text-muted-foreground flex h-6 shrink-0 items-center gap-4 px-3 text-xs"
    >
      <Fact label="Activities" value={pending ? '…' : (activityCount ?? 0).toString()} />
      <Fact
        label="Data date"
        value={pending ? '…' : dataDate ? formatCalendarDate(dataDate) : 'Not set'}
      />
      <Fact
        label="Finish"
        value={
          pending
            ? '…'
            : projectFinish
              ? formatCalendarDate(projectFinish)
              : // **Not an em dash.** A plan that has never been calculated has no finish, and a
                // dash reads as a value the reader failed to parse rather than as an absence with
                // a cause — the ADR-0098 "omit, never zero" rule applied to one field.
                'Not calculated'
        }
      />
      {criticalCount !== undefined && criticalCount > 0 ? (
        <span className="text-destructive-text inline-flex items-center gap-1">
          <CircleAlert aria-hidden="true" className="size-3" />
          {criticalCount === 1 ? '1 critical activity' : `${criticalCount} critical activities`}
        </span>
      ) : null}
      <ScheduleStateRegion state={scheduleState} onRecalculate={onRecalculate} />
    </div>
  );
}

/**
 * One labelled fact.
 *
 * The label is rendered, not an `aria-label`: this bar is read by looking, and a screen-reader user
 * gets the same words in the same order rather than a parallel description that can drift from
 * what is on screen.
 */
function Fact({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span>{label}</span>
      {/* **Colour, not weight.** The bar's ground is `--muted-foreground` and the value is
          `--foreground`, which already separates them; adding `font-medium` on top was one more
          screen placing its own weight and the ADR-0097 ratchet said so on the first run. A ratchet
          that gets raised whenever something new arrives is a counter, not a ratchet. */}
      <span className="text-foreground">{value}</span>
    </span>
  );
}

/**
 * The schedule's state, and its remedy where there is one.
 *
 * **Pushed to the trailing edge** (`ml-auto`), which is the one place on this bar where something
 * appears and disappears. The facts to its left are always present and always in the same order, so
 * a reader's eye learns their positions; a region that grows and shrinks in the middle of that row
 * would move every fact after it each time a recalculation started.
 */
function ScheduleStateRegion({
  state,
  onRecalculate,
}: {
  state: ScheduleState;
  onRecalculate: () => void;
}): React.ReactElement | null {
  const reasonId = useId();
  // `current` renders nothing — not an affirmative "up to date" chip. A bar that says everything is
  // fine, every second of every session, is a bar a reader stops reading, and it would be the
  // loudest thing on the status row in the commonest state.
  if (state.kind === 'current') return null;

  if (state.kind === 'recalculating') {
    return (
      <span className="ml-auto inline-flex items-center gap-1">
        {/* The spinning cue that used to live on the `Recalculate` button. Paired with the word,
            because `prefers-reduced-motion` reduces the spin to 0.01 ms and a motion-only signal
            would then say nothing (the ADR-0031 `isBusy` rule, kept). */}
        <Loader2 aria-hidden="true" className="size-3 animate-spin" />
        Recalculating…
      </span>
    );
  }

  return (
    <span className="ml-auto inline-flex items-center gap-2">
      <span
        className={
          // A failure is the reader's problem to act on; being behind is merely a fact about the
          // plan. Colour separates them, and the WORDS do too — colour is never the only carrier
          // (§13 / WCAG 1.4.1).
          state.failed ? 'text-destructive-text inline-flex items-center gap-1' : undefined
        }
      >
        {state.failed ? <CircleAlert aria-hidden="true" className="size-3" /> : null}
        {describe(state)}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-5 gap-1 px-2 text-xs"
        // **Shaded with its reason, never hidden** (ADR-0082), and `aria-disabled` rather than the
        // native attribute for the reason this repository has now learnt four times: `disabled`
        // takes the control out of the tab order, so the sentence explaining the refusal becomes
        // unreachable by the readers most dependent on it — and this control flips under a planner
        // whenever a peer takes the pen. The linked `sr-only` sibling is `ToolbarButton`'s exact
        // pattern rather than a second one invented here.
        aria-disabled={state.refusal ? true : undefined}
        // **The explicit name is load-bearing whenever a reason is linked**, and copying
        // `ToolbarButton`'s span without copying this line is what shipped a defect. The `sr-only`
        // sibling lives INSIDE the button, so without an `aria-label` its text is concatenated into
        // the button's NAME as well as its description: the control announced itself as
        // "Recalculate Start editing to", and three journeys broke on
        // `getByRole('button', { name: 'Start editing' })` suddenly matching two elements.
        //
        // The unit suite could not have caught it — it asked for `{ name: /Recalculate/ }`, which a
        // polluted name still matches. It asks for the exact name now.
        {...(state.refusal
          ? { 'aria-label': 'Recalculate', 'aria-describedby': reasonId, title: state.refusal }
          : {})}
        onClick={() => {
          if (!state.refusal) onRecalculate();
        }}
      >
        <RefreshCw aria-hidden="true" className="size-3" />
        Recalculate
        {state.refusal ? (
          <span id={reasonId} className="sr-only">
            {state.refusal}
          </span>
        ) : null}
      </Button>
    </span>
  );
}

/**
 * The sentence for a stale schedule.
 *
 * Four cases rather than two, because "nothing has been calculated" and "the calculation failed"
 * are different facts, and so are "one edit" and "seven". The count is dropped from the failed
 * sentence when it is zero — a manual recalculation that fails on an unedited plan is a failure
 * about the plan, not about work the reader has done.
 */
function describe(state: { edits: number; failed: boolean }): string {
  if (state.failed) {
    return state.edits > 0
      ? `Could not calculate — ${state.edits === 1 ? '1 edit' : `${state.edits} edits`} still pending`
      : 'Could not calculate the schedule';
  }
  // **No edits and no failure is the fourth case, and it is the one a first-time reader meets.** A
  // plan with activities and no computed dates has never been calculated — imported, seeded, or
  // built before anyone pressed anything. "0 edits not calculated" would be arithmetic about work
  // nobody did; the Finish fact three positions to the left already says `Not calculated`, and this
  // is the sentence that offers to fix it.
  if (state.edits === 0) return 'Not yet calculated';
  return state.edits === 1 ? '1 edit not calculated' : `${state.edits} edits not calculated`;
}
