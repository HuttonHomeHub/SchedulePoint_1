import { zodResolver } from '@hookform/resolvers/zod';
import type { ClientSummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useCreateClient, useUpdateClient } from '../api/use-clients';
import { clientFormSchema, type ClientFormValues } from '../schemas/client-schemas';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';

/**
 * Create-or-edit dialog for a client. In edit mode (`client` provided) it
 * PATCHes with the row's optimistic-locking `version`; a stale write surfaces
 * the API's conflict message. Controlled via `open`/`onClose` so the same form
 * serves the header "New client" button and a row's "Edit" action.
 */
export function ClientFormDialog({
  orgSlug,
  open,
  onClose,
  client,
}: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  client?: ClientSummary;
}): React.ReactElement {
  const isEdit = client !== undefined;
  const create = useCreateClient(orgSlug);
  const update = useUpdateClient(orgSlug);
  const mutation = isEdit ? update : create;

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
        { onSuccess: onClose },
      );
    } else {
      create.mutate(values, { onSuccess: onClose });
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-description">Description (optional)</Label>
          <textarea
            id="client-description"
            rows={3}
            className="border-input bg-background focus-visible:ring-ring min-h-16 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            {...register('description')}
          />
        </div>
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
