import { zodResolver } from '@hookform/resolvers/zod';
import type { ProjectSummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useCreateProject, useUpdateProject } from '../api/use-projects';
import { projectFormSchema, type ProjectFormValues } from '../schemas/project-schemas';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';

/**
 * Create-or-edit dialog for a project under a client. Edit mode PATCHes with the
 * row's optimistic-locking `version`. Controlled via `open`/`onClose`.
 */
export function ProjectFormDialog({
  orgSlug,
  clientId,
  open,
  onClose,
  project,
}: {
  orgSlug: string;
  clientId: string;
  open: boolean;
  onClose: () => void;
  project?: ProjectSummary;
}): React.ReactElement {
  const isEdit = project !== undefined;
  const create = useCreateProject(orgSlug, clientId);
  const update = useUpdateProject(orgSlug, clientId);
  const mutation = isEdit ? update : create;

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-description">Description (optional)</Label>
          <textarea
            id="project-description"
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
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
