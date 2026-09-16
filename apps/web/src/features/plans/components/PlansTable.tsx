import type { PlanSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useDeletePlan, usePlans } from '../api/use-plans';
import { PLAN_STATUS_LABELS } from '../schemas/plan-schemas';

import { PlanFormDialog } from './PlanFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { deleteCascadeWarning } from '@/lib/delete-copy';
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
    // A bounded column: a width preference stops `table-layout: auto` handing it slack it
    // does not want, which pushed a row's last fact away from its first (M4-T2).
    {
      header: 'Status',
      headClassName: 'py-2 pr-4 font-medium md:w-28',
      cell: (plan) => PLAN_STATUS_LABELS[plan.status],
    },
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
      /* **One row-action shape** (page-consistency M4): the primary action stays visible and the
         rest move behind a `⋯`, which is the shape ADR-0097 Landing F1 decided on the calendars
         table. Landing F asked "which tables are crowded?" and correctly answered "one", leaving
         this one alone; this epic asks a different question — "do these tables answer the same
         question three ways?" — and the answer was yes. The cost is stated rather than glossed:
         deleting a plan is two presses instead of one, which the product owner accepted on the
         grounds that the buried action is the destructive one and a moment's friction is cheapest
         there. */
      cell: (plan) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(plan.id)}
            aria-label={`Edit ${plan.name}`}
          >
            Edit
          </Button>
          <RowActionsMenu subject={plan.name}>
            <MenuItem
              destructive
              onSelect={() => {
                setDeleteError(null);
                setDeleting(plan);
              }}
            >
              Delete
            </MenuItem>
          </RowActionsMenu>
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
        empty={<>No plans yet.{canWrite ? ' Create the first plan for this project.' : ''}</>}
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
            description={deleting ? deleteCascadeWarning('plan', deleting.name) : ''}
            pending={deletePlan.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
        </>
      ) : null}
    </div>
  );
}
