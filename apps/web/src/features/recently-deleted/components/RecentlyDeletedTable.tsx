import type { DeletedHierarchyItem } from '@repo/types';
import { useRef, useState } from 'react';

import { useDeletedItems, useRestoreItem } from '../api/use-deleted-items';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { formatTimestamp } from '@/lib/format-date';

/** Human labels for each hierarchy level. */
const KIND_LABEL: Record<DeletedHierarchyItem['kind'], string> = {
  client: 'Client',
  project: 'Project',
  plan: 'Plan',
};

/**
 * The organisation's recycle bin as a table: soft-deleted clients, projects and
 * plans, newest-deleted first. Writers get a Restore action; an item whose
 * ancestor is still deleted can't be restored on its own (the top-down
 * invariant), so its row shows guidance to restore the parent first instead of a
 * button. Restore is non-destructive, so it acts directly (no confirm).
 */
export function RecentlyDeletedTable({
  orgSlug,
  canWrite,
}: {
  orgSlug: string;
  canWrite: boolean;
}): React.ReactElement {
  const deleted = useDeletedItems(orgSlug);
  const restore = useRestoreItem(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  // A set (not a single id) so two rows restored back-to-back each keep their own
  // pending state — there's no confirm dialog serialising them like delete has.
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(new Set());
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const onRestore = (item: DeletedHierarchyItem): void => {
    if (restoringIds.has(item.id)) return; // guard: aria-disabled doesn't block clicks
    setRestoreError(null);
    setRestoringIds((prev) => new Set(prev).add(item.id));
    restore.mutate(
      { kind: item.kind, id: item.id },
      {
        onSuccess: () => {
          // The restored row unmounts when the list refetches; move focus to the
          // region so keyboard/SR users aren't dropped to <body>.
          announce(`${KIND_LABEL[item.kind]} “${item.name}” restored.`);
          regionRef.current?.focus();
        },
        // On error the row stays; the button (aria-disabled, not natively
        // disabled) keeps focus, so the user can retry. The error is surfaced by
        // the role="alert" below — no extra announce (that would double-speak it).
        onError: (error) => setRestoreError(error.message),
        onSettled: () =>
          setRestoringIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          }),
      },
    );
  };

  const columns: Column<DeletedHierarchyItem>[] = [
    {
      header: 'Type',
      cell: (item) => <span className="text-muted-foreground">{KIND_LABEL[item.kind]}</span>,
    },
    { header: 'Name', cell: (item) => <span className="font-medium">{item.name}</span> },
    {
      header: 'Deleted',
      cell: (item) => (
        <span className="text-muted-foreground">{formatTimestamp(item.deletedAt)}</span>
      ),
    },
  ];
  if (canWrite) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (item) =>
        item.canRestore ? (
          <Button
            variant="ghost"
            size="sm"
            // aria-disabled (not native `disabled`) keeps the button focused while
            // the request is in flight, so focus isn't dropped to <body>; the
            // onRestore guard rejects the click instead.
            aria-disabled={restoringIds.has(item.id)}
            aria-busy={restoringIds.has(item.id)}
            onClick={() => onRestore(item)}
            aria-label={`Restore ${KIND_LABEL[item.kind].toLowerCase()} ${item.name}`}
          >
            {restoringIds.has(item.id) ? 'Restoring…' : 'Restore'}
          </Button>
        ) : (
          <span className="text-muted-foreground text-sm">Restore its parent first</span>
        ),
    });
  }

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      {restoreError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {restoreError}
        </p>
      ) : null}
      <DataTable
        caption="Recently deleted items"
        columns={columns}
        query={deleted}
        getRowKey={(item) => `${item.kind}:${item.id}`}
        loadingLabel="Loading recently deleted…"
        errorLabel="Couldn’t load recently deleted items. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            Nothing has been deleted. Deleted clients, projects and plans appear here so you can
            restore them.
          </div>
        }
      />
    </div>
  );
}
