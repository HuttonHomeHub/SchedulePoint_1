import type { ActivitySummary, DependencySummary } from '@repo/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useDeleteDependency, usePredecessors, useSuccessors } from '../api/use-dependencies';
import {
  DEPENDENCY_TYPE_LABELS,
  LAG_CALENDAR_LABELS,
  formatLag,
} from '../schemas/dependency-schemas';

import { AddDependencyDialog, type LinkDirection } from './AddDependencyDialog';
import { EditDependencyDialog } from './EditDependencyDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';

/** Pick the "other end" of a link relative to the activity the panel is about. */
type Endpoint = 'predecessor' | 'successor';

function DirectionTable({
  query,
  endpoint,
  caption,
  emptyLabel,
  onEdit,
  onRemove,
}: {
  query: UseQueryResult<DependencySummary[]>;
  endpoint: Endpoint;
  caption: string;
  emptyLabel: string;
  onEdit?: (dependency: DependencySummary) => void;
  onRemove?: (dependency: DependencySummary) => void;
}): React.ReactElement {
  const columns: Column<DependencySummary>[] = [
    {
      header: 'Activity',
      cell: (dep) => {
        const other = dep[endpoint];
        return (
          <span>
            {other.code ? (
              <span className="text-muted-foreground font-mono text-xs">{other.code} </span>
            ) : null}
            <span className="font-medium">{other.name}</span>
          </span>
        );
      },
    },
    { header: 'Type', cell: (dep) => DEPENDENCY_TYPE_LABELS[dep.type] },
    {
      header: 'Lag',
      cellClassName: 'whitespace-nowrap',
      cell: (dep) => (
        <span className="text-muted-foreground tabular-nums">
          {formatLag(dep.lagDays)}
          {dep.lagCalendar !== 'PROJECT_DEFAULT' ? (
            // Only surface the lag calendar when it's not the default — an elapsed (24h) wait
            // reads very differently from a working-day lag, so make it visible in the list.
            <span className="ml-1.5 not-italic">· {LAG_CALENDAR_LABELS[dep.lagCalendar]}</span>
          ) : null}
        </span>
      ),
    },
    {
      // The engine-owned driving flag (M3), in text so it isn't canvas-only: a driving link is
      // the binding tie that sets this activity's (or the successor's) start. The badge carries
      // the meaning in words, never colour alone (WCAG 1.3.1/1.4.1); empty when non-driving.
      header: 'Driving',
      cell: (dep) =>
        dep.isDriving ? (
          <Badge variant="neutral">Driving</Badge>
        ) : (
          <span className="text-muted-foreground" aria-hidden="true">
            —
          </span>
        ),
    },
  ];
  if (onEdit && onRemove) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (dep) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(dep)}
            aria-label={`Edit link to ${dep[endpoint].name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(dep)}
            aria-label={`Remove link to ${dep[endpoint].name}`}
          >
            Remove
          </Button>
        </div>
      ),
    });
  }

  return (
    <DataTable
      caption={caption}
      columns={columns}
      query={query}
      getRowKey={(dep) => dep.id}
      loadingLabel={`Loading ${caption.toLowerCase()}…`}
      errorLabel={`Couldn’t load ${caption.toLowerCase()}. Please try again.`}
      empty={
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {emptyLabel}
        </div>
      }
    />
  );
}

/**
 * The Logic panel for one activity — its predecessors (what must come before) and
 * successors (what it drives). Read for any member; Planners/Org Admins
 * (`canManageLogic`) also get add/edit/remove. Cycle, duplicate and self
 * rejections come back from the API and surface inline (the server owns the
 * acyclic guarantee). `activity` is optional so the dialog stays mounted (toggled
 * by `open`), preserving native focus-restore.
 */
export function DependencyEditor({
  orgSlug,
  planId,
  activity,
  planActivities,
  canManageLogic = false,
  open,
  onClose,
}: {
  orgSlug: string;
  planId: string;
  activity?: ActivitySummary;
  /** The plan's activities, for the add picker (self is excluded here). */
  planActivities?: ActivitySummary[];
  canManageLogic?: boolean;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const activityId = activity?.id ?? '';
  const enabled = open && activity !== undefined;
  const predecessors = usePredecessors(orgSlug, activityId, enabled);
  const successors = useSuccessors(orgSlug, activityId, enabled);
  const deleteDependency = useDeleteDependency(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);

  const [adding, setAdding] = useState<LinkDirection | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const others = activity
    ? (planActivities ?? []).filter((candidate) => candidate.id !== activity.id)
    : [];

  // Look the edit/remove targets up by id from the live query each render, so a
  // 409 retry (after a concurrent edit) carries the refreshed version, not a
  // stale snapshot (matches ActivitiesTable / ClientsTable).
  const links = [...(predecessors.data ?? []), ...(successors.data ?? [])];
  const byId = (id: string | null): DependencySummary | undefined =>
    id ? links.find((link) => link.id === id) : undefined;
  const editing = byId(editingId);
  const removing = byId(removingId);

  const editHandlers = canManageLogic
    ? {
        onEdit: (dep: DependencySummary) => setEditingId(dep.id),
        onRemove: (dep: DependencySummary) => {
          setRemoveError(null);
          setRemovingId(dep.id);
        },
      }
    : {};

  const confirmRemove = (): void => {
    if (!removing) return;
    deleteDependency.mutate(removing.id, {
      onSuccess: () => {
        // Close the confirm dialog synchronously before moving focus: while the
        // native <dialog> is still modal, focusing an element outside it is a
        // no-op and focus would fall to <body> once the removed row unmounts on
        // refetch (see ClientsTable). The region lives inside the Logic dialog.
        flushSync(() => {
          setRemovingId(null);
          setRemoveError(null);
        });
        announce('Dependency removed.');
        regionRef.current?.focus();
      },
      onError: (err) => setRemoveError(err.message),
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        size="lg"
        title={activity ? `Logic for ${activity.name}` : 'Logic'}
        description="The predecessors and successors that link this activity into the schedule."
      >
        <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-6 outline-none">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-medium">Predecessors</h3>
              {canManageLogic ? (
                <Button variant="outline" size="sm" onClick={() => setAdding('predecessor')}>
                  Add predecessor
                </Button>
              ) : null}
            </div>
            <DirectionTable
              query={predecessors}
              endpoint="predecessor"
              caption="Predecessors"
              emptyLabel="No predecessors — nothing has to finish before this activity."
              {...editHandlers}
            />
          </section>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-medium">Successors</h3>
              {canManageLogic ? (
                <Button variant="outline" size="sm" onClick={() => setAdding('successor')}>
                  Add successor
                </Button>
              ) : null}
            </div>
            <DirectionTable
              query={successors}
              endpoint="successor"
              caption="Successors"
              emptyLabel="No successors — this activity doesn’t drive anything yet."
              {...editHandlers}
            />
          </section>
        </div>
      </Dialog>

      {canManageLogic ? (
        <>
          <AddDependencyDialog
            orgSlug={orgSlug}
            planId={planId}
            direction={adding ?? 'predecessor'}
            options={others}
            open={adding !== null}
            onClose={() => setAdding(null)}
            {...(activity ? { anchor: activity } : {})}
          />
          <EditDependencyDialog
            orgSlug={orgSlug}
            open={editing !== undefined}
            onClose={() => setEditingId(null)}
            {...(editing ? { dependency: editing } : {})}
          />
          <ConfirmDialog
            open={removing !== undefined}
            onClose={() => {
              setRemovingId(null);
              setRemoveError(null);
            }}
            onConfirm={confirmRemove}
            title="Remove dependency"
            description={
              removing
                ? `Remove the link ${removing.predecessor.name} → ${removing.successor.name}?`
                : ''
            }
            confirmLabel="Remove"
            pending={deleteDependency.isPending}
            pendingLabel="Removing…"
            error={removeError}
          />
        </>
      ) : null}
    </>
  );
}
