import type { ClientSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useClients, useDeleteClient } from '../api/use-clients';

import { ClientFormDialog } from './ClientFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { MenuItem } from '@/components/ui/menu';
import { SectionCard } from '@/components/ui/page';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { SearchField } from '@/components/ui/search-field';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useResultCountAnnouncement } from '@/hooks/use-result-count-announcement';
import { deleteCascadeWarning } from '@/lib/delete-copy';
import { formatTimestamp } from '@/lib/format-date';

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

  // A debounced search that silently reshapes the table is invisible to a screen-reader user
  // (WCAG 4.1.3). Both sibling library tables have announced their settled count since ADR-0053 M6
  // and this one did not — one correct pattern applied to a control and not its neighbour, inside
  // the epic whose subject is exactly that, found by the M8 accessibility gate.
  useResultCountAnnouncement({
    pending: clients.isPending || clients.isFetching,
    count: clients.data?.length ?? 0,
    filterKey: debouncedSearch,
    noun: 'client',
    emptyMessage: 'No clients match this search.',
  });

  /**
   * **Focus goes to the list, because the list is what the press produced.**
   *
   * The empty state's `Clear filters` removes itself by succeeding — rows return, the empty state
   * unmounts, and focus falls to `<body>`, which on this screen silently ends keyboard navigation.
   * That is the failure this table's own docblocks name four times about the *bar* button, and the
   * reasoning had never been applied to the *empty-state* one, which is the copy that actually has
   * it. The region is always mounted and `tabIndex={-1}`, so it is a destination rather than a
   * guess.
   */
  const clearSearchAndFocusList = (): void => {
    setSearch('');
    regionRef.current?.focus();
  };

  const editing = editingId ? clients.data?.find((client) => client.id === editingId) : undefined;

  const columns: Column<ClientSummary>[] = [
    {
      header: 'Name',
      /**
       * **`auto` is declared, not inherited** (ADR-0146 D3). It is also the default, which is why
       * the rule exists: a rule whose exception is its default is vacuous unless somebody writes
       * the exception down. It only starts to bite the moment a `fit` column sits beside it —
       * `Created`, below — because `fit` takes exactly what its content needs and the surplus it
       * surrenders has to come from a column that will absorb it.
       */
      width: 'auto',
      /**
       * **`Description` is a secondary line under the name, not a column** (ADR-0146 D4).
       *
       * It was a column, and on the deployed installation every cell in it read "—". A column is a
       * static property of a screen and an absence is a property of a row, so a field most rows do
       * not carry spends width on every row to say nothing — while the columns beside it wrapped.
       * Moving it under the subject keeps it exactly where a reader looks for it and costs nothing
       * when it is absent.
       *
       * **Rendered only when present.** A secondary line reading "—" would be the same defect one
       * row lower, which is the trap in this whole rule.
       */
      cell: (client) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link
            to="/orgs/$orgSlug/clients/$clientId"
            params={{ orgSlug, clientId: client.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {client.name}
          </Link>
          {client.description ? (
            <span className="text-muted-foreground text-xs">{client.description}</span>
          ) : null}
        </span>
      ),
    },
    {
      header: 'Created',
      /**
       * **Already on the wire and never rendered.** `ClientSummary.createdAt` has been in the
       * payload throughout; `docs/specs/page-composition/feature-spec.md` §1.2.9 noted it while
       * diagnosing Members' identical sparseness, and M1–M8 fixed Members and never came back.
       *
       * Measured before it was added (`m1/README.md` §2): after ADR-0146 D4 moved the description
       * under the name, this table rendered `Name` at 870px for 177px of content and `Actions` at
       * 401px for 82px, inside 1271px — **1012px of slack, 80% of the row empty**, with a
       * `factSpread` of literally `0`. A name at one end and an `Edit ⋯` at the other is the most
       * literal instance in the product of the complaint the page-composition epic was opened on.
       *
       * `fit`, on the `Joined` precedent one screen over: a date is bounded and must never be the
       * column that breaks. And through the shared `formatTimestamp` rather than a per-render
       * `Intl.DateTimeFormat`, which ADR-0144's gate pass records as a real defect — a date beside
       * a date, one in the browser's locale and one in en-GB.
       *
       * **Withdrawn rather than declared `auto` if it cannot fit** (`falsification.md`, FC-A): a
       * date wrapping over two lines reads as two dates, which is worse than not showing it.
       */
      width: 'fit',
      cell: (client) => (
        <span className="text-muted-foreground">{formatTimestamp(client.createdAt)}</span>
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
    /**
     * **The rows sit in a named section, and the section states how many there are.**
     *
     * Three of this product's list screens had no frame at all — the table sat directly on the page
     * background while the organisation landing put everything in a card, which is most of why they
     * "felt different" (ADR-0146 D2). The section is named for what it holds rather than repeating
     * the page's own `<h1>`: two headings saying the same word is the defect ADR-0143 records on
     * the plan workspace's foot, and a landmark called "All clients" tells a reader something the
     * page title has already told them once.
     *
     * **`count` is passed here and withheld on the audit screens**, and the difference is not
     * stylistic: this query is `apiFetchAllPages`, so `data.length` IS the total. The audit log and
     * My activity are `useInfiniteQuery` behind a "Load more", where the same expression means
     * "how many are loaded" — a number that would read as a total and be wrong by however much
     * history the reader has not asked for yet. ADR-0098's rule, one noun along: omitted, never
     * approximated.
     */
    <SectionCard title="All clients" count={clients.data?.length} flush>
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
                  onClick={clearSearchAndFocusList}
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
    </SectionCard>
  );
}
