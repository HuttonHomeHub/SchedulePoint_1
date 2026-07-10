import type { PlanSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useDeletePlan, usePlans } from '../api/use-plans';
import { PLAN_STATUS_LABELS } from '../schemas/plan-schemas';

import { PlanFormDialog } from './PlanFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * A project's plans as a table (name → plan detail, status, planned start).
 * Edit/Delete render only for writers; delete is a soft delete confirmed first.
 * The edit target is looked up by id from the live query so a 409 retry carries
 * the current version. States come from the shared DataTable.
 */
export function PlansTable({
  orgSlug,
  projectId,
  canWrite,
}: {
  orgSlug: string;
  projectId: string;
  canWrite: boolean;
}): React.ReactElement {
  const plans = usePlans(orgSlug, projectId);
  const deletePlan = useDeletePlan(orgSlug, projectId);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PlanSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editing = editingId ? plans.data?.find((plan) => plan.id === editingId) : undefined;

  const columns: Column<PlanSummary>[] = [
    {
      header: 'Name',
      cell: (plan) => (
        <Link
          to="/orgs/$orgSlug/plans/$planId"
          params={{ orgSlug, planId: plan.id }}
          className="font-medium underline-offset-4 hover:underline"
        >
          {plan.name}
        </Link>
      ),
    },
    { header: 'Status', cell: (plan) => PLAN_STATUS_LABELS[plan.status] },
    {
      header: 'Planned start',
      cell: (plan) => (
        <span className="text-muted-foreground">{formatCalendarDate(plan.plannedStart)}</span>
      ),
    },
  ];
  if (canWrite) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (plan) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(plan.id)}
            aria-label={`Edit ${plan.name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteError(null);
              setDeleting(plan);
            }}
            aria-label={`Delete ${plan.name}`}
          >
            Delete
          </Button>
        </div>
      ),
    });
  }

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    deletePlan.mutate(deleting.id, {
      onSuccess: () => {
        // Close the dialog synchronously before moving focus (see ClientsTable).
        flushSync(() => {
          setDeleting(null);
          setDeleteError(null);
        });
        announce(`Plan “${name}” deleted.`);
        regionRef.current?.focus();
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <DataTable
        caption="Plans"
        columns={columns}
        query={plans}
        getRowKey={(plan) => plan.id}
        loadingLabel="Loading plans…"
        errorLabel="Couldn’t load plans. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No plans yet.{canWrite ? ' Create the first plan for this project.' : ''}
          </div>
        }
      />

      {canWrite ? (
        <>
          <PlanFormDialog
            orgSlug={orgSlug}
            projectId={projectId}
            open={editing !== undefined}
            onClose={() => setEditingId(null)}
            {...(editing ? { plan: editing } : {})}
          />
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            onConfirm={confirmDelete}
            title="Delete plan"
            description={deleting ? `Delete “${deleting.name}”? You can restore it later.` : ''}
            pending={deletePlan.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
        </>
      ) : null}
    </div>
  );
}
