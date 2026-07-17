import type { CalendarSummary, ResourceSummary } from '@repo/types';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useDeleteResource, useResources } from '../api/use-resources';
import { RESOURCE_IN_USE, RESOURCE_KIND_LABELS } from '../schemas/resource-schemas';

import { ResourceFormDialog } from './ResourceFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ApiFetchError } from '@/lib/api/client';

/** Friendly message for a delete blocked because the resource is still assigned. */
function deleteErrorMessage(error: unknown): string {
  if (error instanceof ApiFetchError && error.status === 409) {
    const details = error.error.details as { reason?: string } | undefined;
    if (details?.reason === RESOURCE_IN_USE) {
      return 'Assigned to one or more activities. Unassign it before deleting.';
    }
  }
  return error instanceof Error
    ? error.message
    : 'Couldn’t delete this resource. Please try again.';
}

/**
 * The organisation's resources as a table (name, kind, code, calendar). Writers
 * (`canWrite`) get Edit + Delete; everyone else gets a read-only View. A delete
 * blocked because the resource is still assigned surfaces a friendly inline message.
 * The open target is looked up by id from the live query so a 409 retry carries the
 * current version. States come from the shared DataTable. The calendar library is
 * route-composed (like {@link ActivitiesTable}) so this feature stays dependency-free
 * of the calendars feature.
 */
export function ResourcesTable({
  orgSlug,
  canWrite,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
}: {
  orgSlug: string;
  canWrite: boolean;
  calendars?: CalendarSummary[];
  calendarsLoading?: boolean;
  calendarsError?: boolean;
}): React.ReactElement {
  const resources = useResources(orgSlug);
  const deleteResource = useDeleteResource(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const calendarNameById = useMemo(
    () => new Map(calendars.map((c) => [c.id, c.name])),
    [calendars],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ResourceSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editing = editingId ? resources.data?.find((r) => r.id === editingId) : undefined;

  const columns: Column<ResourceSummary>[] = [
    { header: 'Name', cell: (resource) => <span className="font-medium">{resource.name}</span> },
    { header: 'Kind', cell: (resource) => RESOURCE_KIND_LABELS[resource.kind] },
    {
      header: 'Code',
      cell: (resource) =>
        resource.code ? (
          <span className="font-mono text-xs">{resource.code}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Calendar',
      headClassName: 'hidden py-2 pr-4 font-medium md:table-cell',
      cellClassName: 'hidden py-2 pr-4 whitespace-nowrap md:table-cell',
      cell: (resource) => {
        if (!resource.calendarId) return <span className="text-muted-foreground">—</span>;
        const name = calendarNameById.get(resource.calendarId);
        if (name) return <span className="text-muted-foreground">{name}</span>;
        return (
          <span className="text-muted-foreground italic" title={resource.calendarId}>
            {calendarsLoading ? 'Loading…' : 'Unnamed'}
          </span>
        );
      },
    },
  ];
  columns.push({
    header: 'Actions',
    srHeader: true,
    headClassName: 'py-2 font-medium',
    cellClassName: 'py-2 text-right whitespace-nowrap',
    cell: (resource) =>
      canWrite ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(resource.id)}
            aria-label={`Edit ${resource.name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteError(null);
              setDeleting(resource);
            }}
            aria-label={`Delete ${resource.name}`}
          >
            Delete
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(resource.id)}
            aria-label={`View ${resource.name}`}
          >
            View
          </Button>
        </div>
      ),
  });

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    deleteResource.mutate(deleting.id, {
      onSuccess: () => {
        // Close the confirm dialog synchronously before moving focus (see CalendarsTable).
        flushSync(() => {
          setDeleting(null);
          setDeleteError(null);
        });
        announce(`Resource “${name}” deleted.`);
        regionRef.current?.focus();
      },
      onError: (err) => setDeleteError(deleteErrorMessage(err)),
    });
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <DataTable
        caption="Resources"
        columns={columns}
        query={resources}
        getRowKey={(resource) => resource.id}
        loadingLabel="Loading resources…"
        errorLabel="Couldn’t load resources. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No resources yet.{canWrite ? ' Add your first resource to the library.' : ''}
          </div>
        }
      />

      <ResourceFormDialog
        orgSlug={orgSlug}
        open={editing !== undefined}
        onClose={() => setEditingId(null)}
        readOnly={!canWrite}
        calendars={calendars}
        calendarsLoading={calendarsLoading}
        calendarsError={calendarsError}
        {...(editing ? { resource: editing } : {})}
      />
      {canWrite ? (
        <ConfirmDialog
          open={deleting !== null}
          onClose={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
          title="Delete resource"
          description={deleting ? `Delete “${deleting.name}”?` : ''}
          pending={deleteResource.isPending}
          pendingLabel="Deleting…"
          error={deleteError}
        />
      ) : null}
    </div>
  );
}
