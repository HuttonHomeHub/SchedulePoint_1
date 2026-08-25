import { CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { formatCalendarDate } from '@/lib/format-date';

import { scheduleStateAttr, type ScheduleState } from './schedule-state';

/**
 * **The plan's facts, and the schedule-state region — the content, separated from its host** (M2-T1).
 *
 * Extracted from `PlanStatusBar` with **no behaviour change**: the same element, the same
 * `data-schedule-state` attribute, the same classes, the same children in the same order. The
 * acceptance condition for the extraction was that `plan-status-bar.test.tsx` passes **unedited**,
 * and it does — that suite is the before/after oracle (the ADR-0078 barrel-preserving argument).
 *
 * It exists because M2 gives these facts **two possible hosts**. On a wide plan layout they belong
 * in the activities handle row, where the reader is already looking; below `md` that row is **not
 * mounted at all** (measured — `m0-measurement.md`), so they must still render somewhere or the
 * plan's facts vanish on the narrowest screens. One component, two hosts, chosen by the host that
 * registers — never two copies, which is how a tab and a dialog drift (ADR-0062).
 *
 * Every comment below is verbatim from the original. They record defects that shipped.
 */
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
export function PlanFacts({
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
      className="text-muted-foreground @container/facts flex min-h-6 shrink-0 items-center gap-4 px-3 text-xs"
    >
      {/* **A container query, never a `ResizeObserver`** (M2-T3). This row's width is an OUTPUT of
          what is in it — a docked strip shares it — so a JS measurement here would re-import the
          "a row measures its own leftover width and gets it wrong" defect this repository has
          recorded five times, most recently in ADR-0091 M7. `@container` asks the question that
          actually matters ("is *this* box narrow?") and cannot feed its own answer back in.

          **The plan specified a disclosure and this is not one — recorded rather than done
          quietly.** A disclosure needs open/closed state, and under the container-query-only
          constraint the only ways to get it are (a) JS for the breakpoint, which is the forbidden
          measurement, or (b) both presentations in the markup with CSS choosing one. (b) was built
          first and rejected on its own evidence: `plan-status-bar.test.tsx` went red with five
          duplicate-match failures, because jsdom does not evaluate container queries — which is
          not merely a test artefact but the honest statement that the DOM really does hold two
          copies, and that only a browser applying the query keeps a reader from meeting the same
          fact twice.

          So the facts collapse by shedding their LABELS, not by hiding. Every fact is present at
          every width and in one copy; below the threshold the value carries an `aria-label` so the
          label survives for a reader who cannot see the column it used to sit in. That satisfies
          "never an absence" more strictly than a disclosure does — a disclosure hides four facts
          behind a press — and it needs no duplication, no JS and no cross-browser trick. If a
          later measurement shows the saving is not enough, the disclosure is the escalation and it
          should be built with the width decided in JS ONCE, above this row. */}
      <FactList
        activityCount={activityCount}
        criticalCount={criticalCount}
        dataDate={dataDate}
        projectFinish={projectFinish}
        pending={pending}
      />
      {/* **Exempt from the collapse, deliberately.** ADR-0082's rule is that a control shut by a
          state the reader can change is shaded with its reason rather than hidden — and the same
          reasoning applies one step earlier: Recalculate is the only thing on this row that DOES
          something, and burying the sole remedy for a stale schedule behind a disclosure is the
          ADR-0094 defect ("a shading nobody opens the menu to see is not a shading") one surface
          along. It keeps its place at every width. */}
      <ScheduleStateRegion state={scheduleState} onRecalculate={onRecalculate} />
    </div>
  );
}
/**
 * The five facts, rendered identically in both presentations.
 *
 * One component rather than two copies of the markup: a wide row and a disclosure panel that each
 * look right alone are exactly how ADR-0062's drift happens, and only a reader who opened both
 * would ever see one is a version behind.
 */
function FactList({
  activityCount,
  criticalCount,
  dataDate,
  projectFinish,
  pending,
}: {
  activityCount: number | undefined;
  criticalCount: number | undefined;
  dataDate: string | null | undefined;
  projectFinish: string | null | undefined;
  pending: boolean;
}): React.ReactElement {
  return (
    <>
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
    </>
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
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      // The label survives the collapse for a reader who cannot see it. Below the threshold the
      // visible label is `display: none` — which removes it from the accessibility tree too — so
      // without this the value would announce as a bare date with nothing saying what it is.
      aria-label={`${label}: ${value}`}
    >
      {/* Hidden below the threshold, shown above it (M2-T3). The FACT never goes; only the word
          that introduces it, which the `aria-label` above still carries. */}
      <span className="hidden @[26rem]/facts:inline">{label}</span>
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
  // loudest thing on the status row in the commonest state. `pending` renders nothing for a
  // different reason: there is nothing yet to say, and the facts beside it already show `…`.
  if (state.kind === 'current' || state.kind === 'pending') return null;

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
