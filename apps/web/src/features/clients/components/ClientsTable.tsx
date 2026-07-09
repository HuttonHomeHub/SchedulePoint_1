import type { ClientSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { useClients, useDeleteClient } from '../api/use-clients';

import { ClientFormDialog } from './ClientFormDialog';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';

/**
 * The organisation's clients as a table. Each name links to the client's
 * projects. Edit/Delete actions render only for writers (`canWrite`); delete is
 * a soft cascade confirmed first. Covers loading, error, and empty states.
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
  const [editing, setEditing] = useState<ClientSummary | null>(null);
  const [deleting, setDeleting] = useState<ClientSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (clients.isPending) {
    return (
      <div className="p-6">
        <Spinner label="Loading clients…" />
      </div>
    );
  }

  if (clients.isError) {
    return (
      <p role="alert" className="text-destructive-text text-sm">
        Couldn&rsquo;t load clients. Please try again.
      </p>
    );
  }

  if (clients.data.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No clients yet.{canWrite ? ' Create your first client to get started.' : ''}
      </div>
    );
  }

  const confirmDelete = (): void => {
    if (!deleting) return;
    deleteClient.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setDeleteError(null);
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Clients</caption>
          <thead>
            <tr className="border-border text-muted-foreground border-b text-left">
              <th scope="col" className="py-2 pr-4 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Description
              </th>
              {canWrite ? (
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {clients.data.map((client) => (
              <tr key={client.id} className="border-border border-b">
                <td className="py-2 pr-4">
                  <Link
                    to="/orgs/$orgSlug/clients/$clientId"
                    params={{ orgSlug, clientId: client.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {client.name}
                  </Link>
                </td>
                <td className="text-muted-foreground py-2 pr-4">{client.description ?? '—'}</td>
                {canWrite ? (
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(client)}
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
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite ? (
        <>
          <ClientFormDialog
            orgSlug={orgSlug}
            open={editing !== null}
            onClose={() => setEditing(null)}
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
