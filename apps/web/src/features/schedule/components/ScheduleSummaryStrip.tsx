import { NO_START_HINT, useScheduleSummary } from '../api/use-schedule';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { INTER_PROJECT_DATES_ENABLED, RESOURCE_LEVELLING_ENABLED } from '@/config/env';
import { formatCalendarDate } from '@/lib/format-date';

/** One labelled figure in the strip. `hintId` links an explanatory footnote for AT. */
function Stat({
  label,
  value,
  hintId,
}: {
  label: string;
  value: React.ReactNode;
  hintId?: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium tabular-nums" aria-describedby={hintId}>
        {value}
      </dd>
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
  const { constraintViolationCount, constraintWarningCount } = summary.data;
  // How many activities an external / inter-project bound drove this recalc (ADR-0043). Shown only
  // behind the flag and only when non-zero, matching the other engine-count chips.
  const externalDrivenCount = INTER_PROJECT_DATES_ENABLED ? summary.data.externalDrivenCount : 0;
  const {
    leveledProjectFinish,
    leveledActivityCount,
    levelingWindowExceededCount,
    selfOverAllocatedCount,
  } = summary.data;
  // The plan has levelled once the engine has written a levelled finish (`levelResources` on + a
  // recalculation has run). Off / never-levelled leaves it null, so the whole overlay stays hidden
  // even with the flag on — nothing to show until a levelled recalculation exists.
  const hasLevelled = RESOURCE_LEVELLING_ENABLED && leveledProjectFinish !== null;

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
    <div className="flex flex-col gap-2">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Data date" value={formatCalendarDate(dataDate)} />
        <Stat label="Project finish" value={formatCalendarDate(projectFinish)} />
        <Stat label="Activities" value={activityCount} />
        <Stat label="Critical" value={criticalCount} />
        <Stat label="Near-critical" value={nearCriticalCount} />
        {constraintViolationCount > 0 ? (
          <Stat
            label="Constraint conflicts"
            value={constraintViolationCount}
            hintId="constraint-violations-hint"
          />
        ) : null}
        {constraintWarningCount > 0 ? (
          <Stat
            label="Constraint warnings"
            value={constraintWarningCount}
            hintId="constraint-warnings-hint"
          />
        ) : null}
        {externalDrivenCount > 0 ? (
          <Stat
            label="Externally driven"
            value={externalDrivenCount}
            hintId="external-driven-hint"
          />
        ) : null}
        {hasLevelled ? (
          <>
            <Stat label="Levelled finish" value={formatCalendarDate(leveledProjectFinish)} />
            <Stat label="Levelled activities" value={leveledActivityCount} />
            {levelingWindowExceededCount > 0 ? (
              <Stat
                label="Window exceeded"
                value={levelingWindowExceededCount}
                hintId="leveling-window-hint"
              />
            ) : null}
            {selfOverAllocatedCount > 0 ? (
              <Stat
                label="Over capacity"
                value={selfOverAllocatedCount}
                hintId="leveling-self-over-hint"
              />
            ) : null}
          </>
        ) : null}
      </dl>
      {constraintViolationCount > 0 ? (
        <p id="constraint-violations-hint" className="text-muted-foreground text-xs">
          Constraint conflicts are activities where a mandatory constraint forces a date earlier
          than the logic allows. The schedule is shown as pinned; review the dates.
        </p>
      ) : null}
      {constraintWarningCount > 0 ? (
        <p id="constraint-warnings-hint" className="text-muted-foreground text-xs">
          Constraint warnings are Start-no-earlier-than constraints — or external early starts —
          dated before the data date. They are honoured but cannot pull work before the data date.
        </p>
      ) : null}
      {externalDrivenCount > 0 ? (
        <p id="external-driven-hint" className="text-muted-foreground text-xs">
          Externally driven counts activities whose start or finish was set by an imported external
          date from outside this plan rather than by this plan’s own logic.
        </p>
      ) : null}
      {hasLevelled ? (
        <p className="text-muted-foreground text-xs">
          Levelling delayed {leveledActivityCount}{' '}
          {leveledActivityCount === 1 ? 'activity' : 'activities'} so resource demand stays within
          capacity; the levelled finish is the latest finish under levelling. The critical path and
          floats above stay the pure-network result.
        </p>
      ) : null}
      {hasLevelled && levelingWindowExceededCount > 0 ? (
        <p id="leveling-window-hint" className="text-muted-foreground text-xs">
          Window exceeded counts activities whose resource had no free window in time, so levelling
          extended the schedule past their total float to place them.
        </p>
      ) : null}
      {hasLevelled && selfOverAllocatedCount > 0 ? (
        <p id="leveling-self-over-hint" className="text-muted-foreground text-xs">
          Over capacity counts activities whose own demand exceeds the resource’s capacity — a delay
          can’t resolve it, so it is reported for you to review the assignment or capacity.
        </p>
      ) : null}
    </div>,
  );
}
