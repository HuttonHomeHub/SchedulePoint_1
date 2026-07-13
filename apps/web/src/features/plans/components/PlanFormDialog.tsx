import { zodResolver } from '@hookform/resolvers/zod';
import type { PlanSummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useCreatePlan, useUpdatePlan } from '../api/use-plans';
import {
  PLAN_STATUSES,
  PLAN_STATUS_LABELS,
  planFormSchema,
  type PlanFormValues,
} from '../schemas/plan-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * Create-or-edit dialog for a plan under a project. Adds a status select and an
 * optional planned-start date (native `<input type="date">`, so the wire value
 * is always `YYYY-MM-DD`). Edit mode PATCHes with the row's `version`.
 */
export function PlanFormDialog({
  orgSlug,
  projectId,
  open,
  onClose,
  plan,
  onCreated,
}: {
  orgSlug: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
  plan?: PlanSummary;
  /** Called with the new plan after a successful create (for post-create orientation). */
  onCreated?: (created: PlanSummary) => void;
}): React.ReactElement {
  const isEdit = plan !== undefined;
  const create = useCreatePlan(orgSlug, projectId);
  const update = useUpdatePlan(orgSlug, projectId);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: { name: '', description: '', status: 'DRAFT', plannedStart: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: plan?.name ?? '',
        description: plan?.description ?? '',
        status: plan?.status ?? 'DRAFT',
        plannedStart: plan?.plannedStart ?? '',
      });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, plan?.id]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit) {
      update.mutate(
        { planId: plan.id, version: plan.version, ...values },
        {
          onSuccess: () => {
            announce(`Plan “${values.name}” saved.`);
            onClose();
          },
        },
      );
    } else {
      create.mutate(values, {
        onSuccess: (created) => {
          announce(`Plan “${values.name}” created.`);
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
      title={isEdit ? 'Edit plan' : 'New plan'}
      {...(isEdit ? {} : { description: 'Add a plan to this project.' })}
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
          <Label htmlFor="plan-status">Status</Label>
          <Select id="plan-status" {...register('status')}>
            {PLAN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PLAN_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        <TextField
          label="Planned start (optional)"
          type="date"
          error={errors.plannedStart?.message}
          {...register('plannedStart')}
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
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
