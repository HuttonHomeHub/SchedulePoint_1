import { useRef } from 'react';

import { useNoteThread } from '../api/use-notes';
import type { NoteTarget } from '../schemas/note-schemas';

import { NoteItem } from './NoteItem';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';
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

  /**
   * **ONE region, rendered in every state** — the sink's node identity must not depend on what the
   * thread currently holds.
   *
   * `regionRef` was on the populated branch alone, and the first fix was to add it to the empty and
   * error branches too. That was still wrong, and the browser said so: `onFocusRegion()` runs from a
   * mutation callback, **before** the re-render that empties the list, so it focused the node that
   * was about to unmount and the reader still landed on `<body>`. A stable wrapper is the only shape
   * where "focus the region" means the same element before and after the update.
   *
   * Why it matters here at all: it is WCAG 2.4.3, it is pre-existing, and it was invisible for as
   * long as the editor was a modal — a `<dialog>`'s `cancel` fires wherever focus is, so Escape kept
   * working and nobody could tell. ADR-0099 put the editor in a drawer, whose Escape rung is a React
   * handler and therefore cannot see a keypress on `<body>`; a journey went red on the second Escape
   * while the first, with a note still in the list, kept passing. Found with a probe reading
   * `document.activeElement`, after two guesses had been wrong.
   */
  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      className={cn(
        'flex flex-col gap-2 outline-none',
        bounded && notes.length > 0 && 'max-h-64 overflow-y-auto pr-1',
      )}
    >
      {thread.isPending ? (
        <div className="py-6">
          <Spinner label="Loading notes…" />
        </div>
      ) : thread.isError ? (
        <div
          role="alert"
          className="border-destructive-text/40 text-destructive-text rounded-lg border p-4 text-sm"
        >
          Couldn’t load notes. Please try again.
        </div>
      ) : notes.length === 0 ? (
        <NoticeStrip emphasis="dashed" message="No notes yet." />
      ) : (
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
      )}
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
