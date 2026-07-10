import { zodResolver } from '@hookform/resolvers/zod';
import type { CalendarExceptionSummary } from '@repo/types';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useAddException, useCalendar, useRemoveException } from '../api/use-calendars';
import {
  DUPLICATE_EXCEPTION,
  exceptionFormSchema,
  type ExceptionFormValues,
} from '../schemas/calendar-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ApiFetchError } from '@/lib/api/client';
import { formatCalendarDate } from '@/lib/format-date';

/** True when the error is the API's 409 "an exception already exists for that date". */
function isDuplicateException(error: unknown): boolean {
  return (
    error instanceof ApiFetchError &&
    error.status === 409 &&
    (error.error.details as { reason?: string } | undefined)?.reason === DUPLICATE_EXCEPTION
  );
}

/**
 * A calendar's dated exceptions: list the existing overrides (each with a
 * working/holiday text indicator, not colour alone). Writers additionally get a
 * Remove action per row and a small add form; `readOnly` hides both (every member
 * may read a calendar's holidays, spec US-4). A duplicate-date conflict (409) is
 * surfaced as a friendly inline message. Fetches the calendar detail itself so it
 * can stay embedded in the calendar dialog.
 */
export function CalendarExceptionsEditor({
  orgSlug,
  calendarId,
  readOnly = false,
}: {
  orgSlug: string;
  calendarId: string;
  readOnly?: boolean;
}): React.ReactElement {
  const calendar = useCalendar(orgSlug, calendarId);
  const addException = useAddException(orgSlug, calendarId);
  const removeException = useRemoveException(orgSlug, calendarId);
  const announce = useAnnounce();
  const listRegionRef = useRef<HTMLDivElement>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExceptionFormValues>({
    resolver: zodResolver(exceptionFormSchema),
    defaultValues: { date: '', isWorking: false, label: '' },
  });

  const onAdd = handleSubmit((values) => {
    addException.mutate(values, {
      onSuccess: () => {
        announce(`Exception on ${formatCalendarDate(values.date)} added.`);
        reset({ date: '', isWorking: false, label: '' });
      },
    });
  });

  const onRemove = (exception: CalendarExceptionSummary): void => {
    removeException.mutate(exception.id, {
      onSuccess: () => {
        announce(`Exception on ${formatCalendarDate(exception.date)} removed.`);
        // The removed row (and its Remove button) unmounts, so move focus to the
        // stable list region rather than letting it fall back to <body>.
        listRegionRef.current?.focus();
      },
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Exceptions</h3>
        <p className="text-muted-foreground text-sm">
          Override the weekly pattern for specific dates (e.g. holidays or a worked weekend).
        </p>
      </div>

      <div ref={listRegionRef} tabIndex={-1} className="outline-none">
        {calendar.isPending ? (
          <Spinner label="Loading exceptions…" />
        ) : calendar.isError ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-destructive-text text-sm">
              Couldn’t load exceptions. Please try again.
            </p>
            <Button variant="outline" size="sm" onClick={() => void calendar.refetch()}>
              Try again
            </Button>
          </div>
        ) : calendar.data.exceptions.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            No exceptions yet.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {calendar.data.exceptions.map((exception) => (
              <li
                key={exception.id}
                className="border-border flex items-center justify-between gap-3 rounded-md border p-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-medium">{formatCalendarDate(exception.date)}</span>
                  <Badge variant={exception.isWorking ? 'neutral' : 'warning'} size="sm">
                    {exception.isWorking ? 'Working day' : 'Holiday'}
                  </Badge>
                  {exception.label ? (
                    <span className="text-muted-foreground truncate">{exception.label}</span>
                  ) : null}
                </div>
                {readOnly ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(exception)}
                    aria-label={`Remove exception on ${formatCalendarDate(exception.date)}`}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {readOnly ? null : (
        <form
          noValidate
          onSubmit={(event) => void onAdd(event)}
          className="border-border flex flex-col gap-3 rounded-md border p-3"
        >
          <FormErrorSummary errors={errors} />
          {addException.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {isDuplicateException(addException.error)
                ? 'An exception already exists for that date.'
                : addException.error.message}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextField
              label="Date"
              type="date"
              error={errors.date?.message}
              className="sm:w-auto"
              {...register('date')}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exception-kind">Type</Label>
              <Controller
                control={control}
                name="isWorking"
                render={({ field }) => (
                  <Select
                    id="exception-kind"
                    value={field.value ? 'working' : 'holiday'}
                    onChange={(event) => field.onChange(event.target.value === 'working')}
                  >
                    <option value="holiday">Holiday (non-working)</option>
                    <option value="working">Working day</option>
                  </Select>
                )}
              />
            </div>
            <TextField
              label="Label (optional)"
              autoComplete="off"
              error={errors.label?.message}
              className="sm:flex-1"
              {...register('label')}
            />
            <Button
              type="submit"
              disabled={addException.isPending}
              aria-busy={addException.isPending}
              aria-label="Add exception"
            >
              {addException.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
