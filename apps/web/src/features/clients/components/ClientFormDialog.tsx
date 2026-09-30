import { zodResolver } from '@hookform/resolvers/zod';
import type { ClientSummary } from '@repo/types';
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
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit client' : 'New client'}
      {...(isEdit ? {} : { description: 'Add a client to organise projects and plans.' })}
    >
      <ClientForm
        key={client?.id ?? 'new'}
        orgSlug={orgSlug}
        client={client}
        onClose={onClose}
        onCreated={onCreated}
      />
    </Dialog>
  );
}

/**
 * The form proper. The Dialog mounts its children only while open, so `useForm` is born with the
 * target's values instead of being `reset()` by a passive effect after commit: an effect that
 * runs after the field is on screen can wipe what a fast typist has already entered
 * (`docs/TECH_DEBT.md` #420). The mutation hooks live here for the same reason — a reopened
 * dialog starts with no stale error.
 *
 * The `key` must not change while the dialog is open: if a caller ever retargets a live dialog,
 * focus must be restored to the first field (WCAG 2.4.3), because the remount drops it.
 */
function ClientForm({
  orgSlug,
  client,
  onClose,
  onCreated,
}: {
  orgSlug: string;
  // Required-but-`undefined` rather than optional: `exactOptionalPropertyTypes`.
  client: ClientSummary | undefined;
  onClose: () => void;
  onCreated: ((created: ClientSummary) => void) | undefined;
}): React.ReactElement {
  const isEdit = client !== undefined;
  const create = useCreateClient(orgSlug);
  const update = useUpdateClient(orgSlug);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { name: client?.name ?? '', description: client?.description ?? '' },
  });

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
        <Button
          type="submit"
          className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
          aria-disabled={mutation.isPending}
          aria-busy={mutation.isPending}
          onClick={(event) => {
            if (mutation.isPending) event.preventDefault();
          }}
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
        </Button>
      </div>
    </form>
  );
}
