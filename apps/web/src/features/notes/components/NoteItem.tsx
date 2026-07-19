import { zodResolver } from '@hookform/resolvers/zod';
import type { NoteSummary } from '@repo/types';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm, useWatch } from 'react-hook-form';

import { useDeleteNote, useUpdateNote } from '../api/use-notes';
import {
  NOTE_BODY_MAX,
  noteFormSchema,
  type NoteFormValues,
  type NoteTarget,
} from '../schemas/note-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextareaField } from '@/components/ui/form';
import { ApiFetchError } from '@/lib/api/client';
import { formatTimestamp } from '@/lib/format-date';

/** A neutral fallback when the author's display name couldn't be resolved server-side (ADR-0046). */
const UNKNOWN_AUTHOR = 'Unknown author';

/** A short, human label for a note used in per-control accessible names so they're distinguishable. */
function noteLabel(note: NoteSummary): string {
  return `${note.authorName ?? UNKNOWN_AUTHOR}, ${formatTimestamp(note.createdAt)}`;
}

/**
 * One note in a thread (ADR-0046): the body (plain text, wrapped), the author, an absolute timestamp,
 * and an "edited" marker once revised. **Edit + Delete render only for the note's own author** (a
 * `authorId === currentUserId` check that mirrors the API's row-level 403). Edit is inline (RHF + Zod)
 * and handles the optimistic **409** ("updated elsewhere") by refreshing the thread and surfacing a
 * retry status; Delete confirms first (the shared {@link ConfirmDialog}). A non-author sees no
 * edit/delete affordance at all.
 */
export function NoteItem({
  orgSlug,
  target,
  note,
  currentUserId,
  onThreadStale,
  onDeleted,
}: {
  orgSlug: string;
  target: NoteTarget;
  note: NoteSummary;
  /** The signed-in user's id — the note's author iff it equals `note.authorId`. */
  currentUserId?: string | null | undefined;
  /** Called after a 409/403 so the thread refetches the server truth for a retry. */
  onThreadStale: () => void;
  /** Called after this note is deleted, so the thread can move focus off the unmounting row. */
  onDeleted: () => void;
}): React.ReactElement {
  const isAuthor = note.authorId != null && note.authorId === currentUserId;
  const announce = useAnnounce();

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // A 409 (someone else edited this note) or a 403 (no longer the author) — shown inline as a status.
  const [conflict, setConflict] = useState<string | null>(null);

  const editButtonRef = useRef<HTMLButtonElement>(null);
  // When the editor closes (cancel / save / conflict) restore focus to the Edit button, so a keyboard/
  // AT user isn't dropped to <body> (SC 2.4.3). Driven by state (not a ref) so the submit handler never
  // touches a ref — the React Compiler forbids ref access reachable from the RHF `handleSubmit` closure;
  // the actual focus call happens in the effect below (where ref access is allowed).
  const [restoreEditFocus, setRestoreEditFocus] = useState(false);

  const update = useUpdateNote(orgSlug, target);
  const remove = useDeleteNote(orgSlug, target);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setFocus,
    formState: { errors },
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: { body: note.body },
  });
  const value = useWatch({ control, name: 'body' }) ?? '';
  const overLimit = value.length > NOTE_BODY_MAX;
  const emptyBody = value.trim().length === 0;

  // On opening the editor, seed it with the latest body and move focus into the textarea (SC 2.4.3).
  useEffect(() => {
    if (editing) {
      reset({ body: note.body });
      setFocus('body');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on open only
  }, [editing]);

  // On a requested close, restore focus to the Edit button (deferred here so the submit handler stays
  // ref-free — the React Compiler forbids ref access in the `handleSubmit` closure). The flag latches
  // true on the first close and the effect keys on `editing`, so it re-fires on every subsequent close
  // but never on the initial mount (where it's still false).
  useEffect(() => {
    if (!editing && restoreEditFocus) {
      editButtonRef.current?.focus();
    }
  }, [editing, restoreEditFocus]);

  const closeEditor = (): void => {
    setRestoreEditFocus(true);
    setEditing(false);
  };

  const onSubmit = handleSubmit((values) => {
    if (overLimit) return;
    setConflict(null);
    update.mutate(
      { noteId: note.id, body: values.body, version: note.version },
      {
        onSuccess: () => {
          closeEditor();
          announce('Note updated.');
        },
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 409) {
            // Optimistic-lock clash: someone edited this note first. Refresh the thread so the retry
            // sees the current body/version, close the editor, and announce the reason as a status.
            closeEditor();
            onThreadStale();
            setConflict(
              'This note was updated elsewhere. We’ve refreshed it — review the latest and edit again if needed.',
            );
          } else if (error instanceof ApiFetchError && error.status === 403) {
            closeEditor();
            onThreadStale();
            setConflict('You can no longer edit this note.');
          }
          // Other errors surface via the form's inline `update.isError` message below.
        },
      },
    );
  });

  const confirmDelete = (): void => {
    setDeleteError(null);
    remove.mutate(note.id, {
      onSuccess: () => {
        // Close the dialog synchronously before the row unmounts on refetch, then move focus to the
        // thread region so it doesn't fall to <body> (the ClientsTable/DependencyEditor precedent).
        flushSync(() => setDeleting(false));
        announce('Note deleted.');
        onDeleted();
      },
      onError: (error) => setDeleteError(error.message),
    });
  };

  return (
    <li className="border-border flex flex-col gap-1.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium">{note.authorName ?? UNKNOWN_AUTHOR}</span>
        <span className="text-muted-foreground text-xs">
          <time dateTime={note.createdAt}>{formatTimestamp(note.createdAt)}</time>
          {note.edited ? (
            <span className="ml-1.5" title={`Edited ${formatTimestamp(note.updatedAt)}`}>
              · edited
            </span>
          ) : null}
        </span>
      </div>

      {editing ? (
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2">
          <TextareaField
            label="Edit note"
            rows={3}
            error={errors.body?.message}
            aria-describedby={`note-${note.id}-edit-count`}
            {...register('body')}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              id={`note-${note.id}-edit-count`}
              className={
                overLimit ? 'text-destructive-text text-xs' : 'text-muted-foreground text-xs'
              }
            >
              {value.length.toLocaleString()} / {NOTE_BODY_MAX.toLocaleString()}
            </p>
            {update.isError &&
            !(update.error instanceof ApiFetchError && [403, 409].includes(update.error.status)) ? (
              <p role="alert" className="text-destructive-text text-xs">
                {update.error.message}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => closeEditor()}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                aria-disabled={emptyBody || overLimit || update.isPending}
                aria-busy={update.isPending}
                className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
              >
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <p className="text-sm break-words whitespace-pre-wrap">{note.body}</p>
          {conflict ? (
            <p role="status" className="text-muted-foreground text-xs">
              {conflict}
            </p>
          ) : null}
          {isAuthor ? (
            <div className="flex justify-end gap-1">
              <Button
                ref={editButtonRef}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConflict(null);
                  setEditing(true);
                }}
                aria-label={`Edit note by ${noteLabel(note)}`}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteError(null);
                  setDeleting(true);
                }}
                aria-label={`Delete note by ${noteLabel(note)}`}
              >
                Delete
              </Button>
            </div>
          ) : null}
        </>
      )}

      {isAuthor ? (
        <ConfirmDialog
          open={deleting}
          onClose={() => {
            setDeleting(false);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
          title="Delete note"
          description="Delete this note? This can’t be undone from here."
          confirmLabel="Delete"
          pending={remove.isPending}
          pendingLabel="Deleting…"
          error={deleteError}
        />
      ) : null}
    </li>
  );
}
