import { CircleAlert, Loader2 } from 'lucide-react';

import { formatCalendarDate } from '@/lib/format-date';

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
  recalculating,
  pending,
}: {
  activityCount: number | undefined;
  criticalCount: number | undefined;
  dataDate: string | null | undefined;
  projectFinish: string | null | undefined;
  /** A recalculation is in flight — the state this bar exists to take off a button. */
  recalculating: boolean;
  /** The summary has not arrived. Distinct from "arrived and empty", which is a real answer. */
  pending: boolean;
}): React.ReactElement {
  return (
    <div className="text-muted-foreground flex h-6 shrink-0 items-center gap-4 px-3 text-xs">
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
      {recalculating ? (
        <span className="inline-flex items-center gap-1">
          {/* The spinning cue that used to live on the `Recalculate` button. Paired with the word,
              because `prefers-reduced-motion` reduces the spin to 0.01 ms and a motion-only signal
              would then say nothing (the ADR-0031 `isBusy` rule, kept). */}
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          Recalculating…
        </span>
      ) : null}
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
