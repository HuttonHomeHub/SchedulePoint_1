import { zodResolver } from '@hookform/resolvers/zod';
import type { ClientSummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useCreateClient, useUpdateClient } from '../api/use-clients';
import { clientFormSchema, type ClientFormValues } from '../schemas/client-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';

/**
 * Create-or-edit dialog for a client. In edit mode (`client` provided) it
 * PATCHes with the row's optimistic-locking `version`; a stale write surfaces
 * the API's conflict message and the list refetches so a retry carries the
 * current version. Controlled via `open`/`onClose`.
 */
export function ClientFormDialog({
  orgSlug,
  open,
  onClose,
  client,
  onCreated,
}: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  client?: ClientSummary;
  /** Called with the new client after a successful create (for post-create orientation). */
  onCreated?: (created: ClientSummary) => void;
}): React.ReactElement {
  const isEdit = client !== undefined;
  const create = useCreateClient(orgSlug);
  const update = useUpdateClient(orgSlug);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { name: '', description: '' },
  });

  // Seed (or reset) the form whenever the dialog opens for a given target.
  useEffect(() => {
    if (open) {
      reset({ name: client?.name ?? '', description: client?.description ?? '' });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, client?.id]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit) {
      update.mutate(
        { clientId: client.id, version: client.version, ...values },
        {
          onSuccess: () => {
            announce(`Client “${values.name}” saved.`);
            onClose();
          },
        },
      );
    } else {
      create.mutate(values, {
        onSuccess: (created) => {
          announce(`Client “${values.name}” created.`);
          onCreated?.(created);
          onClose();
        },
      });
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit client' : 'New client'}
      {...(isEdit ? {} : { description: 'Add a client to organise projects and plans.' })}
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <FormErrorSummary errors={errors} />
        {mutation.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {mutation.error.message}
          </p>
        ) : null}
        <TextField
          label="Name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextareaField
          label="Description (optional)"
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
