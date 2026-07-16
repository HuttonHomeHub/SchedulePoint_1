import type { ActivitySummary, BaselineVarianceRow, CalendarSummary } from '@repo/types';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useActivities, useDeleteActivity } from '../api/use-activities';
import {
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  isMilestoneType,
} from '../schemas/activity-schemas';

import { ActivityFormDialog } from './ActivityFormDialog';
import { ActivityProgressDialog } from './ActivityProgressDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ACTIVITY_CALENDAR_ENABLED } from '@/config/env';
import { formatConstraint } from '@/lib/constraint-format';
import { formatCalendarDate } from '@/lib/format-date';
import {
  criticality,
  formatDayVariance,
  formatFloat,
  type FinishVariance,
  type VarianceField,
} from '@/lib/schedule-format';

/** Tone → text colour for a finish-variance cell. Text carries the meaning; colour reinforces. */
const VARIANCE_TONE_CLASS: Record<FinishVariance['tone'], string> = {
  behind: 'text-destructive-text',
  ahead: 'text-foreground',
  onTrack: 'text-muted-foreground',
  neutral: 'text-muted-foreground',
};

/** "5 d" for a task; an em dash for a milestone (which has no duration). */
function formatDuration(activity: ActivitySummary): string {
  return isMilestoneType(activity.type) ? '—' : `${activity.durationDays} d`;
}

/** Status label, plus the percentage while an activity is partway through. */
function formatProgress(activity: ActivitySummary): string {
  const label = ACTIVITY_STATUS_LABELS[activity.status];
  return activity.status === 'IN_PROGRESS' ? `${label} · ${activity.percentComplete}%` : label;
}

/**
 * A read-only computed-date column. Renders the calendar day (em dash when the
 * plan hasn't been calculated) and hides below the given breakpoint to keep the
 * table legible on narrow screens.
 */
function scheduleColumn(
  header: string,
  get: (activity: ActivitySummary) => string | null,
  hideBelow: 'md' | 'lg',
): Column<ActivitySummary> {
  const show = hideBelow === 'md' ? 'md:table-cell' : 'lg:table-cell';
  return {
    header,
    headClassName: `hidden py-2 pr-4 font-medium ${show}`,
    cellClassName: `hidden py-2 pr-4 whitespace-nowrap tabular-nums text-muted-foreground ${show}`,
    cell: (activity) => formatCalendarDate(get(activity)),
  };
}

/**
 * A plan's activities as a table (code, name, type, duration, progress).
 * Edit/Delete render only for writers; delete is a soft delete confirmed first.
 * The edit target is looked up by id from the live query so a 409 retry carries
 * the current version. States come from the shared DataTable.
 */
export function ActivitiesTable({
  orgSlug,
  planId,
  canWrite,
  canReportProgress = false,
  onOpenLogic,
  varianceByActivityId,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
}: {
  orgSlug: string;
  planId: string;
  /** May create/edit/delete the definition (Planner/Org Admin). */
  canWrite: boolean;
  /** May report progress (Contributor upward). Planners also have it. */
  canReportProgress?: boolean;
  /** Open the logic (predecessors/successors) panel for a row. Available to any
   * member (read); the host owns the panel so this feature stays dependency-free. */
  onOpenLogic?: (activity: ActivitySummary) => void;
  /**
   * Per-activity variance vs the plan's active baseline, keyed by activity id. When
   * present (the plan has an active baseline), a "Baseline finish" column is shown. The
   * route composes this from the baselines feature, so activities stays dependency-free
   * (a shared `@repo/types` shape, no cross-feature import).
   */
  varianceByActivityId?: ReadonlyMap<string, BaselineVarianceRow>;
  /**
   * The org's calendars (ADR-0037), route-composed like `varianceByActivityId` — used to name an
   * activity's own calendar in the "Calendar" column (shown only when `ACTIVITY_CALENDAR_ENABLED`)
   * and threaded into the edit dialog's picker. A shared `@repo/types` shape, so activities stays
   * dependency-free of the calendars feature.
   */
  calendars?: CalendarSummary[];
  /** The calendars list is still loading (an assigned calendar reads "Loading…", not "inherit"). */
  calendarsLoading?: boolean;
  /** The calendars list failed to load — forwarded to the edit dialog's picker to surface it. */
  calendarsError?: boolean;
}): React.ReactElement {
  const activities = useActivities(orgSlug, planId);
  const deleteActivity = useDeleteActivity(orgSlug, planId);
  const calendarNameById = useMemo(
    () => new Map(calendars.map((c) => [c.id, c.name])),
    [calendars],
  );
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [progressId, setProgressId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ActivitySummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editing = editingId ? activities.data?.find((a) => a.id === editingId) : undefined;
  const reporting = progressId ? activities.data?.find((a) => a.id === progressId) : undefined;

  const columns: Column<ActivitySummary>[] = [
    {
      header: 'Code',
      cell: (activity) =>
        activity.code ? (
          <span className="font-mono text-xs">{activity.code}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { header: 'Name', cell: (activity) => <span className="font-medium">{activity.name}</span> },
    { header: 'Type', cell: (activity) => ACTIVITY_TYPE_LABELS[activity.type] },
    {
      header: 'Duration',
      cellClassName: 'whitespace-nowrap tabular-nums',
      cell: (activity) => <span className="text-muted-foreground">{formatDuration(activity)}</span>,
    },
    {
      header: 'Progress',
      cellClassName: 'tabular-nums',
      cell: (activity) => <span className="text-muted-foreground">{formatProgress(activity)}</span>,
    },
    // A set date constraint (the definition a planner enters), so it's visible without opening
    // each row. The shorthand ("SNET · 01 May 2026") carries the meaning in text (never colour,
    // WCAG 1.4.1); the full label is the accessible name. Hidden below `lg` like the late-date
    // columns to keep narrow screens legible — the edit dialog still shows it there.
    {
      header: 'Constraint',
      headClassName: 'hidden py-2 pr-4 font-medium lg:table-cell',
      cellClassName: 'hidden py-2 pr-4 whitespace-nowrap lg:table-cell',
      cell: (activity) => {
        const constraint = formatConstraint(activity);
        // `aria-label` on a plain span (role generic) isn't reliably honoured; instead show the
        // shorthand visually (aria-hidden) with the spelled-out label in an sr-only node — the
        // same visible-glyph + hidden-text pattern the diagram legend uses. `title` = hover.
        return constraint ? (
          <span className="text-muted-foreground" title={constraint.full}>
            <span aria-hidden="true">{constraint.short}</span>
            <span className="sr-only">{constraint.full}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    // An activity's own working-time calendar (ADR-0037), only when the picker feature is on. An em
    // dash means "inherits the plan's calendar" — so a row that HAS a calendar must never fall back
    // to one: while the library is still loading it reads "Loading…", and if that fetch fails/omits
    // it "Unnamed" (with the id as a title), keeping the assigned case visibly distinct from a
    // genuine inherit. Conditional spread (not a post-hoc splice) so its position can't silently
    // drift. Hidden below `lg` like the other definition detail columns.
    ...(ACTIVITY_CALENDAR_ENABLED
      ? [
          {
            header: 'Calendar',
            headClassName: 'hidden py-2 pr-4 font-medium lg:table-cell',
            cellClassName: 'hidden py-2 pr-4 whitespace-nowrap lg:table-cell',
            cell: (activity: ActivitySummary) => {
              if (!activity.calendarId) return <span className="text-muted-foreground">—</span>;
              const name = calendarNameById.get(activity.calendarId);
              if (name) return <span className="text-muted-foreground">{name}</span>;
              return (
                <span className="text-muted-foreground italic" title={activity.calendarId}>
                  {calendarsLoading ? 'Loading…' : 'Unnamed'}
                </span>
              );
            },
          } satisfies Column<ActivitySummary>,
        ]
      : []),
    // Engine-owned computed columns (M6, read-only). Null renders as an em dash
    // until the plan is recalculated. Late dates hide first on narrow screens.
    scheduleColumn('Early start', (a) => a.earlyStart, 'md'),
    scheduleColumn('Early finish', (a) => a.earlyFinish, 'md'),
    scheduleColumn('Late start', (a) => a.lateStart, 'lg'),
    scheduleColumn('Late finish', (a) => a.lateFinish, 'lg'),
    {
      header: 'Float',
      cellClassName: 'py-2 pr-4 whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (activity) => formatFloat(activity.totalFloat),
    },
    {
      header: 'Critical path',
      cellClassName: 'py-2 pr-4 whitespace-nowrap',
      cell: (activity) => {
        const flag = criticality(activity);
        return flag ? (
          <Badge variant={flag.variant}>{flag.label}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
  ];
  // Variance vs the active baseline — only when the route supplies the map (M7). The
  // text carries the meaning ("3 d behind"/"ahead"); the tone colour merely reinforces.
  // Finish variance is the headline (always shown); start/float variance hide first on
  // narrow screens, mirroring the early/late date columns.
  if (varianceByActivityId) {
    const varianceColumn = (
      header: string,
      field: VarianceField,
      hideBelow?: 'lg',
    ): Column<ActivitySummary> => {
      const show = hideBelow ? ` hidden ${hideBelow}:table-cell` : '';
      return {
        header,
        headClassName: `py-2 pr-4 font-medium${show}`,
        cellClassName: `py-2 pr-4 whitespace-nowrap tabular-nums${show}`,
        cell: (activity) => {
          const row = varianceByActivityId.get(activity.id);
          if (!row) return <span className="text-muted-foreground">—</span>;
          const variance = formatDayVariance(row, field);
          return <span className={VARIANCE_TONE_CLASS[variance.tone]}>{variance.text}</span>;
        },
      };
    };
    columns.push(
      varianceColumn('Start variance', 'start', 'lg'),
      varianceColumn('Finish variance', 'finish'),
      varianceColumn('Float variance', 'float', 'lg'),
    );
  }
  if (canWrite || canReportProgress || onOpenLogic) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (activity) => (
        <div className="flex justify-end gap-2">
          {onOpenLogic ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenLogic(activity)}
              aria-label={`Logic for ${activity.name}`}
            >
              Logic
            </Button>
          ) : null}
          {canReportProgress ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProgressId(activity.id)}
              aria-label={`Report progress for ${activity.name}`}
            >
              Progress
            </Button>
          ) : null}
          {canWrite ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingId(activity.id)}
                aria-label={`Edit ${activity.name}`}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteError(null);
                  setDeleting(activity);
                }}
                aria-label={`Delete ${activity.name}`}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      ),
    });
  }

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    deleteActivity.mutate(deleting.id, {
      onSuccess: () => {
        // Close the dialog synchronously before moving focus (see ClientsTable).
        flushSync(() => {
          setDeleting(null);
          setDeleteError(null);
        });
        announce(`Activity “${name}” deleted.`);
        regionRef.current?.focus();
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <DataTable
        caption="Activities"
        columns={columns}
        query={activities}
        getRowKey={(activity) => activity.id}
        loadingLabel="Loading activities…"
        errorLabel="Couldn’t load activities. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No activities yet.{canWrite ? ' Add the first activity to this plan.' : ''}
          </div>
        }
      />

      {canReportProgress ? (
        <ActivityProgressDialog
          orgSlug={orgSlug}
          planId={planId}
          open={reporting !== undefined}
          onClose={() => setProgressId(null)}
          {...(reporting ? { activity: reporting } : {})}
        />
      ) : null}

      {canWrite ? (
        <>
          <ActivityFormDialog
            orgSlug={orgSlug}
            planId={planId}
            open={editing !== undefined}
            onClose={() => setEditingId(null)}
            calendars={calendars}
            calendarsLoading={calendarsLoading}
            calendarsError={calendarsError}
            {...(editing ? { activity: editing } : {})}
          />
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            onConfirm={confirmDelete}
            title="Delete activity"
            description={deleting ? `Delete “${deleting.name}”? You can restore it later.` : ''}
            pending={deleteActivity.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
        </>
      ) : null}
    </div>
  );
}
