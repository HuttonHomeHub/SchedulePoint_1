import { SquarePen } from 'lucide-react';

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
  onEdit,
}: {
  statusLabel: string;
  dataDate: string | null;
  /** "Early" / "Visual" when scheduling modes are on; omitted otherwise. */
  schedulingModeLabel?: string | undefined;
  orgSlug: string;
  planId: string;
  onEdit: (() => void) | null;
}): React.ReactElement {
  return (
    <div className="flex min-w-[15rem] flex-col gap-3 text-sm">
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

      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="text-foreground hover:bg-accent focus-visible:ring-ring border-border -mx-1 flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          <SquarePen aria-hidden="true" className="size-4" />
          Edit plan…
        </button>
      ) : null}
    </div>
  );
}
