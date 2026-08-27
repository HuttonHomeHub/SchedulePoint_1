import { CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import { useId } from 'react';

import { scheduleStateAttr, type ScheduleState } from './schedule-state';

import { PenStatusOutlet } from '@/components/layout/workspace/plan-slot-host';
import { Button } from '@/components/ui/button';
import { formatCalendarDate } from '@/lib/format-date';

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
      /*
       * **`flex-wrap` with a ZERO row gap** (foot-row-and-deck M4).
       *
       * The product owner asked whether the facts could be "two lines keeping the same height of
       * the toolbar still". Measured, the answer is yes and the whole cost was one character of the
       * gap utility: `gap-4` sets `row-gap: 16px` as well as `column-gap: 16px`, so a wrapped row
       * measured **64 px** (24 + 16 + 24) and grew the foot row from 41 px to 65 px. At
       * `row-gap: 0` two 16 px lines are **32 px**, which is under the 40 px collapse button that
       * already sets this row's floor — so the row does not move and the diagram pays nothing.
       * Measured at rest: foot row 41 px, canvas unchanged, at 1920, 1646 and 1440.
       *
       * The first M0 pass concluded the opposite ("never free"). It had measured the cost of
       * today's row-gap and generalised it into a property of the layout — corrected in
       * `docs/specs/workspace-foot-and-deck/m0-measurement.md` C2.
       *
       * **`max-w-64` is what makes any of it happen, and the first version shipped without it.**
       * `flex-wrap` only *permits* wrapping. This row is `shrink-0` with `basis: auto`, and the
       * dock beside it is `flex-1` with `basis: 0%` — so the dock GROWS into whatever is left and
       * absorbs the whole deficit by wrapping its own items. The facts are never squeezed, whatever
       * their shrink factor: measured, making the row and its wrapper shrinkable changed nothing at
       * any width (`m4-shrink.spec.ts` candidates A and B, 481.4 × 24 in all six readings). A
       * capability with no way to be reached is ADR-0081's defect, and the class alone was exactly
       * that. They wrap only if they are explicitly bounded.
       *
       * **Bounded, it also finishes the job M1 could not.** M1 took the object bar to one line at
       * 1920 and 1646 and left 1440 wrapped at 117 px, because seven controls still exceeded the
       * 569.6 px there. Handing back the 231 px the facts were holding takes the dock to 801 px
       * against the 763 px it needs: measured, **1440 goes 117 → 41 px and the canvas 484 → 560**,
       * which is the entire loss recovered. 300 px was measured too and only reaches 77 px, so the
       * bound is doing real work rather than being a round number.
       *
       * **What it does NOT do is fix 1646** — that was M1's, and wrapping the facts there buys
       * nothing, because a wrapping row breaks between ITEMS rather than by total width (ADR-0114
       * M2 recorded the same thing freeing 164 px and gaining zero).
       */
      className="text-muted-foreground flex min-h-6 max-w-64 shrink-0 flex-wrap items-center gap-x-4 gap-y-0 px-3 text-xs"
    >
      {/* **The collapse is WITHDRAWN, on its own measurement** (M2-T3, reversed at M2-T4).
          Tailwind's `@container` sets `container-type: inline-size`, which applies
          `contain: inline-size`: the element stops sizing to its content and takes its inline size
          from layout instead. As an auto-width `shrink-0` flex item inside the activities row that
          collapses it — measured at **24 px wide by 48 px tall**, with all five facts present in
          the DOM and overflowing a box with no room for them.

          The probe is what caught it. `factsText` still read the whole sentence, so a test asserting
          the facts are "present" would have passed, and a human glancing at the row would have seen
          a smear rather than an obvious absence. Only the box measurement said what had happened.

          It is withdrawn rather than repaired because the query was asking the wrong question
          anyway. The threshold was 26rem against the FACTS' own width, and the thing that decides
          whether they need to collapse is whether the ROW is tight — which depends on what is
          docked beside them, and is known at the row, not here. The facts fit as they are: 465 px
          of ink in a 979 px bar at the narrowest width where that bar exists.

          If the row ever does get tight, the container belongs on the row and there are two of
          them, so it wants a decision rather than a class. */}
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
      {/* **Where the pen's sentence lands** (the one-row header, 2026-08-26). An OUTLET, so the
          sentence follows the facts to whichever host has them rather than being pinned to the
          status bar — which is what keeps grid row 3 zero-height in the states where it already
          was. Putting it in `PlanStatusBar` beside `PlanFactsHost` was the first design and it
          costs ~24 px of vertical whenever the activities row has adopted the facts, which is the
          wrong direction for an epic whose subject is the height above the canvas (ADR-0092 M4's
          "relocating a row inside one column removes nothing", earning its keep again).

          **It does not break this component's "announces nothing" rule.** That rule is about the
          shared `announcer.tsx` region, which clears-then-sets on an animation frame, so wiring
          several facts to it drops messages silently (`plan.md` §A14). An outlet is not an
          announcement, and what portals into it is the pen's OWN `role="status"` element, which has
          announced its own transitions since ADR-0028 and is unrelated to the shared announcer. Two
          independent live regions do not race; one shared one does. */}
      <PenStatusOutlet />
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
 * **This docblock used to say the label is rendered rather than given as an `aria-label`, and that
 * stopped being true three lines below it.** It came verbatim from the pre-extraction
 * `plan-status-bar.tsx`, where the old `Fact` genuinely had none — but an `aria-label` was added
 * here, so the file shipped a live claim contradicting its own next statement. The top of this file
 * says its comments are verbatim because they record defects that shipped; this one was not a
 * preserved record, it was simply wrong, and the M4 accessibility review caught it.
 *
 * What is true now: the label IS rendered, **and** the pair is additionally given as one
 * `aria-label` so it announces as "Finish: 28 Jan 2026" rather than two adjacent fragments a
 * listener has to join. `aria-label` on the outer span short-circuits name-from-content, so the
 * inner spans are not also used to compute the name and it does not double-announce.
 */
function Fact({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      // Kept through the collapse's withdrawal: the label and value are two spans, so a reader
      // using a screen reader gets "Finish, 28 Jan 2026" as one name rather than two adjacent
      // fragments they have to join themselves.
      aria-label={`${label}: ${value}`}
    >
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
