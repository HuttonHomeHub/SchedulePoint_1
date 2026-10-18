import { useQuery } from '@tanstack/react-query';

import { NO_START_HINT, useScheduleSummary } from '../api/use-schedule';

import { Button } from '@/components/ui/button';
import { ContextStrip, ContextStripSkeleton, type ContextFact } from '@/components/ui/form-layout';
import { LoadingShape } from '@/components/ui/page';
import {
  ADVANCED_ACTIVITY_TYPES_ENABLED,
  INTER_PROJECT_DATES_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
} from '@/config/env';
import { activitiesQueryOptions } from '@/features/activities';
import { countLevelledWithoutGhost } from '@/features/tsld/render/lenses';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * The five facts a calculated plan always shows, in the order it shows them. Shared by the strip and
 * its skeleton so the placeholder draws the real labels.
 */
const ALWAYS_FACTS = {
  dataDate: 'Data date',
  projectFinish: 'Project finish',
  activities: 'Activities',
  critical: 'Critical',
  nearCritical: 'Near-critical',
} as const;

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
  // The activities are read only to say how many levelled activities have no ghost (#426), so the
  // fetch waits until there is a levelled count to explain; the plan workspace has them cached already.
  const activities = useQuery({
    ...activitiesQueryOptions(orgSlug, planId),
    enabled: RESOURCE_LEVELLING_ENABLED && (summary.data?.leveledActivityCount ?? 0) > 0,
  });

  const shell = (children: React.ReactNode) => (
    <section aria-label="Schedule summary" className="border-border rounded-lg border p-4">
      {children}
    </section>
  );

  if (summary.isPending) {
    return shell(
      <LoadingShape label="Loading schedule summary…">
        <ContextStripSkeleton
          framed={false}
          items={Object.values(ALWAYS_FACTS).map((label) => ({ label }))}
        />
      </LoadingShape>,
    );
  }

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
  // Resource-dependent activities the engine could find no driving assignment for (ADR-0035 §23).
  // The API has returned this count since M7.2 and nothing displayed it, so a plan could schedule
  // work on the wrong calendar with no indication anywhere. Gated on the flag that offers the type.
  const resourceDriverMissingCount = ADVANCED_ACTIVITY_TYPES_ENABLED
    ? summary.data.resourceDriverMissingCount
    : 0;
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
  // Delays inside one day are counted by the engine and drawn by nothing (the ghost needs a date to
  // differ), so the strip says so. Unknown — still loading, or the read failed — says nothing.
  const levelledWithoutGhost =
    hasLevelled && activities.data
      ? countLevelledWithoutGhost(leveledActivityCount, activities.data)
      : 0;

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

  // Each count that has a footnote below links to it with `describedBy`; the levelled-activities
  // qualifier rides inside the same `<dd>` (`note`) so a screen reader hears it with the figure.
  const facts: ContextFact[] = [
    { label: ALWAYS_FACTS.dataDate, value: formatCalendarDate(dataDate) },
    { label: ALWAYS_FACTS.projectFinish, value: formatCalendarDate(projectFinish) },
    { label: ALWAYS_FACTS.activities, value: activityCount },
    { label: ALWAYS_FACTS.critical, value: criticalCount },
    { label: ALWAYS_FACTS.nearCritical, value: nearCriticalCount },
  ];
  if (constraintViolationCount > 0) {
    facts.push({
      label: 'Constraint conflicts',
      value: constraintViolationCount,
      describedBy: 'constraint-violations-hint',
    });
  }
  if (constraintWarningCount > 0) {
    facts.push({
      label: 'Constraint warnings',
      value: constraintWarningCount,
      describedBy: 'constraint-warnings-hint',
    });
  }
  if (externalDrivenCount > 0) {
    facts.push({
      label: 'Externally driven',
      value: externalDrivenCount,
      describedBy: 'external-driven-hint',
    });
  }
  if (resourceDriverMissingCount > 0) {
    facts.push({
      label: 'Missing a driver',
      value: resourceDriverMissingCount,
      describedBy: 'resource-driver-missing-hint',
    });
  }
  if (hasLevelled) {
    facts.push(
      { label: 'Levelled finish', value: formatCalendarDate(leveledProjectFinish) },
      {
        label: 'Levelled activities',
        value: leveledActivityCount,
        note:
          levelledWithoutGhost > 0 ? `${levelledWithoutGhost} under a day, not drawn` : undefined,
      },
    );
    if (levelingWindowExceededCount > 0) {
      facts.push({
        label: 'Window exceeded',
        value: levelingWindowExceededCount,
        describedBy: 'leveling-window-hint',
      });
    }
    if (selfOverAllocatedCount > 0) {
      facts.push({
        label: 'Over capacity',
        value: selfOverAllocatedCount,
        describedBy: 'leveling-self-over-hint',
      });
    }
  }

  return shell(
    <div className="flex flex-col gap-2">
      <ContextStrip label="Computed schedule" framed={false} facts={facts} />
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
      {resourceDriverMissingCount > 0 ? (
        <p id="resource-driver-missing-hint" className="text-muted-foreground text-xs">
          Missing a driver counts resource-dependent activities with no driving resource assignment.
          They were scheduled on their own or the plan’s calendar instead of a resource’s — assign a
          resource, mark it driving, and recalculate.
        </p>
      ) : null}
      {hasLevelled ? (
        <p className="text-muted-foreground text-xs">
          Levelling moved {leveledActivityCount}{' '}
          {leveledActivityCount === 1 ? 'activity' : 'activities'}, either to keep resource demand
          within capacity or because the work before {leveledActivityCount === 1 ? 'it' : 'them'}{' '}
          moved. The levelled finish is when the plan finishes once levelled.
          {levelledWithoutGhost > 0
            ? ` ${levelledWithoutGhost} moved by less than a day, so ${
                levelledWithoutGhost === 1 ? 'it has' : 'they have'
              } no ghost on the diagram.`
            : ''}{' '}
          The critical path and floats above stay the pure-network result.
        </p>
      ) : null}
      {hasLevelled && levelingWindowExceededCount > 0 ? (
        <p id="leveling-window-hint" className="text-muted-foreground text-xs">
          Window exceeded counts activities whose resource had no free window in time, so levelling
          extended the schedule past the float left from where their bars are drawn to place them.
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
