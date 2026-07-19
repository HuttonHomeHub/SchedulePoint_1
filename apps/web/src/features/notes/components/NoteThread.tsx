import { useRef } from 'react';

import { useNoteThread } from '../api/use-notes';
import type { NoteTarget } from '../schemas/note-schemas';

import { NoteItem } from './NoteItem';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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
  bounded = false,
}: {
  orgSlug: string;
  target: NoteTarget;
  currentUserId?: string | null | undefined;
  /** Keep the query idle while the host is hidden (a closed dialog); mirrors the dependency editor. */
  enabled?: boolean;
  /**
   * Cap the thread's height with an internal scroll when embedded in a fixed-height host (the canvas
   * plan workspace header), so an accumulating thread can't grow the chrome and push the canvas below
   * its `CANVAS_MIN_HEIGHT` floor (ADR-0030/0031). Off in long-scrolling routes (plan-detail).
   */
  bounded?: boolean;
}): React.ReactElement {
  const thread = useNoteThread(orgSlug, target, enabled);
  const announce = useAnnounce();
  const notes = thread.data?.pages.flatMap((page) => page.notes) ?? [];
  // A focus sink for after a delete or a 403 authorship-loss: the affected control unmounts, so focus is
  // moved here rather than falling to <body> (the ClientsTable/DependencyEditor precedent). Also the
  // landing spot when "Load more" exhausts the thread and its button disappears (SC 2.4.3).
  const regionRef = useRef<HTMLDivElement>(null);

  // Load an older page; when it's the last one the "Load more" button unmounts, so move focus to the
  // region sink and announce completion rather than dropping the keyboard/AT user to <body>.
  const loadMore = (): void => {
    void thread.fetchNextPage().then((result) => {
      if (!result.hasNextPage) {
        announce('All notes loaded.');
        regionRef.current?.focus();
      }
    });
  };

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
    <div
      ref={regionRef}
      tabIndex={-1}
      className={cn('flex flex-col gap-2 outline-none', bounded && 'max-h-64 overflow-y-auto pr-1')}
    >
      <ul className="flex flex-col gap-2">
        {notes.map((note, index) => (
          <NoteItem
            key={note.id}
            orgSlug={orgSlug}
            target={target}
            note={note}
            position={index + 1}
            currentUserId={currentUserId}
            onThreadStale={() => void thread.refetch()}
            onFocusRegion={() => regionRef.current?.focus()}
          />
        ))}
      </ul>
      {thread.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
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
