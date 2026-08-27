import type { HealthOffender, ScheduleHealthReport } from '@repo/types';
import { ChevronDown, ChevronRight, CircleCheck, CircleHelp, CircleX, Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { buildHealthRows, healthAnnouncement, type HealthRowView } from '../model/health-rows';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { SheetHeader } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export interface ScheduleHealthPanelProps {
  /** The report, or `null` until a response arrives. */
  report: ScheduleHealthReport | null;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  /**
   * Close the panel **and put focus somewhere** — the host restores it to the toolbar trigger.
   * `close` alone would unmount the focused Close button and strand focus on `<body>`
   * (WCAG 2.4.3); the Float-paths dock's rule, copied deliberately.
   */
  onClose: () => void;
  /**
   * Recalculate the plan, when the caller may. Absent for a Viewer — the row then explains the
   * state without offering an action it would refuse (ADR-0082: the reason, not a dead button).
   */
  onRecalculate?: (() => void) | undefined;
  /** Open the Baselines dialog, when the caller may capture one. Absent for a Viewer. */
  onOpenBaselines?: (() => void) | undefined;
  /**
   * Select an offending activity in the workspace and bring it into view. One prop for both
   * views — the host lifts the selection and each view reveals it its own way: the canvas pans the
   * selected bar in through the selection seam, and the Gantt through the host's reveal channel
   * (M3-T2), because selection alone scrolls nothing there.
   */
  onActivateActivity: (activityId: string) => void;
  /**
   * True while a lens filter (search text or attribute filter) is dimming the diagram. The jump
   * deliberately does NOT clear the lens — a lens is the planner's own act, and silently undoing
   * it to satisfy a jump is a control changing another control's state without being asked — so
   * the offender list says why a jumped-to bar may render dimmed.
   */
  filterActive?: boolean;
}

const TONE_ICONS = {
  pass: CircleCheck,
  fail: CircleX,
  muted: CircleHelp,
  info: Info,
} as const;

const TONE_CLASSES = {
  pass: 'text-success-text',
  fail: 'text-destructive',
  muted: 'text-muted-foreground',
  info: 'text-muted-foreground',
} as const;

/**
 * **The Schedule Health Check panel** (health M2) — the DCMA 14-point report as a docked column.
 *
 * A docked column, not a modal `Sheet`, for the Float-paths reason verbatim: `showModal()` would
 * make the diagram inert and scrim it while the report's whole point is to be read BESIDE the
 * plan, jumping to offenders. Fourteen rows, always, in ordinal order — a metric never disappears;
 * one that could not be computed says why in a sentence and, where a remedy exists and the caller
 * holds it, offers the route (Recalculate / open Baselines).
 *
 * Every number on this surface comes from the payload — verdict thresholds, measured values and
 * the offender cap alike (G3). The one sentence of vocabulary this panel owns is the footer's
 * conflict distinction: metric 7 (negative float) can fail here while `Next conflict` does not
 * count it, because ADR-0094 deliberately removed negative float from the recalculation-conflict
 * set — right for a navigation cycle, wrong for an assessment. The footer says so in words a
 * planner can use.
 */
export function ScheduleHealthPanel({
  report,
  isPending,
  isError,
  onRetry,
  onClose,
  onRecalculate,
  onOpenBaselines,
  onActivateActivity,
  filterActive = false,
}: ScheduleHealthPanelProps): React.ReactElement {
  const announce = useAnnounce();
  const headingId = useId();

  // One announcement, once, when the report settles — never per render (the ADR-0079
  // stale-debounce lesson: a re-render must not re-arm the message).
  const spokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (report === null) return;
    const message = healthAnnouncement(report);
    if (spokenRef.current === message) return;
    spokenRef.current = message;
    announce(message);
  }, [report, announce]);

  const rows = report === null ? [] : buildHealthRows(report);

  return (
    // Escape closes the dock (a non-modal column has no native cancel), scoped and stopped so it
    // does not also reach the workspace/canvas handlers — the notes dock's rule, copied deliberately.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-labelledby={headingId}
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <SheetHeader
        title="Health check"
        titleClassName="text-sm font-medium"
        onClose={onClose}
        closeLabel="Close health check"
      />
      <h2 id={headingId} className="sr-only">
        Health check
      </h2>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {isPending ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-4" aria-hidden="true" />
            Checking the plan…
          </p>
        ) : null}

        {isError ? (
          <div role="status" className="space-y-2 text-sm">
            <p>The health check could not be read.</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : null}

        {report === null || isError ? null : (
          <>
            <p className="text-muted-foreground text-sm">
              {report.summary.failed} failed · {report.summary.passed} passed ·{' '}
              {report.summary.notAssessable} not assessed · {report.summary.informational}{' '}
              informational
              {report.computedAt === null ? (
                <span className="block">
                  The plan has never been calculated — schedule metrics say so below.
                </span>
              ) : null}
            </p>

            <ul className="space-y-1">
              {rows.map((row) => (
                <HealthMetricRow
                  key={row.metric.id}
                  row={row}
                  offenderCap={report.offenderCap}
                  filterActive={filterActive}
                  onActivateActivity={(offender) => {
                    onActivateActivity(offender.activityId);
                    // Spoken from HERE, inside the focus frame — focus stays on the offender
                    // button, so nothing else announces over it (the ADR-0080 lesson).
                    announce(`${offender.name} selected in the plan.`);
                  }}
                  onRecalculate={onRecalculate}
                  onOpenBaselines={onOpenBaselines}
                />
              ))}
            </ul>

            <p className="text-muted-foreground border-border border-t pt-2 text-xs">
              This checks how the plan is built. It is separate from the issues a recalculation
              finds — the Next conflict cycle counts those, and the two can honestly disagree about
              negative float.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function HealthMetricRow({
  row,
  offenderCap,
  filterActive,
  onActivateActivity,
  onRecalculate,
  onOpenBaselines,
}: {
  row: HealthRowView;
  offenderCap: number;
  filterActive: boolean;
  onActivateActivity: (offender: HealthOffender) => void;
  onRecalculate?: (() => void) | undefined;
  onOpenBaselines?: (() => void) | undefined;
}): React.ReactElement {
  const { metric } = row;
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const Icon = TONE_ICONS[row.tone];
  const hasDisclosure = metric.offenders.length > 0;
  const remedyAction =
    row.remedy === 'RECALCULATE'
      ? onRecalculate
      : row.remedy === 'CAPTURE_BASELINE'
        ? onOpenBaselines
        : undefined;

  return (
    <li className="border-border rounded border px-2 py-1.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {hasDisclosure ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailId}
            // The threshold and measurement ride the accessible name's describedby sibling below,
            // never only a visual chip (the ADR-0094 M5 finding).
            onClick={() => setExpanded((v) => !v)}
            className="hover:bg-accent/60 -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded px-1 text-left"
          >
            {expanded ? (
              <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{metric.name}</span>
            <VerdictBadge row={row} />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{metric.name}</span>
            <VerdictBadge row={row} />
          </div>
        )}
        <Icon aria-hidden="true" className={cn('size-4 shrink-0', TONE_CLASSES[row.tone])} />
      </div>

      {row.measuredLabel !== null || row.thresholdLabel !== null ? (
        <p className="text-muted-foreground pl-5 text-xs">
          {row.measuredLabel}
          {row.measuredLabel !== null && row.thresholdLabel !== null ? ' · judged against ' : null}
          {row.thresholdLabel !== null && row.measuredLabel === null ? 'judged against ' : null}
          {row.thresholdLabel}
        </p>
      ) : null}

      {row.reasonSentence !== null ? (
        <div className="space-y-1 pl-5">
          <p className="text-muted-foreground text-xs">{row.reasonSentence}</p>
          {remedyAction === undefined ? null : (
            <Button
              variant="secondary"
              size="sm"
              onClick={remedyAction}
              className="h-6 px-2 text-xs"
            >
              {row.remedy === 'RECALCULATE' ? 'Recalculate' : 'Open baselines'}
            </Button>
          )}
        </div>
      ) : null}

      {hasDisclosure && expanded ? (
        <div id={detailId} className="pt-1 pl-5">
          {metric.offendersTruncated ? (
            <p className="text-muted-foreground text-xs">
              Showing {Math.min(offenderCap, metric.offenders.length)} of {metric.offenderCount}.
            </p>
          ) : null}
          {filterActive ? (
            <p className="text-muted-foreground text-xs">
              A filter is on — some offenders will appear dimmed.
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {metric.offenders.map((offender) => (
              <li key={`${offender.kind}-${offender.id}`}>
                <button
                  type="button"
                  onClick={() => onActivateActivity(offender)}
                  className="hover:bg-accent/60 flex w-full min-w-0 items-baseline gap-2 rounded px-1 text-left text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {offender.code === null ? offender.name : `${offender.code} ${offender.name}`}
                  </span>
                  <span className="text-muted-foreground shrink-0">{offender.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function VerdictBadge({ row }: { row: HealthRowView }): React.ReactElement {
  return (
    <span className={cn('shrink-0 text-xs font-medium', TONE_CLASSES[row.tone])}>
      {row.verdictLabel}
    </span>
  );
}
