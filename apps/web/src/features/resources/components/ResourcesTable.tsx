import type { CalendarSummary, ResourceSummary } from '@repo/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useDeleteResource, useResources } from '../api/use-resources';
import {
  RESOURCE_IN_USE,
  RESOURCE_KIND_LABELS,
  isResourceGroup,
  toResourceTreeRows,
  type ResourceTreeRow,
} from '../schemas/resource-schemas';

import { ResourceFormDialog } from './ResourceFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { LIBRARY_SCOPING_ENABLED } from '@/config/env';
import { ApiFetchError } from '@/lib/api/client';

/** Friendly message for a delete blocked because the resource is still assigned. */
function deleteErrorMessage(error: unknown): string {
  if (error instanceof ApiFetchError && error.status === 409) {
    const details = error.error.details as
      { reason?: string; count?: number; subtreeSize?: number } | undefined;
    if (details?.reason === RESOURCE_IN_USE) {
      // A group's 409 spans its whole subtree (ADR-0053 §3), so the message must say where to
      // look — "this resource is assigned" would be actively misleading for an empty-looking group.
      if ((details.subtreeSize ?? 1) > 1) {
        const count = details.count ?? 0;
        return `${count} ${count === 1 ? 'resource' : 'resources'} in this group ${
          count === 1 ? 'is' : 'are'
        } still assigned. Unassign them before deleting.`;
      }
      return 'Assigned to one or more activities. Unassign it before deleting.';
    }
    if (details?.reason === 'RESOURCE_GROUP_HAS_CHILDREN') {
      return 'Move the resources out of this group first.';
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

  // Resource tree (ADR-0053 §3). With the flag ON the flat library is re-ordered depth-first and
  // each row carries its nesting depth; with it OFF every row is depth 0 in the server's own order
  // — byte-for-byte today's table. Derived from the `parentId` each row already carries (the
  // library query pages the whole library), so there is no second request.
  const rows = useMemo<ResourceTreeRow[]>(() => {
    const data = resources.data ?? [];
    if (!LIBRARY_SCOPING_ENABLED) return data.map((resource) => ({ resource, depth: 0 }));
    return toResourceTreeRows(data);
  }, [resources.data]);
  // The parent group's name per row, for the read-only Group column — resolved from the loaded
  // list, mirroring how `ActivitiesTable` resolves its WBS parent label (no extra fetch).
  const groupNameById = useMemo(
    () => new Map((resources.data ?? []).map((r) => [r.id, r.name])),
    [resources.data],
  );
  // Feed the shared DataTable the derived rows while keeping the query's own loading/error/empty
  // states, so all four states stay identical to every other library screen.
  const treeQuery: Pick<
    UseQueryResult<ResourceTreeRow[]>,
    'isPending' | 'isError' | 'data' | 'refetch'
  > = {
    isPending: resources.isPending,
    isError: resources.isError,
    data: rows,
    // The retry button re-runs the underlying library query; only the row SHAPE is derived here,
    // so the refetch result is deliberately discarded rather than re-typed.
    refetch: async () => {
      const result = await resources.refetch();
      return { ...result, data: undefined } as unknown as Awaited<
        ReturnType<UseQueryResult<ResourceTreeRow[]>['refetch']>
      >;
    },
  };

  const columns: Column<ResourceTreeRow>[] = [
    {
      header: 'Name',
      cell: ({ resource, depth }) => (
        <span className="flex items-center gap-2">
          {/* Indentation is decorative — the Group column below carries the same relationship in
              text, so nesting is never conveyed by layout alone (WCAG 2.2). */}
          {depth > 0 ? (
            <span aria-hidden="true" style={{ width: `${depth * 1.25}rem` }} className="shrink-0" />
          ) : null}
          <span className="font-medium">{resource.name}</span>
          {/* The Kind column already says "Group"; this badge carries the CONSEQUENCE, which is
              what a planner scanning the library actually needs to know (ADR-0053 §3). */}
          {LIBRARY_SCOPING_ENABLED && isResourceGroup(resource) ? (
            <Badge size="sm">Not assignable</Badge>
          ) : null}
        </span>
      ),
    },
    { header: 'Kind', cell: ({ resource }) => RESOURCE_KIND_LABELS[resource.kind] },
    {
      header: 'Code',
      cell: ({ resource }) =>
        resource.code ? (
          <span className="font-mono text-xs">{resource.code}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(LIBRARY_SCOPING_ENABLED
      ? [
          {
            header: 'Group',
            headClassName: 'hidden py-2 pr-4 font-medium lg:table-cell',
            cellClassName: 'hidden py-2 pr-4 whitespace-nowrap lg:table-cell',
            cell: ({ resource }: ResourceTreeRow) => {
              const parentName = resource.parentId
                ? groupNameById.get(resource.parentId)
                : undefined;
              return parentName ? (
                <span className="text-muted-foreground">{parentName}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              );
            },
          } satisfies Column<ResourceTreeRow>,
        ]
      : []),
    {
      header: 'Calendar',
      headClassName: 'hidden py-2 pr-4 font-medium md:table-cell',
      cellClassName: 'hidden py-2 pr-4 whitespace-nowrap md:table-cell',
      cell: ({ resource }) => {
        // A group has no calendar by construction (ADR-0053 §3) — say so rather than showing the
        // same "—" that means "inherits the plan calendar" for a real resource.
        if (LIBRARY_SCOPING_ENABLED && isResourceGroup(resource)) {
          return <span className="text-muted-foreground">Not scheduled</span>;
        }
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
    cell: ({ resource }) =>
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
        query={treeQuery}
        getRowKey={({ resource }) => resource.id}
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
        // The library itself feeds the parent-group picker (ADR-0053 §3) — already loaded here.
        resources={resources.data ?? []}
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
