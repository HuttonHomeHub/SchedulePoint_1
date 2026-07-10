import { zodResolver } from '@hookform/resolvers/zod';
import type { CalendarSummary } from '@repo/types';
import { STANDARD_WEEKDAYS_MASK, WorkingWeekdays } from '@repo/types';
import { useEffect, useId } from 'react';
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
 * `aria-pressed` carrying its on/off state (so meaning is not colour-only and
 * the control is fully keyboard operable). Toggling flips the day's bit.
 */
function WeekdayToggleGroup({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (mask: number) => void;
  error?: string | undefined;
}): React.ReactElement {
  const errorId = useId();
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 text-sm font-medium">Working days</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_SHORT_LABELS.map((label, index) => {
          const pressed = WorkingWeekdays.has(value, index);
          return (
            <Button
              key={label}
              type="button"
              size="sm"
              variant={pressed ? 'default' : 'outline'}
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
 * bitmask edited via the weekday toggle group. In edit mode (`calendar` given)
 * it PATCHes with the row's optimistic-locking `version` and additionally
 * surfaces the exceptions editor for that calendar.
 */
export function CalendarFormDialog({
  orgSlug,
  open,
  onClose,
  calendar,
}: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  calendar?: CalendarSummary;
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit calendar' : 'New calendar'}
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
              error={errors.workingWeekdays?.message}
            />
          )}
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
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create calendar'}
          </Button>
        </div>
      </form>

      {isEdit ? (
        <div className="border-border mt-6 border-t pt-6">
          <CalendarExceptionsEditor orgSlug={orgSlug} calendarId={calendar.id} />
        </div>
      ) : null}
    </Dialog>
  );
}
