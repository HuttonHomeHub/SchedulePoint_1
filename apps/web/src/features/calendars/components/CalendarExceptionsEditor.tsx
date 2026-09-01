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

import { useRegisterUnsavedWork } from '@/components/layout/unsaved-work/unsaved-work-provider';
import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { WindowListEditor } from '@/components/ui/window-list-editor';
import { ApiFetchError } from '@/lib/api/client';
import { formatCalendarDate } from '@/lib/format-date';
import { buildReport } from '@/lib/unsaved-work/report';

/** True when the error is the API's 409 "an exception already exists for that date". */
function isDuplicateException(error: unknown): boolean {
  return (
    error instanceof ApiFetchError &&
    error.status === 409 &&
    (error.error.details as { reason?: string } | undefined)?.reason === DUPLICATE_EXCEPTION
  );
}

/**
 * How an exception's span reads: one day as itself, a range as `from – to` (surface audit F2).
 *
 * Stated once and used for the row, the edit form's heading, its hours legend and every
 * announcement, so a two-week shutdown cannot appear as a fortnight in one place and as its first
 * day in another. Takes the two dates rather than the whole exception because the add form
 * announces a span it has only just typed and has no row to pass.
 */
function formatExceptionSpan(date: string, endDate: string | undefined): string {
  const first = formatCalendarDate(date);
  if (endDate === undefined || endDate === '' || endDate === date) return first;
  return `${first} – ${formatCalendarDate(endDate)}`;
}

/** The three options offered — see {@link ExceptionKind}. */
const OFFERED_KINDS: ExceptionKind[] = ['holiday', 'allDay', 'hours'];

/** What an exception does to its day. */
function ExceptionKindSelect({
  kind,
  onKindChange,
  selectId,
}: {
  kind: ExceptionKind;
  onKindChange: (kind: ExceptionKind) => void;
  selectId: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={selectId}>Type</Label>
      <Select
        id={selectId}
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
  if (kind !== 'hours') return null;
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
 * Edit one exception's span, hours and label in place (ADR-0067 §3, flag-on only).
 *
 * The FIRST day is not editable here — moving an exception is remove-then-add, which the
 * neighbouring actions already do visibly. Its LAST day is: extending a shutdown by two days is
 * not moving anything, it is the edit a planner most often needs, and the alternative is the
 * delete-then-recreate this form exists to remove (surface audit F2). `version` is the exception's
 * own, so a row edited from two tabs is a 409 rather than a silent overwrite.
 */
function ExceptionEditForm({
  exception,
  orgSlug,
  calendarId,
  onDone,
  onDirtyChange,
}: {
  exception: CalendarExceptionSummary;
  orgSlug: string;
  calendarId: string;
  onDone: () => void;
  /**
   * Report edits to the host so the unsaved-work guard can see them. This form holds ALL of its
   * state in `useState` — kind, rows, label, end date — so nothing here is visible to any
   * `formState.isDirty`, and before this it was guarded by nothing at all: a planner could extend a
   * shutdown, add specific hour windows, and lose every keystroke to a reload in silence. Found by
   * the ux review, which named it as a second instance of the very defect this feature exists to
   * close, shipping in the same change.
   */
  onDirtyChange?: (dirty: boolean) => void;
}): React.ReactElement {
  const updateException = useUpdateException(orgSlug, calendarId);
  const announce = useAnnounce();
  const selectId = useId();
  // The Edit trigger that opened this form has just been unmounted, so focus is on `<body>` unless
  // something claims it. Claimed here, on the first control, the way `WindowListEditor` claims it
  // after removing a row — a keyboard user must not have to find their way back to a form they
  // just opened. `onDone` restores focus to the row's own trigger (see the row below).
  const firstControlRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstControlRef.current?.focus();
  }, []);
  const [kind, setKind] = useState<ExceptionKind>(() => exceptionKindOf(exception));
  const [rows, setRows] = useState<TimeRow[]>(() => exceptionRowsOf(exception));
  const [label, setLabel] = useState(exception.label ?? '');
  const [endDate, setEndDate] = useState(exception.endDate);
  const [problems, setProblems] = useState<readonly WindowProblem[]>([]);
  const [message, setMessage] = useState<string | undefined>(undefined);

  // Compared against what the row held when Edit opened it — there is no `isDirty` to ask.
  const editDirty =
    kind !== exceptionKindOf(exception) ||
    label !== (exception.label ?? '') ||
    endDate !== exception.endDate ||
    JSON.stringify(rows) !== JSON.stringify(exceptionRowsOf(exception));
  useEffect(() => {
    onDirtyChange?.(editDirty);
  }, [onDirtyChange, editDirty]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  // Checked here as well as at the API for the same reason the add form checks it: the 422 is the
  // enforcing boundary, but a planner who has just typed both dates should be told at the field.
  const rangeError =
    endDate !== '' && endDate < exception.date
      ? 'The last day cannot be before the first day.'
      : undefined;

  const onSave = (): void => {
    if (rangeError !== undefined) return;
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
        // Emptying the field collapses the range to its first day rather than meaning "unchanged":
        // there is no such thing as an exception with no last day, so a blank has to mean something,
        // and "one day" is the only reading that matches what the field shows when it is blank.
        endDate: endDate === '' ? exception.date : endDate,
        hours,
        label: label.trim() === '' ? null : label.trim(),
      },
      {
        onSuccess: (updated) => {
          announce(`Exception on ${formatExceptionSpan(updated.date, updated.endDate)} updated.`);
          onDone();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">{formatExceptionSpan(exception.date, exception.endDate)}</p>
      {updateException.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {updateException.error.message}
        </p>
      ) : null}
      <TextField
        ref={firstControlRef}
        label="To"
        type="date"
        value={endDate}
        min={exception.date}
        error={rangeError}
        hint={`Last day of the exception. Set to ${formatCalendarDate(exception.date)} for a single day.`}
        onChange={(event) => setEndDate(event.target.value)}
      />
      <ExceptionKindSelect kind={kind} onKindChange={setKind} selectId={selectId} />
      <ExceptionWindowFields
        kind={kind}
        rows={rows}
        onRowsChange={setRows}
        problems={problems}
        message={message}
        legend={`Hours on ${formatExceptionSpan(exception.date, exception.endDate)}`}
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
  open = true,
}: {
  orgSlug: string;
  calendarId: string;
  readOnly?: boolean;
  /**
   * Whether the dialog hosting this editor is showing.
   *
   * **Required for correctness, not tidiness.** `Dialog` renders its children unconditionally
   * (`components/ui/dialog.tsx:133`) — it toggles the native `<dialog>`, it does not unmount the
   * subtree — and `CalendarsTable` keeps the calendar dialog permanently mounted. So without this
   * gate a half-typed exception stayed registered after the dialog closed, and every later
   * navigation was blocked by a scope the reader could no longer see or resolve. Found by the
   * component review; the three sibling registrants all gate on `open` and this one did not.
   */
  open?: boolean;
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
  const [editDirty, setEditDirty] = useState(false);
  // `useId`, not a hard-coded string: two editors on one screen would otherwise share a `<label>`
  // target and the second one's Type field would be unlabelled. The edit form already did this.
  const addKindId = useId();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ExceptionFormValues>({
    resolver: zodResolver(exceptionFormSchema),
    defaultValues: { date: '', endDate: '', isWorking: false, label: '' },
  });

  /**
   * A half-entered exception is unsaved work too — the dates and hours a planner has typed but not
   * added yet. Registered as one scope: unlike the calendar form beside it, everything here does
   * live in react-hook-form, so `isDirty` is the whole answer.
   */
  useRegisterUnsavedWork(
    open && (isDirty || editDirty)
      ? buildReport('This calendar exception', [
          { when: isDirty, key: 'add', label: 'New exception', savable: true },
          { when: editDirty, key: 'edit', label: 'Exception being edited', savable: true },
        ])
      : null,
  );

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
          announce(`Exception on ${formatExceptionSpan(values.date, values.endDate)} added.`);
          reset({ date: '', endDate: '', isWorking: false, label: '' });
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
        announce(`Exception on ${formatExceptionSpan(exception.date, exception.endDate)} removed.`);
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
          <NoticeStrip emphasis="dashed" message="No exceptions yet." />
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {calendar.data.exceptions.map((exception) => (
              <li
                key={exception.id}
                className={
                  editingId === exception.id
                    ? 'border-border rounded-md border p-2'
                    : 'border-border flex items-center justify-between gap-3 rounded-md border p-2'
                }
              >
                {editingId === exception.id ? (
                  <ExceptionEditForm
                    exception={exception}
                    orgSlug={orgSlug}
                    calendarId={calendarId}
                    onDone={() => closeEditor(exception.id)}
                    onDirtyChange={setEditDirty}
                  />
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-medium">
                        {formatExceptionSpan(exception.date, exception.endDate)}
                      </span>
                      <Badge variant={exception.isWorking ? 'neutral' : 'warning'} size="sm">
                        {exception.isWorking ? 'Working day' : 'Holiday'}
                      </Badge>
                      {/* The hours a "Working day" badge alone cannot express — a half-day reads
                          as an ordinary worked day without them (ADR-0067 §3). */}
                      {exceptionKindOf(exception) === 'hours' ? (
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(exception.id)}
                          // Queried by `closeEditor` to hand focus back to the control that
                          // opened the form — a per-row ref map for one lookup would be worse.
                          data-edit-exception={exception.id}
                          aria-label={`Edit exception on ${formatExceptionSpan(exception.date, exception.endDate)}`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(exception)}
                          aria-label={`Remove exception on ${formatExceptionSpan(exception.date, exception.endDate)}`}
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
              label="From"
              type="date"
              error={errors.date?.message}
              className="sm:w-auto"
              {...register('date')}
            />
            {/* One exception with a span, not fourteen entries for a Christmas fortnight (surface
                audit F2). Optional, and empty means a single day — which is what a date on its own
                has always meant, so nothing a planner already knows how to enter changes. */}
            <TextField
              label="To (optional)"
              type="date"
              error={errors.endDate?.message}
              hint="Leave empty for a single day."
              className="sm:w-auto"
              {...register('endDate')}
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
