import { zodResolver } from '@hookform/resolvers/zod';
import type { CalendarSummary } from '@repo/types';
import { STANDARD_WEEKDAYS_MASK, WorkingWeekdays } from '@repo/types';
import { useEffect, useId, type Ref } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useCreateCalendar, useUpdateCalendar } from '../api/use-calendars';
import {
  calendarFormSchema,
  WEEKDAY_LONG_LABELS,
  WEEKDAY_SHORT_LABELS,
  type CalendarFormValues,
} from '../schemas/calendar-schemas';

import { CalendarExceptionsEditor } from './CalendarExceptionsEditor';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';

/**
 * Accessible weekday toggle group bound to a {@link WorkingWeekdays} bitmask.
 * A `<fieldset>`/`<legend>` names the group; each day is a real `<button>` with
 * `aria-pressed` carrying its on/off state (so meaning is not colour-only and the
 * control is fully keyboard operable). The group-level validation error is linked
 * via `aria-describedby`, and the fieldset is programmatically focusable
 * (`tabIndex={-1}`) with React Hook Form's `field.ref` attached — so a failed
 * submit moves focus here and the screen reader announces the group + its error
 * (a plain, non-focusable fieldset would never surface that description).
 */
function WeekdayToggleGroup({
  value,
  onChange,
  error,
  disabled,
  groupRef,
}: {
  value: number;
  onChange: (mask: number) => void;
  error?: string | undefined;
  disabled?: boolean;
  groupRef?: Ref<HTMLFieldSetElement>;
}): React.ReactElement {
  const errorId = useId();
  return (
    <fieldset
      ref={groupRef}
      tabIndex={-1}
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col gap-1.5 outline-none"
    >
      <legend className="text-sm font-medium">Working days</legend>
      <p className="text-muted-foreground mb-1.5 text-sm">
        The weekly pattern this calendar repeats.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_SHORT_LABELS.map((label, index) => {
          const pressed = WorkingWeekdays.has(value, index);
          return (
            <Button
              key={label}
              type="button"
              size="sm"
              variant={pressed ? 'default' : 'outline'}
              disabled={disabled}
              aria-pressed={pressed}
              aria-label={WEEKDAY_LONG_LABELS[index]}
              onClick={() => onChange(WorkingWeekdays.toggle(value, index))}
            >
              {label}
            </Button>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="text-destructive-text text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Create-or-edit dialog for an organisation calendar. The weekly pattern is a
 * bitmask edited via the weekday toggle group. In edit mode (`calendar` given) it
 * PATCHes with the row's optimistic-locking `version` and additionally surfaces the
 * exceptions editor. When `readOnly` (a reader opening a calendar), the fields and
 * exceptions are shown but not editable — every member may read a calendar's
 * pattern and holidays (spec US-4), only Planners/Org Admins may change them.
 */
export function CalendarFormDialog({
  orgSlug,
  open,
  onClose,
  calendar,
  readOnly = false,
}: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  calendar?: CalendarSummary;
  readOnly?: boolean;
}): React.ReactElement {
  const isEdit = calendar !== undefined;
  const create = useCreateCalendar(orgSlug);
  const update = useUpdateCalendar(orgSlug);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CalendarFormValues>({
    resolver: zodResolver(calendarFormSchema),
    defaultValues: { name: '', description: '', workingWeekdays: STANDARD_WEEKDAYS_MASK },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: calendar?.name ?? '',
        description: calendar?.description ?? '',
        workingWeekdays: calendar?.workingWeekdays ?? STANDARD_WEEKDAYS_MASK,
      });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, calendar?.id]);

  const onSubmit = handleSubmit((values) => {
    if (isEdit) {
      update.mutate(
        { calendarId: calendar.id, version: calendar.version, ...values },
        {
          onSuccess: () => {
            announce(`Calendar “${values.name}” saved.`);
            onClose();
          },
        },
      );
    } else {
      create.mutate(values, {
        onSuccess: () => {
          announce(`Calendar “${values.name}” created.`);
          onClose();
        },
      });
    }
  });

  const title = readOnly ? 'Calendar' : isEdit ? 'Edit calendar' : 'New calendar';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size={isEdit ? 'lg' : 'md'}
      title={title}
      {...(isEdit ? {} : { description: 'Define a reusable working-day pattern.' })}
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
          readOnly={readOnly}
          error={errors.name?.message}
          {...register('name')}
        />
        <Controller
          control={control}
          name="workingWeekdays"
          render={({ field }) => (
            <WeekdayToggleGroup
              value={field.value}
              onChange={field.onChange}
              disabled={readOnly}
              groupRef={field.ref}
              error={errors.workingWeekdays?.message}
            />
          )}
        />
        <TextareaField
          label="Description (optional)"
          readOnly={readOnly}
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {readOnly ? null : (
            <Button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create calendar'}
            </Button>
          )}
        </div>
      </form>

      {isEdit ? (
        <div className="border-border mt-6 border-t pt-6">
          <CalendarExceptionsEditor
            orgSlug={orgSlug}
            calendarId={calendar.id}
            readOnly={readOnly}
          />
        </div>
      ) : null}
    </Dialog>
  );
}
