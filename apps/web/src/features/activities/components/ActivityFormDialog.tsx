import { zodResolver } from '@hookform/resolvers/zod';
import {
  SELECTABLE_CONSTRAINT_TYPES,
  isParkedConstraintType,
  type ActivitySummary,
} from '@repo/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateActivity, useUpdateActivity } from '../api/use-activities';
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
  INHERIT_CALENDAR_LABEL,
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
import { ACTIVITY_CALENDAR_ENABLED } from '@/config/env';
import { calendarsQueryOptions } from '@/features/calendars';
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
      calendarId: '',
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
        // Always seed from the row so the value round-trips even when the picker is hidden
        // (flag off) — an edit then never silently clears an assigned calendar. '' = inherit.
        calendarId: activity?.calendarId ?? '',
        description: activity?.description ?? '',
      });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, activity?.id]);

  // The org's calendar library, for the picker's options. Fetched only when the picker is enabled
  // (flag default-off) — the value still round-trips via the seeded field when the picker is hidden.
  const calendars = useQuery({
    ...calendarsQueryOptions(orgSlug),
    enabled: ACTIVITY_CALENDAR_ENABLED,
  });

  const type = useWatch({ control, name: 'type' });
  const constraintType = useWatch({ control, name: 'constraintType' });
  const calendarId = useWatch({ control, name: 'calendarId' });
  // While the calendar list is still loading, a seeded non-inherit value won't match any option;
  // inject a synthetic one so the Select shows it as selected (not blank, which reads as "inherit").
  const calendarList = calendars.data ?? [];
  const missingCalendar = Boolean(calendarId) && !calendarList.some((c) => c.id === calendarId);
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
        {ACTIVITY_CALENDAR_ENABLED ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-calendar">Calendar</Label>
            <Select
              id="activity-calendar"
              disabled={calendars.isPending}
              aria-busy={calendars.isPending}
              aria-describedby="activity-calendar-help"
              {...register('calendarId')}
            >
              <option value="">{INHERIT_CALENDAR_LABEL}</option>
              {/* The seeded calendar isn't in the list yet while it loads — keep it selected. */}
              {missingCalendar ? <option value={calendarId}>Loading…</option> : null}
              {calendarList.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </Select>
            <p id="activity-calendar-help" className="text-muted-foreground text-sm">
              The working-time calendar this activity is scheduled on. Inherits the plan’s calendar
              unless you pick one. Recalculate to apply it to the dates.
            </p>
          </div>
        ) : null}
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
