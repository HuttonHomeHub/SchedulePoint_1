import { zodResolver } from '@hookform/resolvers/zod';
import type { CalendarExceptionSummary } from '@repo/types';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  useAddException,
  useCalendar,
  useRemoveException,
  useUpdateException,
  type ExceptionHours,
} from '../api/use-calendars';
import {
  EXCEPTION_KIND_LABELS,
  exceptionKindOf,
  exceptionRowsOf,
  toExceptionHours,
  type ExceptionKind,
} from '../model/exception-hours';
import { formatWindowList } from '../model/shift-summary';
import type { TimeRow } from '../model/window-rows';
import type { WindowProblem } from '../model/window-rules';
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
import { WindowListEditor } from '@/components/ui/window-list-editor';
import { CALENDAR_SHIFT_EDITOR_ENABLED } from '@/config/env';
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

/** The options offered, flag off (two) and flag on (three) — see {@link ExceptionKind}. */
const OFFERED_KINDS: ExceptionKind[] = CALENDAR_SHIFT_EDITOR_ENABLED
  ? ['holiday', 'allDay', 'hours']
  : ['holiday', 'allDay'];

/** What an exception does to its day. Flag off, the same two options it has always offered. */
function ExceptionKindSelect({
  kind,
  onKindChange,
  selectId,
  selectRef,
}: {
  kind: ExceptionKind;
  onKindChange: (kind: ExceptionKind) => void;
  selectId: string;
  /** Lets a host claim focus for this control — the edit form does, on open. */
  selectRef?: React.Ref<HTMLSelectElement>;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={selectId}>Type</Label>
      <Select
        id={selectId}
        {...(selectRef ? { ref: selectRef } : {})}
        value={kind}
        onChange={(event) => onKindChange(event.target.value as ExceptionKind)}
      >
        {OFFERED_KINDS.map((option) => (
          <option key={option} value={option}>
            {EXCEPTION_KIND_LABELS[option]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * The hours a "specific hours" exception works — nothing at all in any other state.
 *
 * Paired with {@link ExceptionKindSelect} rather than merged into it because the two sit in
 * different places in the add form's layout: the select is one control in the inline row, while a
 * list of periods needs the full width below it. They are used together at both call sites, and
 * both go through {@link toExceptionHours}, which is where the rule they must agree on actually
 * lives — a second copy of *that* is the drift that would matter.
 */
function ExceptionWindowFields({
  kind,
  rows,
  onRowsChange,
  problems,
  message,
  legend,
}: {
  kind: ExceptionKind;
  rows: readonly TimeRow[];
  onRowsChange: (rows: TimeRow[]) => void;
  problems: readonly WindowProblem[];
  message?: string | undefined;
  legend: string;
}): React.ReactElement | null {
  if (!CALENDAR_SHIFT_EDITOR_ENABLED || kind !== 'hours') return null;
  return (
    <div className="flex flex-col gap-1.5">
      <WindowListEditor
        legend={legend}
        rows={rows}
        onChange={onRowsChange}
        problems={problems}
        emptyLabel="No hours yet."
      />
      {message ? (
        <p role="alert" className="text-destructive-text text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Edit one exception's hours and label in place (ADR-0067 §3, flag-on only).
 *
 * The date is not editable here — moving an exception is remove-then-add, which the neighbouring
 * actions already do visibly. `version` is the exception's own, so a row edited from two tabs is a
 * 409 rather than a silent overwrite.
 */
function ExceptionEditForm({
  exception,
  orgSlug,
  calendarId,
  onDone,
}: {
  exception: CalendarExceptionSummary;
  orgSlug: string;
  calendarId: string;
  onDone: () => void;
}): React.ReactElement {
  const updateException = useUpdateException(orgSlug, calendarId);
  const announce = useAnnounce();
  const selectId = useId();
  // The Edit trigger that opened this form has just been unmounted, so focus is on `<body>` unless
  // something claims it. Claimed here, on the first control, the way `WindowListEditor` claims it
  // after removing a row — a keyboard user must not have to find their way back to a form they
  // just opened. `onDone` restores focus to the row's own trigger (see the row below).
  const firstControlRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    firstControlRef.current?.focus();
  }, []);
  const [kind, setKind] = useState<ExceptionKind>(() => exceptionKindOf(exception));
  const [rows, setRows] = useState<TimeRow[]>(() => exceptionRowsOf(exception));
  const [label, setLabel] = useState(exception.label ?? '');
  const [problems, setProblems] = useState<readonly WindowProblem[]>([]);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const onSave = (): void => {
    const result = toExceptionHours(kind, rows);
    if (!result.ok) {
      setProblems(result.problems);
      setMessage(result.message);
      return;
    }
    setProblems([]);
    setMessage(undefined);
    const hours: ExceptionHours = result.hours;
    updateException.mutate(
      {
        exceptionId: exception.id,
        version: exception.version,
        hours,
        label: label.trim() === '' ? null : label.trim(),
      },
      {
        onSuccess: () => {
          announce(`Exception on ${formatCalendarDate(exception.date)} updated.`);
          onDone();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">{formatCalendarDate(exception.date)}</p>
      {updateException.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {updateException.error.message}
        </p>
      ) : null}
      <ExceptionKindSelect
        kind={kind}
        onKindChange={setKind}
        selectId={selectId}
        selectRef={firstControlRef}
      />
      <ExceptionWindowFields
        kind={kind}
        rows={rows}
        onRowsChange={setRows}
        problems={problems}
        message={message}
        legend={`Hours on ${formatCalendarDate(exception.date)}`}
      />
      <TextField
        label="Label (optional)"
        autoComplete="off"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          // `aria-disabled` + the class pair, never the native attribute: a natively disabled
          // button is blurred to `<body>` the instant it flips, and it flips twice per save. The
          // class is not decoration — without it the control announces as unavailable to assistive
          // tech while remaining fully clickable, which is a Name/Role/Value mismatch AND a
          // double-submit. (Shipped without it; caught by the a11y and component gates together.)
          className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
          onClick={() => {
            if (updateException.isPending) return;
            onSave();
          }}
          aria-disabled={updateException.isPending}
          aria-busy={updateException.isPending}
        >
          {updateException.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * A calendar's dated exceptions: list the existing overrides (each with a
 * working/holiday text indicator, not colour alone). Writers additionally get a
 * Remove action per row and a small add form; `readOnly` hides both (every member
 * may read a calendar's holidays, spec US-4). A duplicate-date conflict (409) is
 * surfaced as a friendly inline message. Fetches the calendar detail itself so it
 * can stay embedded in the calendar dialog.
 *
 * Behind `VITE_CALENDAR_SHIFT_EDITOR` a worked exception may carry **specific hours** rather than
 * only "the whole day works" (ADR-0067 §3) — a half-day before a holiday, or a shutdown day with a
 * short crew — and each row gains an Edit action, so correcting one no longer means deleting it and
 * adding it back. Flag off, this surface is exactly what it was.
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
  const [kind, setKind] = useState<ExceptionKind>('holiday');
  const [rows, setRows] = useState<TimeRow[]>([]);
  const [problems, setProblems] = useState<readonly WindowProblem[]>([]);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  // `useId`, not a hard-coded string: two editors on one screen would otherwise share a `<label>`
  // target and the second one's Type field would be unlabelled. The edit form already did this.
  const addKindId = useId();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExceptionFormValues>({
    resolver: zodResolver(exceptionFormSchema),
    defaultValues: { date: '', isWorking: false, label: '' },
  });

  const onAdd = handleSubmit((values) => {
    const result = toExceptionHours(kind, rows);
    if (!result.ok) {
      setProblems(result.problems);
      setMessage(result.message);
      return;
    }
    setProblems([]);
    setMessage(undefined);
    addException.mutate(
      { ...values, isWorking: kind === 'allDay', hours: result.hours },
      {
        onSuccess: () => {
          announce(`Exception on ${formatCalendarDate(values.date)} added.`);
          reset({ date: '', isWorking: false, label: '' });
          setKind('holiday');
          setRows([]);
        },
      },
    );
  });

  /**
   * Leave edit mode and put focus back on the row's own Edit button.
   *
   * Closing unmounts the form, so without this focus falls to `<body>` — the same defect
   * `onRemove` below already guards against, and the reason a keyboard user who cancels an edit
   * would otherwise be returned to the top of the document.
   */
  const closeEditor = (exceptionId: string): void => {
    setEditingId(null);
    // After the row re-renders. The trigger does not exist yet in this tick.
    requestAnimationFrame(() => {
      const trigger = listRegionRef.current?.querySelector<HTMLElement>(
        `[data-edit-exception="${exceptionId}"]`,
      );
      (trigger ?? listRegionRef.current)?.focus();
    });
  };

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
                className={
                  CALENDAR_SHIFT_EDITOR_ENABLED && editingId === exception.id
                    ? 'border-border rounded-md border p-2'
                    : 'border-border flex items-center justify-between gap-3 rounded-md border p-2'
                }
              >
                {CALENDAR_SHIFT_EDITOR_ENABLED && editingId === exception.id ? (
                  <ExceptionEditForm
                    exception={exception}
                    orgSlug={orgSlug}
                    calendarId={calendarId}
                    onDone={() => closeEditor(exception.id)}
                  />
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-medium">{formatCalendarDate(exception.date)}</span>
                      <Badge variant={exception.isWorking ? 'neutral' : 'warning'} size="sm">
                        {exception.isWorking ? 'Working day' : 'Holiday'}
                      </Badge>
                      {/* The hours a "Working day" badge alone cannot express — a half-day reads
                          as an ordinary worked day without them (ADR-0067 §3). */}
                      {CALENDAR_SHIFT_EDITOR_ENABLED && exceptionKindOf(exception) === 'hours' ? (
                        <span className="text-muted-foreground shrink-0">
                          {formatWindowList(exception.windows)}
                        </span>
                      ) : null}
                      {exception.label ? (
                        <span className="text-muted-foreground truncate">{exception.label}</span>
                      ) : null}
                    </div>
                    {readOnly ? null : (
                      <div className="flex shrink-0 items-center">
                        {CALENDAR_SHIFT_EDITOR_ENABLED ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(exception.id)}
                            // Queried by `closeEditor` to hand focus back to the control that
                            // opened the form — a per-row ref map for one lookup would be worse.
                            data-edit-exception={exception.id}
                            aria-label={`Edit exception on ${formatCalendarDate(exception.date)}`}
                          >
                            Edit
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(exception)}
                          aria-label={`Remove exception on ${formatCalendarDate(exception.date)}`}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </>
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
            <ExceptionKindSelect kind={kind} onKindChange={setKind} selectId={addKindId} />
            <TextField
              label="Label (optional)"
              autoComplete="off"
              error={errors.label?.message}
              className="sm:flex-1"
              {...register('label')}
            />
            <Button
              type="submit"
              // `aria-disabled`, never the native attribute — see the Save button above. The
              // accessible name tracks the visible text so it stays contained in it (SC 2.5.3).
              className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
              aria-disabled={addException.isPending}
              aria-busy={addException.isPending}
              aria-label={addException.isPending ? 'Adding exception' : 'Add exception'}
            >
              {addException.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
          <ExceptionWindowFields
            kind={kind}
            rows={rows}
            onRowsChange={setRows}
            problems={problems}
            message={message}
            legend="Exception hours"
          />
        </form>
      )}
    </section>
  );
}
