import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { useRef, useState } from 'react';
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
import { formatCalendarDate } from '@/lib/format-date';
import {
  criticality,
  formatFinishVariance,
  formatFloat,
  type FinishVariance,
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
}): React.ReactElement {
  const activities = useActivities(orgSlug, planId);
  const deleteActivity = useDeleteActivity(orgSlug, planId);
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
  if (varianceByActivityId) {
    columns.push({
      header: 'Baseline finish',
      headClassName: 'hidden py-2 pr-4 font-medium md:table-cell',
      cellClassName: 'hidden py-2 pr-4 whitespace-nowrap tabular-nums md:table-cell',
      cell: (activity) => {
        const row = varianceByActivityId.get(activity.id);
        if (!row) return <span className="text-muted-foreground">—</span>;
        const variance = formatFinishVariance(row);
        return <span className={VARIANCE_TONE_CLASS[variance.tone]}>{variance.text}</span>;
      },
    });
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
