import { zodResolver } from '@hookform/resolvers/zod';
import {
  SELECTABLE_CONSTRAINT_TYPES,
  isParkedConstraintType,
  type ActivitySummary,
  type CalendarSummary,
} from '@repo/types';
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
import { CheckboxField, FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ACTIVITY_CALENDAR_ENABLED, ADVANCED_CONSTRAINTS_ENABLED } from '@/config/env';
import { PARKED_CONSTRAINT_LABELS } from '@/lib/constraint-format';

/**
 * Create-or-edit dialog for an activity DEFINITION (Planner/Org Admin). Progress
 * (status / % / actual dates) is changed elsewhere, so it is not here. Duration
 * is hidden for milestone types (a milestone is a point in time); the constraint
 * date only shows once a constraint type is chosen — both mirror the API rules.
 * Edit mode PATCHes with the row's `version`.
 *
 * The org calendar library (for the per-activity calendar picker, ADR-0037) is **supplied by the
 * composing route/workspace**, not fetched here — so the activities feature stays dependency-free of
 * the calendars feature (like {@link ActivitiesTable}'s `varianceByActivityId`). `CalendarSummary`
 * is a shared `@repo/types` shape. Absent it, the picker still round-trips a seeded `calendarId`.
 */
export function ActivityFormDialog({
  orgSlug,
  planId,
  open,
  onClose,
  activity,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
}: {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
  activity?: ActivitySummary;
  /** The org's calendars, for the calendar picker's options (route-composed). */
  calendars?: CalendarSummary[];
  /** The calendars list is still loading (its options aren't complete yet). */
  calendarsLoading?: boolean;
  /** The calendars list failed to load — surface it rather than silently offering only "inherit". */
  calendarsError?: boolean;
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
      secondaryConstraintType: '',
      secondaryConstraintDate: '',
      scheduleAsLateAsPossible: false,
      expectedFinish: '',
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
        // Always seed the M4 advanced fields from the row so a stored value round-trips even when the
        // fields are hidden (flag off) — an edit then never silently clears them.
        secondaryConstraintType: activity?.secondaryConstraintType ?? '',
        secondaryConstraintDate: activity?.secondaryConstraintDate ?? '',
        scheduleAsLateAsPossible: activity?.scheduleAsLateAsPossible ?? false,
        expectedFinish: activity?.expectedFinish ?? '',
        // Always seed from the row so the value round-trips even when the picker is hidden
        // (flag off) — an edit then never silently clears an assigned calendar. '' = inherit.
        calendarId: activity?.calendarId ?? '',
        description: activity?.description ?? '',
      });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, activity?.id]);

  const type = useWatch({ control, name: 'type' });
  const constraintType = useWatch({ control, name: 'constraintType' });
  const secondaryConstraintType = useWatch({ control, name: 'secondaryConstraintType' });
  const calendarId = useWatch({ control, name: 'calendarId' });
  // A seeded non-inherit value that doesn't match any option (the list is still loading, or failed
  // to load): inject a synthetic option so the Select shows it as selected — never blank, which
  // would read as "inherit".
  const missingCalendar = Boolean(calendarId) && !calendars.some((c) => c.id === calendarId);
  // A parked (`MANDATORY_*`) value the activity already carries: shown as an honest one-off
  // option so opening the form never coerces it (US-2). Derived from the live field value, so
  // it appears when a parked value is selected and disappears once the planner changes away.
  const parkedValue =
    constraintType && isParkedConstraintType(constraintType) ? constraintType : null;
  // A parked secondary value round-trips as its own honest option, exactly like the primary.
  const secondaryParkedValue =
    secondaryConstraintType && isParkedConstraintType(secondaryConstraintType)
      ? secondaryConstraintType
      : null;

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
            <Label htmlFor="activity-calendar">Calendar (optional)</Label>
            <Select
              id="activity-calendar"
              disabled={calendarsLoading}
              aria-busy={calendarsLoading}
              aria-invalid={calendarsError ? true : undefined}
              aria-describedby={
                calendarsError
                  ? 'activity-calendar-help activity-calendar-error'
                  : 'activity-calendar-help'
              }
              {...register('calendarId')}
            >
              <option value="">{INHERIT_CALENDAR_LABEL}</option>
              {/* The seeded calendar isn't resolvable from the list — still loading, or the list
                  failed to load. Keep it selected under an honest label (never blank, which would
                  read as "inherit"); "Loading…" only while pending, else "Unavailable". */}
              {missingCalendar ? (
                <option value={calendarId}>{calendarsLoading ? 'Loading…' : 'Unavailable'}</option>
              ) : null}
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </Select>
            <p id="activity-calendar-help" className="text-muted-foreground text-sm">
              The working-time calendar this activity is scheduled on. Inherits the plan’s calendar
              unless you pick one. Recalculate to apply the calendar to the activity’s dates.
            </p>
            {calendarsError ? (
              <p
                id="activity-calendar-error"
                role="alert"
                className="text-destructive-text text-sm"
              >
                Couldn’t load the calendar list, so only “{INHERIT_CALENDAR_LABEL}” is available.
              </p>
            ) : null}
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
        {ADVANCED_CONSTRAINTS_ENABLED ? (
          // Grouped by the same top-border divider the app uses elsewhere (e.g. the plan Summary
          // popover) rather than a bespoke bordered card, so the fields read like every other stacked
          // field in this dialog. `<fieldset>`/`<legend>` keep the semantic grouping without the box.
          <fieldset className="border-border flex flex-col gap-4 border-t pt-4">
            <legend className="sr-only">Advanced scheduling</legend>
            <p className="text-sm font-medium" aria-hidden="true">
              Advanced scheduling
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="activity-secondary-constraint-type">Secondary constraint</Label>
              <Select
                id="activity-secondary-constraint-type"
                aria-invalid={errors.secondaryConstraintType ? true : undefined}
                aria-describedby={
                  errors.secondaryConstraintType
                    ? 'activity-secondary-constraint-help activity-secondary-constraint-type-error'
                    : 'activity-secondary-constraint-help'
                }
                {...register('secondaryConstraintType')}
              >
                <option value="">None</option>
                {SELECTABLE_CONSTRAINT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {CONSTRAINT_TYPE_LABELS[value]}
                  </option>
                ))}
                {secondaryParkedValue ? (
                  <option value={secondaryParkedValue}>
                    {PARKED_CONSTRAINT_LABELS[secondaryParkedValue]}
                  </option>
                ) : null}
              </Select>
              <p id="activity-secondary-constraint-help" className="text-muted-foreground text-sm">
                A second date constraint that drives the activity’s late dates — e.g. a primary
                “start no earlier than” with a secondary “finish no later than”. The primary
                constraint drives its early dates.
              </p>
              {errors.secondaryConstraintType?.message ? (
                <p
                  id="activity-secondary-constraint-type-error"
                  className="text-destructive-text text-sm"
                >
                  {errors.secondaryConstraintType.message}
                </p>
              ) : null}
            </div>
            {secondaryConstraintType ? (
              <TextField
                label="Secondary constraint date"
                type="date"
                error={errors.secondaryConstraintDate?.message}
                {...register('secondaryConstraintDate')}
              />
            ) : null}
            <CheckboxField
              label="Schedule as late as possible"
              hint="Draws the activity at its latest position without changing its dates or float. A display preference, not a date constraint."
              {...register('scheduleAsLateAsPossible')}
            />
            {/* Expected finish sizes work to a target finish, so it's meaningless for a milestone
                (a point in time, 0 duration) — hidden for those types, mirroring the Duration field. */}
            {isMilestoneType(type) ? null : (
              <TextField
                label="Expected finish (optional)"
                type="date"
                hint="A target finish date. When the plan’s “Expected-finish scheduling” option is on, the engine sizes this activity’s work so it finishes on this date (Recalculate to apply)."
                error={errors.expectedFinish?.message}
                {...register('expectedFinish')}
              />
            )}
          </fieldset>
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
