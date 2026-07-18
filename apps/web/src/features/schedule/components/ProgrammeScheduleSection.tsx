import type { ProgrammeSchedulePlanResult } from '@repo/types';
import { useId, useState } from 'react';

import {
  isProgrammeTooLarge,
  programmeErrorMessage,
  programmeLockedDetails,
  useRecalculateProgramme,
} from '../api/use-programme-schedule';
import { useScheduleSummary } from '../api/use-schedule';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { formatCalendarDate } from '@/lib/format-date';

/** One plan's line in the programme result — labelled by its place in the upstream-first order. */
function PlanResultRow({
  result,
  label,
}: {
  result: ProgrammeSchedulePlanResult;
  label: string;
}): React.ReactElement {
  const { summary } = result;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-muted-foreground text-sm tabular-nums">
        {summary.projectFinish
          ? `Finish ${formatCalendarDate(summary.projectFinish)}`
          : 'Not calculated'}
        {' · '}
        {summary.criticalCount} critical
      </span>
    </li>
  );
}

/**
 * The **programme scheduling** control for a plan that has live cross-plan links (inter-project M2,
 * ADR-0045). Rendered only behind `VITE_PROGRAMME_SCHEDULING` by its hosts, and — because the plan
 * summary carries the `scheduleStale` field **only when the plan has at least one cross-plan edge** —
 * it renders nothing at all for an ordinary plan, so a plan with no cross-plan links is unaffected.
 *
 * When present it offers:
 * - a **stale banner** (`role="status"`) when an upstream plan was recalculated more recently, with a
 *   call to run a programme recalculate;
 * - a **Recalculate programme** action (Planner/Org Admin) that solves the plan's upstream cross-plan
 *   closure upstream-first;
 * - a **result panel** with the per-plan summaries (in recalculation order) and the summed
 *   missing-upstream (N32) warning;
 * - the **423 blocked-plans** path (a list of the plans a peer is editing, each linking to its plan
 *   where the pen can be requested/overridden) and the **422 too-large** path.
 */
export function ProgrammeScheduleSection({
  orgSlug,
  planId,
  canRecalc,
  headingLevel = 2,
}: {
  orgSlug: string;
  planId: string;
  canRecalc: boolean;
  /**
   * The heading level for the section title, so it slots into its host's outline without a skip
   * (WCAG 1.3.1 / 2.4.6). Defaults to `2` for the canvas workspace hosts (which mount it directly
   * under the plan `h1`); the plan-detail route nests it under its own `h2 Schedule`, so passes `3`.
   */
  headingLevel?: 2 | 3;
}): React.ReactElement | null {
  const summary = useScheduleSummary(orgSlug, planId);
  const recalc = useRecalculateProgramme(orgSlug, planId);
  const announce = useAnnounce();
  const errorId = useId();
  const headingId = useId();
  const [genericError, setGenericError] = useState<string | null>(null);

  // The summary omits `scheduleStale` entirely for a plan with no cross-plan edges (ADR-0045 §5), so
  // the whole programme surface is invisible unless the plan actually has a live cross-plan link.
  const hasCrossPlanEdges = summary.data?.scheduleStale !== undefined;
  if (!hasCrossPlanEdges) return null;

  const isStale = summary.data?.scheduleStale === true;
  const staleUpstream = summary.data?.staleUpstreamPlanIds ?? [];

  const locked = recalc.isError ? programmeLockedDetails(recalc.error) : null;
  const tooLarge = recalc.isError ? isProgrammeTooLarge(recalc.error) : false;

  const onRecalc = (): void => {
    if (recalc.isPending) return;
    setGenericError(null);
    recalc.mutate(undefined, {
      onSuccess: (result) => {
        announce(
          `Programme recalculated: ${result.programme.planCount} ${
            result.programme.planCount === 1 ? 'plan' : 'plans'
          }.`,
        );
      },
      onError: (error) => {
        // The typed 422-too-large / 423-locked cases render their own structured panels below; only
        // surface the generic inline message for everything else.
        if (programmeLockedDetails(error) || isProgrammeTooLarge(error)) return;
        setGenericError(programmeErrorMessage(error));
      },
    });
  };

  const result = recalc.data;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section
      aria-labelledby={headingId}
      className="border-border flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Heading id={headingId} className="text-sm font-medium">
            Programme scheduling
          </Heading>
          <p className="text-muted-foreground text-sm">
            This plan has live cross-plan links. Recalculate the programme to solve its upstream
            plans in order so its dates track theirs.
          </p>
        </div>
        {canRecalc ? (
          <Button
            onClick={onRecalc}
            aria-disabled={recalc.isPending}
            aria-busy={recalc.isPending}
            aria-describedby={genericError ? errorId : undefined}
            className="shrink-0 aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            {recalc.isPending ? 'Recalculating…' : 'Recalculate programme'}
          </Button>
        ) : null}
      </div>

      {/* Staleness (pull-computed, ADR-0045 §5). Announced as a status so AT users hear it appear. */}
      {isStale ? (
        <div
          role="status"
          className="border-warning/40 bg-warning/10 text-warning-text flex flex-col gap-1 rounded-md border px-3 py-2 text-sm"
        >
          <p className="font-medium">Upstream plans changed</p>
          <p>
            {staleUpstream.length > 0
              ? `${staleUpstream.length} upstream ${
                  staleUpstream.length === 1 ? 'plan was' : 'plans were'
                } recalculated more recently than this one.`
              : 'An upstream plan was recalculated more recently than this one.'}{' '}
            {canRecalc
              ? 'Run a programme recalculate to bring this plan’s dates up to date.'
              : 'Ask a planner to run a programme recalculate to bring this plan’s dates up to date.'}
          </p>
        </div>
      ) : null}

      {genericError ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {genericError}
        </p>
      ) : null}

      {/* 422 — the closure is too large to solve in one synchronous request. */}
      {tooLarge ? (
        <div
          role="alert"
          className="border-destructive-text/40 text-destructive-text rounded-md border px-3 py-2 text-sm"
        >
          {recalc.error instanceof Error
            ? recalc.error.message
            : 'This programme spans too many interdependent plans to recalculate at once. Recalculate a smaller sub-programme.'}
        </div>
      ) : null}

      {/* 423 — one or more plans in the closure are held by another editor; nothing was written. */}
      {locked ? (
        <div
          role="alert"
          className="border-warning/40 bg-warning/10 text-warning-text flex flex-col gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <p className="font-medium">Some plans are being edited</p>
          <p>
            Nothing was recalculated. Another editor holds the edit-lock on{' '}
            {locked.blockedPlanIds.length === 1 ? 'a plan' : 'these plans'} in this programme. Ask
            the current editor to hand over the pen, or an Org Admin can override it, then try
            again.
          </p>
          <ul className="flex flex-col gap-1">
            {locked.blockedPlanIds.map((blockedId) => (
              <li key={blockedId}>
                <a
                  href={`/orgs/${orgSlug}/plans/${blockedId}`}
                  aria-label={`Open blocked plan ${blockedId}`}
                  className="underline underline-offset-4"
                >
                  Open blocked plan
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 200 — the per-plan summaries (upstream-first) + the summed missing-upstream (N32) warning. */}
      {result ? (
        <div className="flex flex-col gap-2">
          <ul className="divide-border divide-y">
            {result.plans.map((planResult, index) => (
              <PlanResultRow
                key={planResult.planId}
                result={planResult}
                label={
                  index === result.plans.length - 1 ? 'This plan' : `Upstream plan ${index + 1}`
                }
              />
            ))}
          </ul>
          {result.programme.crossPlanUpstreamMissingCount > 0 ? (
            <p role="status" className="text-muted-foreground text-sm">
              {result.programme.crossPlanUpstreamMissingCount} cross-plan{' '}
              {result.programme.crossPlanUpstreamMissingCount === 1 ? 'link' : 'links'} pointed at
              an upstream activity that has never been calculated, so it contributed no date.
              Calculate those upstream plans, then recalculate the programme.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
