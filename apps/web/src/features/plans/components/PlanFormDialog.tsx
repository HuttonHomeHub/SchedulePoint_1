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
import { FormErrorSummary, SelectField, TextField, TextareaField } from '@/components/ui/form';

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
        <SelectField label="Status" id="plan-status" {...register('status')}>
          {PLAN_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PLAN_STATUS_LABELS[status]}
            </option>
          ))}
        </SelectField>
        {/* **Not "(optional)"** — `planFormSchema` requires it, and its own docblock says so in
            bold. A planner told the field was optional left it blank, pressed Create plan and was
            refused by the field they had just been told to skip; the refusal then called it "a
            project start date", a third name for one control on one screen. Found by the ADR-0096
            journey, which could not create a plan at all. */}
        <TextField
          label="Planned start"
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
