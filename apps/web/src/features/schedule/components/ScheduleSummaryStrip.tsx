import { NO_START_HINT, useScheduleSummary } from '../api/use-schedule';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatCalendarDate } from '@/lib/format-date';

/** One labelled figure in the strip. */
function Stat({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The plan's computed schedule at a glance: data date, project finish, and the
 * activity / critical / near-critical counts, read from the summary endpoint (no
 * recompute). Shows a "not yet calculated" empty state until the plan has been
 * calculated, and its own loading / error states. Read-only — the Recalculate
 * action is a separate control (D2).
 */
export function ScheduleSummaryStrip({
  orgSlug,
  planId,
}: {
  orgSlug: string;
  planId: string;
}): React.ReactElement {
  const summary = useScheduleSummary(orgSlug, planId);

  const shell = (children: React.ReactNode) => (
    <section aria-label="Schedule summary" className="border-border rounded-lg border p-4">
      {children}
    </section>
  );

  if (summary.isPending) return shell(<Spinner label="Loading schedule summary…" />);

  if (summary.isError) {
    return shell(
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-destructive-text text-sm">
          Couldn’t load the schedule summary.
        </p>
        <Button variant="outline" size="sm" onClick={() => void summary.refetch()}>
          Try again
        </Button>
      </div>,
    );
  }

  const { dataDate, projectFinish, activityCount, criticalCount, nearCriticalCount } = summary.data;
  const { parkedConstraintCount } = summary.data;

  // No computed finish yet → the plan has never been recalculated (or is empty).
  if (projectFinish === null) {
    return shell(
      <div className="text-muted-foreground text-sm">
        <p className="text-foreground font-medium">Schedule not yet calculated</p>
        <p className="mt-1">
          {dataDate === null
            ? NO_START_HINT
            : `Data date ${formatCalendarDate(dataDate)}. Recalculate to compute the critical path.`}
        </p>
      </div>,
    );
  }

  return shell(
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      <Stat label="Data date" value={formatCalendarDate(dataDate)} />
      <Stat label="Project finish" value={formatCalendarDate(projectFinish)} />
      <Stat label="Activities" value={activityCount} />
      <Stat label="Critical" value={criticalCount} />
      <Stat label="Near-critical" value={nearCriticalCount} />
      {parkedConstraintCount > 0 ? (
        <Stat label="Parked constraints" value={parkedConstraintCount} />
      ) : null}
    </dl>,
  );
}
