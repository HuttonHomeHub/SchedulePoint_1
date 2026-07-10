import type { ActivitySummary } from '@repo/types';
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
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';

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
}: {
  orgSlug: string;
  planId: string;
  /** May create/edit/delete the definition (Planner/Org Admin). */
  canWrite: boolean;
  /** May report progress (Contributor upward). Planners also have it. */
  canReportProgress?: boolean;
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
      cell: (activity) => <span className="text-muted-foreground">{formatProgress(activity)}</span>,
    },
  ];
  if (canWrite || canReportProgress) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (activity) => (
        <div className="flex justify-end gap-2">
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

      {canReportProgress && reporting ? (
        <ActivityProgressDialog
          orgSlug={orgSlug}
          planId={planId}
          open
          onClose={() => setProgressId(null)}
          activity={reporting}
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
