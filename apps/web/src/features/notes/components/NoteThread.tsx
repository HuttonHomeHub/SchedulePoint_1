import { useRef } from 'react';

import { useNoteThread } from '../api/use-notes';
import type { NoteTarget } from '../schemas/note-schemas';

import { NoteItem } from './NoteItem';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * The list half of a note surface (ADR-0046 Option B): a target's notes newest-first, each an item,
 * with a cursor "Load more" when there are older notes, and the design-system loading / empty / error
 * states (mirroring the sibling surfaces). The composer lives in the section wrapper, above this. The
 * 409 "updated elsewhere" path in a {@link NoteItem} calls back here to refetch the server truth.
 */
export function NoteThread({
  orgSlug,
  target,
  currentUserId,
  enabled = true,
}: {
  orgSlug: string;
  target: NoteTarget;
  currentUserId?: string | null | undefined;
  /** Keep the query idle while the host is hidden (a closed dialog); mirrors the dependency editor. */
  enabled?: boolean;
}): React.ReactElement {
  const thread = useNoteThread(orgSlug, target, enabled);
  const notes = thread.data?.pages.flatMap((page) => page.notes) ?? [];
  // A focus sink for after a delete: the deleted row unmounts, so focus is moved here rather than
  // falling to <body> (the ClientsTable/DependencyEditor precedent).
  const regionRef = useRef<HTMLDivElement>(null);

  if (thread.isPending) {
    return (
      <div className="py-6">
        <Spinner label="Loading notes…" />
      </div>
    );
  }

  if (thread.isError) {
    return (
      <div
        role="alert"
        className="border-destructive-text/40 text-destructive-text rounded-lg border p-4 text-sm"
      >
        Couldn’t load notes. Please try again.
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No notes yet.
      </div>
    );
  }

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-2 outline-none">
      <ul className="flex flex-col gap-2">
        {notes.map((note) => (
          <NoteItem
            key={note.id}
            orgSlug={orgSlug}
            target={target}
            note={note}
            currentUserId={currentUserId}
            onThreadStale={() => void thread.refetch()}
            onDeleted={() => regionRef.current?.focus()}
          />
        ))}
      </ul>
      {thread.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void thread.fetchNextPage()}
            aria-disabled={thread.isFetchingNextPage}
            aria-busy={thread.isFetchingNextPage}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            {thread.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
