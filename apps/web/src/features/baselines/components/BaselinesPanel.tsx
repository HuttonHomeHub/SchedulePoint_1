import type { BaselineSummary } from '@repo/types';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useActivateBaseline, useBaselines, useDeleteBaseline } from '../api/use-baselines';

import { CreateBaselineDialog } from './CreateBaselineDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * A plan's baselines (M7, ADR-0025): name, active badge, when captured, the captured
 * project finish, and the frozen activity count. Writers (`canManage`, the plan-write
 * roles) get **Capture**, plus per-row **Activate** / **Delete**; everyone else reads.
 * Exactly one baseline is active — activating one deactivates the rest server-side, and
 * the list refetches. States come from the shared DataTable.
 */
export function BaselinesPanel({
  orgSlug,
  planId,
  canManage,
}: {
  orgSlug: string;
  planId: string;
  canManage: boolean;
}): React.ReactElement {
  const baselines = useBaselines(orgSlug, planId);
  const activate = useActivateBaseline(orgSlug, planId);
  const deleteBaseline = useDeleteBaseline(orgSlug, planId);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BaselineSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onActivate = (baseline: BaselineSummary): void => {
    if (baseline.isActive || activate.isPending) return;
    activate.mutate(baseline.id, {
      onSuccess: () => announce(`Baseline “${baseline.name}” is now active.`),
    });
  };

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    deleteBaseline.mutate(deleting.id, {
      onSuccess: () => {
        flushSync(() => {
          setDeleting(null);
          setDeleteError(null);
        });
        announce(`Baseline “${name}” deleted.`);
        regionRef.current?.focus();
      },
      onError: (err) =>
        setDeleteError(err instanceof Error ? err.message : 'Couldn’t delete this baseline.'),
    });
  };

  const columns: Column<BaselineSummary>[] = [
    {
      header: 'Name',
      cell: (b) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{b.name}</span>
          {b.isActive ? <Badge variant="neutral">Active</Badge> : null}
        </span>
      ),
    },
    { header: 'Captured', cell: (b) => formatCalendarDate(b.capturedAt.slice(0, 10)) },
    {
      header: 'Project finish',
      cell: (b) => formatCalendarDate(b.capturedProjectFinish),
    },
    {
      header: 'Activities',
      cellClassName: 'tabular-nums',
      cell: (b) => b.activityCount,
    },
  ];
  if (canManage) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (b) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={b.isActive || activate.isPending}
            onClick={() => onActivate(b)}
            aria-label={b.isActive ? `${b.name} is active` : `Activate ${b.name}`}
          >
            {b.isActive ? 'Active' : 'Activate'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteError(null);
              setDeleting(b);
            }}
            aria-label={`Delete ${b.name}`}
          >
            Delete
          </Button>
        </div>
      ),
    });
  }

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      {canManage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            Capture baseline
          </Button>
        </div>
      ) : null}

      <DataTable
        caption="Baselines"
        columns={columns}
        query={baselines}
        getRowKey={(b) => b.id}
        loadingLabel="Loading baselines…"
        errorLabel="Couldn’t load baselines. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No baselines yet.
            {canManage ? ' Capture one to freeze the current schedule as a plan of record.' : ''}
          </div>
        }
      />

      {canManage ? (
        <>
          <CreateBaselineDialog
            orgSlug={orgSlug}
            planId={planId}
            open={creating}
            onClose={() => setCreating(false)}
          />
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            onConfirm={confirmDelete}
            title="Delete baseline"
            description={
              deleting
                ? `Delete “${deleting.name}”?${deleting.isActive ? ' Variance will be hidden until another baseline is active.' : ''}`
                : ''
            }
            pending={deleteBaseline.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
        </>
      ) : null}
    </div>
  );
}
