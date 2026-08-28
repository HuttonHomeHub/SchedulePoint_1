import type { HealthMetricResult, HealthOffender, ScheduleHealthReport } from '@repo/types';
import { ChevronDown, ChevronRight, CircleCheck, CircleHelp, CircleX, Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import {
  buildHealthRows,
  healthAnnouncement,
  mergeCriticalPathResult,
  REMEDY_ROLE_SENTENCES,
  type HealthRowView,
} from '../model/health-rows';
import { printHealthReport } from '../print/HealthPrintDocument';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
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
  /**
   * The on-demand metric-12 what-if (health M6): pressed from row 12, its result merges over the
   * placeholder and the summary recounts. The host owns the mutation (it owns the org/plan scope);
   * absent in standalone hosts, where the row keeps its placeholder sentence.
   */
  criticalPathTest?:
    | {
        run: () => void;
        isPending: boolean;
        isError: boolean;
        result: HealthMetricResult | null;
      }
    | undefined;
}

const TONE_ICONS = {
  pass: CircleCheck,
  fail: CircleX,
  muted: CircleHelp,
  info: Info,
} as const;

/**
 * `-text` tokens only: `text-destructive` is the FILL token, gated by `token-contrast.test.ts`
 * solely as a button background (3:1), never as ink — `text-destructive-text` is the pair audited
 * for body text (4.5:1). The M5 component and accessibility reviews both caught the fill token
 * here; a future retune of `--destructive` would have silently dropped this text below AA with no
 * gate watching the pairing.
 */
const TONE_CLASSES = {
  pass: 'text-success-text',
  fail: 'text-destructive-text',
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
  criticalPathTest,
}: ScheduleHealthPanelProps): React.ReactElement {
  const announce = useAnnounce();
  const headingId = useId();

  // The report the panel RENDERS: the on-demand metric-12 result merged over its placeholder,
  // with the summary recounted (health M6). Print and the rows read the same merged object, so
  // paper and screen cannot disagree about what was computed.
  const effectiveReport =
    report === null ? null : mergeCriticalPathResult(report, criticalPathTest?.result ?? null);

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

  // The what-if's verdict, spoken once when it settles — the run button keeps focus, so this is
  // the only channel telling a screen-reader user the press did anything.
  const cptSpokenRef = useRef<HealthMetricResult | null>(null);
  const cptResult = criticalPathTest?.result ?? null;
  useEffect(() => {
    if (cptResult === null || cptSpokenRef.current === cptResult) return;
    cptSpokenRef.current = cptResult;
    announce(
      cptResult.verdict === 'PASS'
        ? 'Critical path test passed — the completion moved with the injection.'
        : cptResult.verdict === 'FAIL'
          ? 'Critical path test failed — the completion did not move with the injection.'
          : 'Critical path test could not be assessed.',
    );
  }, [cptResult, announce]);

  const rows = effectiveReport === null ? [] : buildHealthRows(effectiveReport);

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
        actions={
          effectiveReport === null ? null : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => printHealthReport(effectiveReport)}
              className="h-7 px-2 text-xs"
            >
              Print report
            </Button>
          )
        }
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

        {/* The shared NoticeStrip with `role="alert"`, exactly as the sibling Float-paths dock
            renders the same failure — a bespoke div here was the M5 ux/component finding: two
            near-identical panels reporting one kind of failure two ways. */}
        {isError ? (
          <NoticeStrip
            role="alert"
            tone="warning"
            density="comfortable"
            messageFit="grow"
            message="The health check could not be read."
          >
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </NoticeStrip>
        ) : null}

        {effectiveReport === null || isError ? null : (
          <>
            <p className="text-muted-foreground text-sm">
              {effectiveReport.summary.failed} failed · {effectiveReport.summary.passed} passed ·{' '}
              {effectiveReport.summary.notAssessable} not assessed ·{' '}
              {effectiveReport.summary.informational} informational
              {effectiveReport.computedAt === null ? (
                <span className="block">
                  The plan has never been calculated — schedule metrics say so below.
                </span>
              ) : null}
            </p>

            {/* The report's provenance, on screen as well as on paper (the spec's own D9: a
                schedule assessment is meaningless without when it was computed and under which
                mode) — the M5 ux review found the printout more honest than the live panel. */}
            <p className="text-muted-foreground text-xs">
              {effectiveReport.computedAt === null
                ? 'Never calculated'
                : `Calculated ${effectiveReport.computedAt.slice(0, 10)}`}{' '}
              · data date {effectiveReport.dataDate} ·{' '}
              {effectiveReport.schedulingMode === 'EARLY' ? 'Early' : 'Visual'} scheduling ·
              baseline: {effectiveReport.baseline?.name ?? 'none'}
            </p>

            {/* Panel-level, not per-row: with several rows expanded under a lens the per-row copy
                repeated verbatim — one sentence covers every offender list below it. */}
            {filterActive ? (
              <p className="text-muted-foreground text-xs">
                A filter is on — some offenders will appear dimmed.
              </p>
            ) : null}

            <ul className="space-y-1">
              {rows.map((row) => (
                <HealthMetricRow
                  key={row.metric.id}
                  row={row}
                  offenderCap={effectiveReport.offenderCap}
                  criticalPathTest={
                    row.metric.id === 'CRITICAL_PATH_TEST' ? criticalPathTest : undefined
                  }
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
  onActivateActivity,
  onRecalculate,
  onOpenBaselines,
  criticalPathTest,
}: {
  row: HealthRowView;
  offenderCap: number;
  onActivateActivity: (offender: HealthOffender) => void;
  onRecalculate?: (() => void) | undefined;
  onOpenBaselines?: (() => void) | undefined;
  criticalPathTest?: ScheduleHealthPanelProps['criticalPathTest'];
}): React.ReactElement {
  const { metric } = row;
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const metaId = useId();
  const Icon = TONE_ICONS[row.tone];
  const hasDisclosure = metric.offenders.length > 0;
  const hasMeta = row.measuredLabel !== null || row.thresholdLabel !== null;
  const remedyAction =
    row.remedy === 'RECALCULATE'
      ? onRecalculate
      : row.remedy === 'CAPTURE_BASELINE'
        ? onOpenBaselines
        : undefined;

  return (
    <li className="border-border rounded-md border px-2 py-1.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {hasDisclosure ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailId}
            // The measured/threshold sentence below is the button's DESCRIPTION, not adjacency —
            // a Tab-sweeping screen-reader user otherwise hears only "name, verdict" and never the
            // two facts triage runs on (the spec's own §a11y requirement; ADR-0094 M5's rule that
            // the numbers never ride only a visual sibling). The M5 accessibility review caught
            // the unlinked form.
            aria-describedby={hasMeta ? metaId : undefined}
            onClick={() => setExpanded((v) => !v)}
            className="hover:bg-accent focus-visible:ring-ring -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left focus-visible:ring-2 focus-visible:outline-none"
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

      {hasMeta ? (
        <p id={metaId} className="text-muted-foreground pl-5 text-xs">
          {row.measuredLabel}
          {row.measuredLabel !== null && row.thresholdLabel !== null ? ' · judged against ' : null}
          {row.thresholdLabel !== null && row.measuredLabel === null ? 'judged against ' : null}
          {row.thresholdLabel}
        </p>
      ) : null}

      {row.caveatSentence !== null ? (
        <p className="text-muted-foreground pl-5 text-xs">{row.caveatSentence}</p>
      ) : null}

      {criticalPathTest !== undefined ? (
        <div className="space-y-1 pl-5">
          {/* Not native `disabled` while pending — a control that flips twice per press blurs to
              `<body>` and takes the accelerators with it (the ScopeSaveBar lesson); guard in the
              handler instead and say what is happening in the name. */}
          <Button
            variant="secondary"
            size="sm"
            aria-disabled={criticalPathTest.isPending}
            onClick={() => {
              if (!criticalPathTest.isPending) criticalPathTest.run();
            }}
            className="h-6 px-2 text-xs"
          >
            {criticalPathTest.isPending ? 'Running…' : 'Run critical path test'}
          </Button>
          {criticalPathTest.isError ? (
            <p className="text-muted-foreground text-xs">The test could not be run — try again.</p>
          ) : null}
        </div>
      ) : null}

      {row.reasonSentence !== null ? (
        <div className="space-y-1 pl-5">
          <p className="text-muted-foreground text-xs">{row.reasonSentence}</p>
          {/* A reader WITHOUT the remedy capability gets the route in words, never silence —
              ADR-0082's discriminator: this state is shut by role, so it is explained, not
              omitted. Omission is reserved for a remedy that does not exist at all. The M5 ux
              review caught the silent branch: a Viewer could not tell "nobody captured a
              baseline" from "I am not allowed to fix this", and the two calls to action differ. */}
          {remedyAction === undefined ? (
            row.remedy === null ? null : (
              <p className="text-muted-foreground text-xs">{REMEDY_ROLE_SENTENCES[row.remedy]}</p>
            )
          ) : (
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
          <ul className="space-y-0.5">
            {metric.offenders.map((offender) => (
              <li key={`${offender.kind}-${offender.id}`}>
                <button
                  type="button"
                  onClick={() => onActivateActivity(offender)}
                  className="hover:bg-accent focus-visible:ring-ring flex w-full min-w-0 items-baseline gap-2 rounded-md px-1 text-left text-xs focus-visible:ring-2 focus-visible:outline-none"
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
