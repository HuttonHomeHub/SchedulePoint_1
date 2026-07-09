import type { ClientSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import { useClients, useDeleteClient } from '../api/use-clients';

import { ClientFormDialog } from './ClientFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';

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
}: {
  orgSlug: string;
  canWrite: boolean;
}): React.ReactElement {
  const clients = useClients(orgSlug);
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
      cell: (client) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(client.id)}
            aria-label={`Edit ${client.name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteError(null);
              setDeleting(client);
            }}
            aria-label={`Delete ${client.name}`}
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
    deleteClient.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setDeleteError(null);
        announce(`Client “${name}” deleted.`);
        // The deleted row (and its focused Delete button) unmounts on refetch;
        // move focus to a stable container rather than letting it fall to body.
        regionRef.current?.focus();
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <DataTable
        caption="Clients"
        columns={columns}
        query={clients}
        getRowKey={(client) => client.id}
        loadingLabel="Loading clients…"
        errorLabel="Couldn’t load clients. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No clients yet.{canWrite ? ' Create your first client to get started.' : ''}
          </div>
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
            description={
              deleting
                ? `Delete “${deleting.name}” and all its projects and plans? You can restore it later.`
                : ''
            }
            pending={deleteClient.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
        </>
      ) : null}
    </div>
  );
}
