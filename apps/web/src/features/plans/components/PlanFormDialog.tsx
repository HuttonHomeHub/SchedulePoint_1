import { zodResolver } from '@hookform/resolvers/zod';
import type { PlanSummary } from '@repo/types';
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
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit plan' : 'New plan'}
      {...(isEdit ? {} : { description: 'Add a plan to this project.' })}
    >
      <PlanForm
        key={plan?.id ?? 'new'}
        orgSlug={orgSlug}
        projectId={projectId}
        plan={plan}
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
 */
function PlanForm({
  orgSlug,
  projectId,
  plan,
  onClose,
  onCreated,
}: {
  orgSlug: string;
  projectId: string;
  plan: PlanSummary | undefined;
  onClose: () => void;
  onCreated: ((created: PlanSummary) => void) | undefined;
}): React.ReactElement {
  const isEdit = plan !== undefined;
  const create = useCreatePlan(orgSlug, projectId);
  const update = useUpdatePlan(orgSlug, projectId);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: plan?.name ?? '',
      description: plan?.description ?? '',
      status: plan?.status ?? 'DRAFT',
      plannedStart: plan?.plannedStart ?? '',
    },
  });

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
        <Button
          type="submit"
          className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
          aria-disabled={mutation.isPending}
          aria-busy={mutation.isPending}
          onClick={(event) => {
            if (mutation.isPending) event.preventDefault();
          }}
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
        </Button>
      </div>
    </form>
  );
}
