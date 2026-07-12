import { zodResolver } from '@hookform/resolvers/zod';
import {
  SELECTABLE_CONSTRAINT_TYPES,
  isParkedConstraintType,
  type ActivitySummary,
} from '@repo/types';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateActivity, useUpdateActivity } from '../api/use-activities';
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
  activityFormSchema,
  isMilestoneType,
  type ActivityFormValues,
} from '../schemas/activity-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PARKED_CONSTRAINT_LABELS } from '@/lib/constraint-format';

/**
 * Create-or-edit dialog for an activity DEFINITION (Planner/Org Admin). Progress
 * (status / % / actual dates) is changed elsewhere, so it is not here. Duration
 * is hidden for milestone types (a milestone is a point in time); the constraint
 * date only shows once a constraint type is chosen — both mirror the API rules.
 * Edit mode PATCHes with the row's `version`.
 */
export function ActivityFormDialog({
  orgSlug,
  planId,
  open,
  onClose,
  activity,
}: {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
  activity?: ActivitySummary;
}): React.ReactElement {
  const isEdit = activity !== undefined;
  const create = useCreateActivity(orgSlug, planId);
  const update = useUpdateActivity(orgSlug, planId);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      name: '',
      code: '',
      type: 'TASK',
      durationDays: 1,
      constraintType: '',
      constraintDate: '',
      description: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: activity?.name ?? '',
        code: activity?.code ?? '',
        type: activity?.type ?? 'TASK',
        durationDays: activity?.durationDays ?? 1,
        constraintType: activity?.constraintType ?? '',
        constraintDate: activity?.constraintDate ?? '',
        description: activity?.description ?? '',
      });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, activity?.id]);

  const type = useWatch({ control, name: 'type' });
  const constraintType = useWatch({ control, name: 'constraintType' });
  // A parked (`MANDATORY_*`) value the activity already carries: shown as an honest one-off
  // option so opening the form never coerces it (US-2). Derived from the live field value, so
  // it appears when a parked value is selected and disappears once the planner changes away.
  const parkedValue =
    constraintType && isParkedConstraintType(constraintType) ? constraintType : null;

  const onSubmit = handleSubmit((values) => {
    if (isEdit) {
      update.mutate(
        { activityId: activity.id, version: activity.version, ...values },
        {
          onSuccess: () => {
            announce(`Activity “${values.name}” saved.`);
            onClose();
          },
        },
      );
    } else {
      create.mutate(values, {
        onSuccess: () => {
          announce(`Activity “${values.name}” created.`);
          onClose();
        },
      });
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit activity' : 'New activity'}
      {...(isEdit ? {} : { description: 'Add an activity to this plan.' })}
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
        <TextField
          label="Code (optional)"
          autoComplete="off"
          error={errors.code?.message}
          {...register('code')}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="activity-type">Type</Label>
          <Select
            id="activity-type"
            aria-invalid={errors.type ? true : undefined}
            aria-describedby={errors.type ? 'activity-type-error' : undefined}
            {...register('type')}
          >
            {ACTIVITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {ACTIVITY_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
          {errors.type?.message ? (
            <p id="activity-type-error" className="text-destructive-text text-sm">
              {errors.type.message}
            </p>
          ) : null}
        </div>
        {isMilestoneType(type) ? null : (
          <TextField
            label="Duration (working days)"
            type="number"
            min={0}
            error={errors.durationDays?.message}
            {...register('durationDays', { valueAsNumber: true })}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="activity-constraint-type">Constraint (optional)</Label>
          <Select
            id="activity-constraint-type"
            aria-invalid={errors.constraintType ? true : undefined}
            aria-describedby={
              errors.constraintType
                ? 'activity-constraint-help activity-constraint-type-error'
                : 'activity-constraint-help'
            }
            {...register('constraintType')}
          >
            <option value="">None</option>
            {/* Only the six kinds the scheduler applies exactly as labelled (the engine parks
                MANDATORY_* — see @repo/types SELECTABLE_CONSTRAINT_TYPES), so a planner never
                sets a constraint that behaves differently than it reads. */}
            {SELECTABLE_CONSTRAINT_TYPES.map((value) => (
              <option key={value} value={value}>
                {CONSTRAINT_TYPE_LABELS[value]}
              </option>
            ))}
            {/* An activity that already carries a parked value keeps it as an honest, labelled
                option so opening the form never silently changes it; it drops out once the
                planner picks something else. Driven by the live field value, not the original. */}
            {parkedValue ? (
              <option value={parkedValue}>{PARKED_CONSTRAINT_LABELS[parkedValue]}</option>
            ) : null}
          </Select>
          <p id="activity-constraint-help" className="text-muted-foreground text-sm">
            Pins the activity’s start or finish to a date. Only constraints the scheduler applies
            exactly as named are listed (an existing value keeps its own label).
          </p>
          {errors.constraintType?.message ? (
            <p id="activity-constraint-type-error" className="text-destructive-text text-sm">
              {errors.constraintType.message}
            </p>
          ) : null}
        </div>
        {constraintType ? (
          <TextField
            label="Constraint date"
            type="date"
            error={errors.constraintDate?.message}
            {...register('constraintDate')}
          />
        ) : null}
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
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create activity'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
