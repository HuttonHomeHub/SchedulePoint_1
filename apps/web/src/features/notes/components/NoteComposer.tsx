import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateNote } from '../api/use-notes';
import {
  NOTE_BODY_MAX,
  noteFormSchema,
  type NoteFormValues,
  type NoteTarget,
} from '../schemas/note-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/form';

/**
 * Add a note to a plan or activity (ADR-0046). RHF + Zod: the body is trimmed (whitespace-only is
 * rejected) and bounded 1–{@link NOTE_BODY_MAX}; Submit is disabled while empty/over-limit or in
 * flight, with a live character cue. On success it clears, announces "Note added" (so AT users hear
 * it land), and the thread refreshes via the mutation's invalidation. Rendered **only when the user
 * can write** — its host decides that from the org role.
 */
export function NoteComposer({
  orgSlug,
  target,
  placeholder = 'Add a note…',
}: {
  orgSlug: string;
  target: NoteTarget;
  placeholder?: string;
}): React.ReactElement {
  const create = useCreateNote(orgSlug, target);
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: { body: '' },
  });

  const value = useWatch({ control, name: 'body' }) ?? '';
  const overLimit = value.length > NOTE_BODY_MAX;
  const emptyBody = value.trim().length === 0;

  const onSubmit = handleSubmit((values) => {
    if (overLimit) return;
    create.mutate(values.body, {
      onSuccess: () => {
        reset({ body: '' });
        announce('Note added.');
      },
    });
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2">
      <TextareaField
        label="Add a note"
        rows={3}
        placeholder={placeholder}
        error={errors.body?.message}
        aria-describedby="note-composer-count"
        {...register('body')}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          id="note-composer-count"
          className={overLimit ? 'text-destructive-text text-xs' : 'text-muted-foreground text-xs'}
        >
          {value.length.toLocaleString()} / {NOTE_BODY_MAX.toLocaleString()}
        </p>
        {create.isError ? (
          <p role="alert" className="text-destructive-text text-xs">
            {create.error.message}
          </p>
        ) : null}
        <Button
          type="submit"
          size="sm"
          aria-disabled={emptyBody || overLimit || create.isPending}
          aria-busy={create.isPending}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          {create.isPending ? 'Adding…' : 'Add note'}
        </Button>
      </div>
    </form>
  );
}
