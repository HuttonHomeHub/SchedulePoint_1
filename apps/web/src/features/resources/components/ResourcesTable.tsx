import {
  ARCHIVED_FILTERS,
  RESOURCE_KINDS,
  type ArchivedFilter,
  type CalendarSummary,
  type ResourceKind,
  type ResourceSummary,
} from '@repo/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import {
  useArchiveResource,
  useDeleteResource,
  useResources,
  useUnarchiveResource,
} from '../api/use-resources';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { LIBRARY_SCOPING_ENABLED } from '@/config/env';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ApiFetchError } from '@/lib/api/client';
import {
  ARCHIVED_BADGE,
  ARCHIVED_FILTER_LABELS,
  ARCHIVE_EXPLAINER,
  isArchivedRow,
} from '@/lib/library-filters';

/** The kind filter's "no filter" sentinel — `''` so it round-trips through a `<select>` value. */
const ANY_KIND = '';

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
 *
 * Behind `LIBRARY_SCOPING_ENABLED` it grows the ADR-0053 management layer: the §3 tree
 * rendering, and the §4 search (`?q=` over name OR code, debounced, server-side), kind and
 * archived filters, an `Archived` badge and per-row Archive / Unarchive. Archiving is **not**
 * deleting — every existing assignment survives and keeps scheduling, levelling and earning value
 * identically; only NEW assignments are refused. Flag-off none of it renders and the list requests
 * exactly today's URL.
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
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<ResourceKind | typeof ANY_KIND>(ANY_KIND);
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('exclude');
  // The request follows the SETTLED term, so a typing burst costs one round trip.
  const debouncedSearch = useDebouncedValue(search);
  // Flag-off no filter can leave its default, so this is the same query, key and URL as before.
  const resources = useResources(
    orgSlug,
    LIBRARY_SCOPING_ENABLED
      ? {
          q: debouncedSearch,
          archived: archivedFilter,
          ...(kindFilter === ANY_KIND ? {} : { kind: kindFilter }),
        }
      : {},
  );
  const deleteResource = useDeleteResource(orgSlug);
  const archiveResource = useArchiveResource(orgSlug);
  const unarchiveResource = useUnarchiveResource(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const kindFilterId = useId();
  const archivedFilterId = useId();
  const explainerId = useId();
  const calendarNameById = useMemo(
    () => new Map(calendars.map((c) => [c.id, c.name])),
    [calendars],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ResourceSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const editing = editingId ? resources.data?.find((r) => r.id === editingId) : undefined;

  const filtersActive =
    LIBRARY_SCOPING_ENABLED &&
    (search.trim() !== '' || kindFilter !== ANY_KIND || archivedFilter !== 'exclude');

  const clearFilters = (): void => {
    setSearch('');
    setKindFilter(ANY_KIND);
    setArchivedFilter('exclude');
  };

  // Resource tree (ADR-0053 §3). With the flag ON the flat library is re-ordered depth-first and
  // each row carries its nesting depth; with it OFF every row is depth 0 in the server's own order
  // — byte-for-byte today's table. Derived from the `parentId` each row already carries (the
  // library query pages the whole library), so there is no second request.
  //
  // WHILE A FILTER IS ACTIVE the rows are deliberately FLAT. A filtered result set is a set of
  // matches, not a subtree: nesting a match under a parent the server did not return would draw a
  // tree that is missing its own branches — indentation that means nothing, or worse, means
  // something false. The `Group` column still names each match's parent in text, so the hierarchy
  // is never lost, only un-drawn.
  const rows = useMemo<ResourceTreeRow[]>(() => {
    const data = resources.data ?? [];
    if (!LIBRARY_SCOPING_ENABLED || filtersActive) {
      return data.map((resource) => ({ resource, depth: 0 }));
    }
    return toResourceTreeRows(data);
  }, [resources.data, filtersActive]);
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

  const toggleArchived = (resource: ResourceSummary): void => {
    setArchiveError(null);
    const archived = isArchivedRow(resource);
    const mutation = archived ? unarchiveResource : archiveResource;
    mutation.mutate(
      { resourceId: resource.id, version: resource.version },
      {
        onSuccess: () =>
          announce(
            archived
              ? `Resource “${resource.name}” unarchived. It is available in the pickers again.`
              : `Resource “${resource.name}” archived. It is hidden from the pickers; every existing assignment keeps scheduling unchanged.`,
          ),
        onError: (error) =>
          setArchiveError(
            error instanceof Error
              ? error.message
              : 'Couldn’t change this resource’s archive state. Please try again.',
          ),
      },
    );
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
          {LIBRARY_SCOPING_ENABLED && isArchivedRow(resource) ? (
            <Badge size="sm">{ARCHIVED_BADGE}</Badge>
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
          {/* Always-visible row actions (never hover-only, docs/UX_STANDARDS.md "Row / node
              actions"), matching the Edit/Delete idiom this table already uses. */}
          {LIBRARY_SCOPING_ENABLED ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleArchived(resource)}
              aria-label={`${isArchivedRow(resource) ? 'Unarchive' : 'Archive'} ${resource.name}`}
            >
              {isArchivedRow(resource) ? 'Unarchive' : 'Archive'}
            </Button>
          ) : null}
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
      {LIBRARY_SCOPING_ENABLED ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor={searchId}>Search resources</Label>
              <Input
                id={searchId}
                type="search"
                autoComplete="off"
                placeholder="Search by name or code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex max-w-xs flex-col gap-1.5">
              <Label htmlFor={kindFilterId}>Kind</Label>
              <Select
                id={kindFilterId}
                value={kindFilter}
                onChange={(event) =>
                  setKindFilter(event.target.value as ResourceKind | typeof ANY_KIND)
                }
              >
                <option value={ANY_KIND}>All kinds</option>
                {RESOURCE_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {RESOURCE_KIND_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex max-w-xs flex-col gap-1.5">
              <Label htmlFor={archivedFilterId}>Show archived</Label>
              <Select
                id={archivedFilterId}
                value={archivedFilter}
                aria-describedby={explainerId}
                onChange={(event) => setArchivedFilter(event.target.value as ArchivedFilter)}
              >
                {ARCHIVED_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {ARCHIVED_FILTER_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p id={explainerId} className="text-muted-foreground text-sm">
            {ARCHIVE_EXPLAINER}
            {filtersActive
              ? ' While a filter is active the list is flat — the Group column still names each match’s group.'
              : ''}
          </p>
          {archiveError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {archiveError}
            </p>
          ) : null}
        </div>
      ) : null}

      <DataTable
        caption="Resources"
        columns={columns}
        query={treeQuery}
        getRowKey={({ resource }) => resource.id}
        loadingLabel="Loading resources…"
        errorLabel="Couldn’t load resources. Please try again."
        empty={
          filtersActive ? (
            <div className="border-border rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground text-sm">No resources match these filters.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              No resources yet.{canWrite ? ' Add your first resource to the library.' : ''}
            </div>
          )
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
