import type { ClientSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useClients, useDeleteClient } from '../api/use-clients';

import { ClientFormDialog } from './ClientFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MenuItem } from '@/components/ui/menu';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { DataTable, type Column } from '@/components/ui/data-table';
import { SearchField } from '@/components/ui/search-field';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { deleteCascadeWarning } from '@/lib/delete-copy';
import { X } from 'lucide-react';

/**
 * The organisation's clients as a table. Each name links to the client's
 * projects. Edit/Delete render only for writers (`canWrite`); delete is a soft
 * cascade confirmed first. The edit target is looked up by id from the live
 * query, so after a 409 conflict the refetched (current) version is used on
 * retry. Loading/empty/error states come from the shared DataTable.
 */
export function ClientsTable({
  orgSlug,
  canWrite,
  filters,
  onFiltersChange,
}: {
  orgSlug: string;
  canWrite: boolean;
  /** The screen's URL-backed filters. Absent ⇒ the table renders unsearched, as it always did. */
  filters?: { q: string } | undefined;
  onFiltersChange?: ((patch: { q: string }) => void) | undefined;
}): React.ReactElement {
  const search = filters?.q ?? '';
  const setSearch = (q: string): void => onFiltersChange?.({ q });
  // The request is driven by the SETTLED term, so a typing burst costs one round trip; the input
  // renders `search` and stays instant. The same split the two library screens use.
  const debouncedSearch = useDebouncedValue(search);
  const clients = useClients(orgSlug, debouncedSearch);
  const searchId = useId();
  const filtered = search.trim() !== '';
  const deleteClient = useDeleteClient(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ClientSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editing = editingId ? clients.data?.find((client) => client.id === editingId) : undefined;

  const columns: Column<ClientSummary>[] = [
    {
      header: 'Name',
      cell: (client) => (
        <Link
          to="/orgs/$orgSlug/clients/$clientId"
          params={{ orgSlug, clientId: client.id }}
          className="font-medium underline-offset-4 hover:underline"
        >
          {client.name}
        </Link>
      ),
    },
    {
      header: 'Description',
      cell: (client) => <span className="text-muted-foreground">{client.description ?? '—'}</span>,
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
         deleting a client is two presses instead of one, which the product owner accepted on the
         grounds that the buried action is the destructive one and a moment's friction is cheapest
         there. */
      cell: (client) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(client.id)}
            aria-label={`Edit ${client.name}`}
          >
            Edit
          </Button>
          <RowActionsMenu subject={client.name} context="Clients">
            <MenuItem
              destructive
              onSelect={() => {
                setDeleteError(null);
                setDeleting(client);
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
    deleteClient.mutate(deleting.id, {
      onSuccess: () => {
        // Close the confirm dialog synchronously first: while the native
        // <dialog> is still modal, focusing an element outside it is a no-op and
        // focus would fall to <body> once the deleted row unmounts on refetch.
        flushSync(() => {
          setDeleting(null);
          setDeleteError(null);
        });
        announce(`Client “${name}” deleted.`);
        regionRef.current?.focus();
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      {onFiltersChange === undefined ? null : (
        <div className="flex flex-wrap items-end gap-3">
          <SearchField
            id={searchId}
            className="min-w-56 flex-1"
            label="Search clients"
            placeholder="Search by name"
            clearLabel="Clear client search"
            value={search}
            onChange={setSearch}
          />
          {/* Always rendered and shaded when there is nothing to clear — the shape M4 gave the two
              library bars, and the reason is the same: a control that removes itself by succeeding
              drops focus to `<body>` at the moment it is pressed. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-disabled={!filtered}
            onClick={() => {
              if (!filtered) return;
              setSearch('');
            }}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-4" />
            Clear filters
          </Button>
        </div>
      )}

      <DataTable
        caption="Clients"
        columns={columns}
        query={clients}
        getRowKey={(client) => client.id}
        loadingLabel="Loading clients…"
        errorLabel="Couldn’t load clients. Please try again."
        empty={
          filtered ? (
            // **A filtered-to-nothing list is a different fact from an empty organisation**, and
            // must never read as one — it says so, and offers the way back.
            <>
              <p className="text-muted-foreground text-sm">No clients match this search.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setSearch('')}
                // Named for its context: its twin in the bar above is always present, and two
                // buttons whose accessible name is the bare string are indistinguishable to a
                // reader who hears them (M4's finding, applied here on the day it was made).
                aria-label="Clear filters and show all clients"
              >
                Clear filters
              </Button>
            </>
          ) : (
            <>No clients yet.{canWrite ? ' Create your first client to get started.' : ''}</>
          )
        }
      />

      {canWrite ? (
        <>
          <ClientFormDialog
            orgSlug={orgSlug}
            open={editing !== undefined}
            onClose={() => setEditingId(null)}
            {...(editing ? { client: editing } : {})}
          />
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            onConfirm={confirmDelete}
            title="Delete client"
            description={deleting ? deleteCascadeWarning('client', deleting.name) : ''}
            pending={deleteClient.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
        </>
      ) : null}
    </div>
  );
}
