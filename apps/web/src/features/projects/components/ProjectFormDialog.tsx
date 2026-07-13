import { zodResolver } from '@hookform/resolvers/zod';
import type { ProjectSummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useCreateProject, useUpdateProject } from '../api/use-projects';
import { projectFormSchema, type ProjectFormValues } from '../schemas/project-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';

/**
 * Create-or-edit dialog for a project under a client. Edit mode PATCHes with the
 * row's optimistic-locking `version`; a conflict refetches the list so a retry
 * carries the current version. Controlled via `open`/`onClose`.
 */
export function ProjectFormDialog({
  orgSlug,
  clientId,
  open,
  onClose,
  project,
  onCreated,
}: {
  orgSlug: string;
  clientId: string;
  open: boolean;
  onClose: () => void;
  project?: ProjectSummary;
  /** Called with the new project after a successful create (for post-create orientation). */
  onCreated?: (created: ProjectSummary) => void;
}): React.ReactElement {
  const isEdit = project !== undefined;
  const create = useCreateProject(orgSlug, clientId);
  const update = useUpdateProject(orgSlug, clientId);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: '', description: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ name: project?.name ?? '', description: project?.description ?? '' });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, project?.id]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit) {
      update.mutate(
        { projectId: project.id, version: project.version, ...values },
        {
          onSuccess: () => {
            announce(`Project “${values.name}” saved.`);
            onClose();
          },
        },
      );
    } else {
      create.mutate(values, {
        onSuccess: (created) => {
          announce(`Project “${values.name}” created.`);
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
      title={isEdit ? 'Edit project' : 'New project'}
      {...(isEdit ? {} : { description: 'Add a project to hold this client’s plans.' })}
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
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
