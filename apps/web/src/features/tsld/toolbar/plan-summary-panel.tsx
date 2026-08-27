import { ScheduleSummaryStrip } from '@/features/schedule';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * The body of the toolbar's **Summary** popover (ADR-0031 amendment) — the single place a planner
 * glances for "how does this plan stand?". It folds the former standalone *Plan details* popover (the
 * key facts: status + data date, plus the scheduling mode when relevant) together with the computed
 * {@link ScheduleSummaryStrip} (finish / duration / critical), and offers an **Edit plan…** shortcut
 * for writers — so status, data date and the schedule live in one hub instead of three toolbar
 * buttons. `onEdit` is null for a read-only viewer (the action is simply omitted).
 */
export function PlanSummaryPanel({
  statusLabel,
  dataDate,
  schedulingModeLabel,
  orgSlug,
  planId,
}: {
  statusLabel: string;
  dataDate: string | null;
  /** "Early" / "Visual" when scheduling modes are on; omitted otherwise. */
  schedulingModeLabel?: string | undefined;
  orgSlug: string;
  planId: string;
}): React.ReactElement {
  return (
    <div className="flex min-w-60 flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
        <dt className="text-muted-foreground">Status</dt>
        <dd className="text-right font-medium">{statusLabel}</dd>
        <dt className="text-muted-foreground">Data date</dt>
        <dd className="text-right font-medium">{dataDate ? formatCalendarDate(dataDate) : '—'}</dd>
        {schedulingModeLabel ? (
          <>
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="text-right font-medium">{schedulingModeLabel}</dd>
          </>
        ) : null}
      </dl>

      <div className="border-border border-t pt-3">
        <ScheduleSummaryStrip orgSlug={orgSlug} planId={planId} />
      </div>

      {/* **`Edit plan…` is gone from here** (foot-row-and-deck M5), and the product owner chose
          which of the two copies survives.

          It was rendered twice from ONE callback: this shortcut and the header's edit-pencil both
          called the `editPlan` memo (`use-tsld-toolbar-context.tsx`), whose own comment said so in
          as many words — "shared by the Summary popover's shortcut and the header edit-pencil".
          Same gate, same effect, same subject, two places. That is ADR-0093's rule verbatim, and
          its structural gate could not see it: `selection-duplication.structural.test.ts` compares
          the two REGISTRIES, and neither of these is a registry item.

          The pencil survives because the plan's identity line is where a plan's own properties
          already live, and because it costs a click less.

          **The `onEdit` prop goes with it.** The first version of this comment said the prop stayed
          "for the `null` branch's sake — the panel still needs to know a viewer cannot edit", and
          the compiler answered immediately that nothing read it. That justification was invented in
          the same edit that made it false: with the button gone the panel is read-only for
          everyone, so a writer/viewer distinction has nothing left to change here. Corrected rather
          than left standing, because a plausible-sounding reason for a prop nobody uses is how the
          next reader keeps it. */}
    </div>
  );
}
