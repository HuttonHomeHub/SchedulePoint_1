import { zodResolver } from '@hookform/resolvers/zod';
import type { CalendarScope, CalendarSummary } from '@repo/types';
import { deriveHoursPerDayMinutes, STANDARD_WEEKDAYS_MASK, WorkingWeekdays } from '@repo/types';
import { useEffect, useId, useState, type Ref } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { useCreateCalendar, useUpdateCalendar } from '../api/use-calendars';
import { presetWeek } from '../model/presets';
import { hasIntradayDetail } from '../model/shift-summary';
import {
  calendarFormSchema,
  CALENDAR_SCOPE_LABELS,
  WEEKDAY_LONG_LABELS,
  WEEKDAY_SHORT_LABELS,
  type CalendarFormValues,
} from '../schemas/calendar-schemas';

import { CalendarExceptionsEditor } from './CalendarExceptionsEditor';
import { CalendarScopeBadge } from './CalendarScopeBadge';
import {
  emptyWeek,
  shiftsToWeekRows,
  WeeklyShiftEditor,
  weekRowsToShifts,
  type WeekProblem,
  type WeekRows,
} from './WeeklyShiftEditor';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';
import { FieldGridContainer, FormSection } from '@/components/ui/form-layout';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { CALENDAR_SHIFT_EDITOR_ENABLED, LIBRARY_SCOPING_ENABLED } from '@/config/env';
import { calendarErrorMessage } from '@/lib/api/calendar-scope-errors';

/**
 * Accessible weekday toggle group bound to a {@link WorkingWeekdays} bitmask.
 * A `<fieldset>`/`<legend>` names the group; each day is a {@link ToggleChip} — the shared
 * `aria-pressed` primitive for an **independent boolean**, which is exactly what a weekday is
 * (turning Monday on says nothing about Tuesday). Its pressed state is carried by fill *and*
 * border, so meaning is never colour-only, and it is a real `<button>`, so the group stays fully
 * keyboard operable. The group-level validation error is linked via `aria-describedby`, and the
 * fieldset is programmatically focusable (`tabIndex={-1}`) with React Hook Form's `field.ref`
 * attached — so a failed submit moves focus here and the screen reader announces the group + its
 * error (a plain, non-focusable fieldset would never surface that description).
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
        {WEEKDAY_SHORT_LABELS.map((label, index) => (
          <ToggleChip
            key={label}
            pressed={WorkingWeekdays.has(value, index)}
            disabled={disabled}
            aria-label={WEEKDAY_LONG_LABELS[index]}
            onPressedChange={() => onChange(WorkingWeekdays.toggle(value, index))}
          >
            {label}
          </ToggleChip>
        ))}
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
 * Why the shared organisation library is out of reach, and what to do instead. One constant so the
 * blocking form of the message (nothing can be created) and the advisory form (the organisation
 * option is disabled beside a usable project option) never drift apart.
 */
const ORG_TIER_DENIED_MESSAGE =
  'You don’t have permission to add to the shared organisation library. Ask an organisation admin, or create this calendar inside a project instead.';

/**
 * Create-or-edit dialog for a calendar. The weekly pattern is a bitmask edited via the weekday
 * toggle group. In edit mode (`calendar` given) it PATCHes with the row's optimistic-locking
 * `version` and additionally surfaces the exceptions editor. When `readOnly` (a reader opening a
 * calendar), the fields and exceptions are shown but not editable — every member may read a
 * calendar's pattern and holidays (spec US-4), only Planners/Org Admins may change them.
 *
 * Behind `LIBRARY_SCOPING_ENABLED` (ADR-0053 §1) **creating** gains a scope choice: the shared
 * organisation library, or the project the dialog was opened from (`projectId`). The organisation
 * option additionally needs `calendar:manage_org` — without it the option is disabled with a plain
 * explanation rather than silently missing, so a planner learns why the choice is unavailable and
 * whom to ask. Opened from a project, the choice defaults to that project. **Editing** shows the
 * tier read-only: moving a calendar between tiers is a deliberate, separately-confirmed action (it
 * can be refused when the calendar is still in use), never a side effect of renaming it.
 */
/**
 * The hours-per-day a seeded week implies — the same derivation the server applies when the field
 * is omitted, so a newly-opened create dialog shows the figure it would get by saying nothing.
 */
function hoursPerDayOf(week: WeekRows): number {
  const parsed = weekRowsToShifts(week);
  return parsed.ok ? deriveHoursPerDayMinutes(parsed.shifts) / 60 : 24;
}

/** `9` and `7.5`, never `9.00` — the field accepts quarter hours, so trailing zeros are noise. */
function formatHours(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

export function CalendarFormDialog({
  orgSlug,
  open,
  onClose,
  calendar,
  readOnly = false,
  canManageOrg = true,
  projectId,
  projectName,
}: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  calendar?: CalendarSummary;
  readOnly?: boolean;
  /**
   * The viewer holds `calendar:manage_org` — may create in the SHARED organisation library
   * (ADR-0053 §2). Defaults to `true` so existing call sites (which only ever created org
   * calendars, under the same roles the permission is granted to) are unchanged.
   */
  canManageOrg?: boolean;
  /** Opened from a project's Calendars section — offers "this project" as the tier, and defaults to it. */
  projectId?: string;
  /** That project's name, for the scope option's label. */
  projectName?: string;
}): React.ReactElement {
  const isEdit = calendar !== undefined;
  const create = useCreateCalendar(orgSlug);
  const update = useUpdateCalendar(orgSlug);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();
  const scopeSelectId = useId();
  const scopeHelpId = useId();
  const scopeErrorId = useId();

  // The tier controls are meaningful only while creating: an existing calendar's tier moves through
  // the dedicated, confirmed Move actions.
  const creatingWithTiers = LIBRARY_SCOPING_ENABLED && !isEdit && !readOnly;
  const hasProjectContext = LIBRARY_SCOPING_ENABLED && Boolean(projectId);
  // The shared library needs `calendar:manage_org`; a project tier needs a project to be in.
  const orgTierUnavailable = creatingWithTiers && !canManageOrg;
  // Neither tier is reachable — so there is nothing to choose between, and nothing to create. Render
  // the reason instead of a `<select>` with no selectable option (a control that cannot be operated).
  const noTierAvailable = orgTierUnavailable && !hasProjectContext;
  const showScopeChoice = creatingWithTiers && !noTierAvailable;
  const defaultScope: CalendarScope = hasProjectContext ? 'PROJECT' : 'ORG';

  const {
    register,
    control,
    handleSubmit,
    setValue,
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
        // Absent unless the scope control is actually rendered, so the flag-off body is byte-identical
        // to before (no `scope`/`projectId` keys at all) and the server's ORG default applies.
        ...(creatingWithTiers ? { scope: defaultScope, ...(projectId ? { projectId } : {}) } : {}),
      });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, calendar?.id]);

  const chosenScope = useWatch({ control, name: 'scope' });
  // Creating in the shared library without `calendar:manage_org` — the API would 403, so say so here
  // and block the submit rather than letting the planner fill the form and lose the work. Covers both
  // "the only tier is out of reach" and "the disabled ORG option was somehow selected".
  const blockedByOrgPermission =
    noTierAvailable || (showScopeChoice && orgTierUnavailable && chosenScope !== 'PROJECT');

  // Flag OFF the week is seven checkboxes, which cannot express a split shift or a half-day
  // (ADR-0036 §2) — so say so rather than letting the form imply the mask is the whole truth.
  // Flag ON the editor expresses it, and the advisory would be false.
  const weekIsSimplified =
    !CALENDAR_SHIFT_EDITOR_ENABLED && isEdit && hasIntradayDetail(calendar.shifts);

  // The shift editor's rows live outside React Hook Form: they are TEXT the planner is mid-way
  // through typing, across seven days, and RHF's value/validation model would have to be told that
  // `8:` is a legitimate intermediate state. Seeded on open, parsed once at submit.
  const [week, setWeek] = useState<WeekRows>(emptyWeek);
  const [weekProblems, setWeekProblems] = useState<WeekProblem[]>([]);
  // Seeded by ADJUSTING STATE DURING RENDER rather than in an effect (React's documented pattern
  // for "reset state when a prop changes"). An effect would set state after paint — one frame of
  // last calendar's hours on screen — and a cascading re-render the lint rule correctly objects to.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = `${String(open)}:${calendar?.id ?? 'new'}`;
  if (CALENDAR_SHIFT_EDITOR_ENABLED && open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    // A NEW calendar starts from the Standard week preset — Mon–Fri 08:00–17:00 — not from a
    // full-day Mon–Fri. The old seed made every hand-made calendar a 24-hour one whose activities
    // then scheduled three times too fast, which is the defect the hours-per-day field exists to
    // stop; a construction calendar that works round the clock is the rare case, and it is now one
    // click away (the 24/7 preset).
    const seededWeek =
      calendar === undefined ? presetWeek('standard') : shiftsToWeekRows(calendar.shifts);
    setWeek(seededWeek);
    setWeekProblems([]);
    // The calendar's standard working day (ADR-0068). Seeded from the stored value so an edit that
    // touches nothing else sends it back unchanged; a NEW calendar takes the figure the server
    // would derive from the week seeded above, so the two can never open disagreeing.
    setValue('hoursPerDay', calendar?.hoursPerDay ?? hoursPerDayOf(seededWeek));
  }

  // What the authored week implies, shown beside the field rather than forced into it: the two are
  // legitimately different (a P6 `day_hr_cnt` of 8 on a calendar with a 10-hour Saturday is
  // ordinary), so this advises and never overwrites.
  const parsedWeek = CALENDAR_SHIFT_EDITOR_ENABLED ? weekRowsToShifts(week) : null;
  const suggestedHoursId = useId();
  const dayFactorWarningId = useId();
  const suggestedHoursPerDay =
    parsedWeek?.ok === true ? deriveHoursPerDayMinutes(parsedWeek.shifts) / 60 : null;
  // `useWatch`, not `watch()` — the file's existing convention, and the memoization-safe one.
  const hoursPerDayValue = useWatch({ control, name: 'hoursPerDay' }) ?? 24;
  const showSuggestedHours =
    suggestedHoursPerDay !== null && suggestedHoursPerDay !== hoursPerDayValue;
  // Only on an EDIT, and only once the number actually differs from what is stored — a create has
  // no existing durations to re-read, and warning about a value nobody changed is noise.
  const dayFactorChanged =
    CALENDAR_SHIFT_EDITOR_ENABLED &&
    isEdit &&
    Number.isFinite(hoursPerDayValue) &&
    hoursPerDayValue !== calendar.hoursPerDay;

  /**
   * Edit the week, and — **only once problems are already on screen** — re-check as it changes.
   *
   * Validating from the first keystroke would flag `8:` while a planner is still typing `8:30`,
   * which is why the check originally ran on Save alone. But the mirror of that is worse: after a
   * failed Save, a row corrected to something valid kept its red message until the planner pressed
   * Save again to find out, so the form could not tell them they had finished. This is React Hook
   * Form's own `reValidateMode: 'onChange'` rule, applied to the one piece of state RHF does not
   * hold: quiet until you submit, live afterwards.
   */
  const reviseWeek = (next: WeekRows): void => {
    setWeek(next);
    if (weekProblems.length === 0) return;
    const parsed = weekRowsToShifts(next);
    setWeekProblems(parsed.ok ? [] : parsed.problems);
  };

  const onSubmit = handleSubmit((values) => {
    if (CALENDAR_SHIFT_EDITOR_ENABLED) {
      const parsed = weekRowsToShifts(week);
      if (!parsed.ok) {
        // Stop here rather than sending a body the API will reject: the planner is looking at the
        // rows, and the server's message would name a pair rather than a row.
        setWeekProblems(parsed.problems);
        announce(`This calendar’s hours need attention: ${String(parsed.problems.length)} to fix.`);
        return;
      }
      setWeekProblems([]);
      const { workingWeekdays: _mask, ...rest } = values;
      const body = { ...rest, shifts: parsed.shifts };
      if (isEdit) {
        update.mutate(
          { calendarId: calendar.id, version: calendar.version, ...body },
          {
            onSuccess: () => {
              announce(`Calendar “${values.name}” saved.`);
              onClose();
            },
          },
        );
      } else {
        create.mutate(body, {
          onSuccess: () => {
            announce(`Calendar “${values.name}” created.`);
            onClose();
          },
        });
      }
      return;
    }

    if (isEdit) {
      // Send `workingWeekdays` ONLY when the planner actually changed it. The repository replaces
      // every shift row whenever this field is present, so a rename-only save used to silently
      // flatten a split shift to whole days — no error, no cue, and visible only in the request
      // body (spec Q0). Omitting it leaves the stored week untouched, which is what "I renamed a
      // calendar" should mean.
      const weekChanged = values.workingWeekdays !== calendar.workingWeekdays;
      const { workingWeekdays, ...rest } = values;
      update.mutate(
        {
          calendarId: calendar.id,
          version: calendar.version,
          ...rest,
          ...(weekChanged ? { workingWeekdays } : {}),
        },
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
      // Both paths take `lg` while the shift editor is on: create now renders the full seven-day
      // week plus the standard-working-day section, which `md` (448px) was sized for a name, a
      // description and seven checkboxes.
      size={isEdit || CALENDAR_SHIFT_EDITOR_ENABLED ? 'lg' : 'md'}
      title={title}
      {...(isEdit ? {} : { description: 'Define a reusable working-day pattern.' })}
    >
      <FieldGridContainer>
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
          <FormErrorSummary errors={errors} />
          {mutation.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {calendarErrorMessage(
                mutation.error,
                'Couldn’t save this calendar. Please try again.',
              )}
            </p>
          ) : null}

          {/* Sections as consecutive siblings (ADR-0061): what the calendar IS, then the working week
            it defines. The week is the calendar's substance, not a field among others. */}
          <div className="flex flex-col gap-5">
            <FormSection title="Identity">
              <TextField
                label="Name"
                autoComplete="off"
                readOnly={readOnly}
                error={errors.name?.message}
                {...register('name')}
              />
              {showScopeChoice ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={scopeSelectId}>Scope</Label>
                  <Select
                    id={scopeSelectId}
                    aria-invalid={
                      blockedByOrgPermission || Boolean(errors.projectId) ? true : undefined
                    }
                    aria-describedby={
                      blockedByOrgPermission || errors.projectId
                        ? `${scopeHelpId} ${scopeErrorId}`
                        : scopeHelpId
                    }
                    defaultValue={defaultScope}
                    {...register('scope')}
                  >
                    {/* Disabled — not removed — without `calendar:manage_org`: an option that silently
                  vanishes teaches nothing, whereas a disabled one plus the note below says exactly
                  what is missing. The API is still the enforcing boundary. */}
                    <option value="ORG" disabled={!canManageOrg}>
                      {CALENDAR_SCOPE_LABELS.ORG} (shared library)
                    </option>
                    {hasProjectContext ? (
                      <option value="PROJECT">
                        {projectName
                          ? `${CALENDAR_SCOPE_LABELS.PROJECT}: ${projectName}`
                          : `This ${CALENDAR_SCOPE_LABELS.PROJECT.toLowerCase()}`}
                      </option>
                    ) : null}
                  </Select>
                  <p id={scopeHelpId} className="text-muted-foreground text-sm">
                    {hasProjectContext
                      ? 'An organisation calendar is shared with every project; a project calendar is only offered inside this project.'
                      : 'Organisation calendars are shared with every project. To add one to a single project, open that project and use its Calendars section.'}
                  </p>
                  {/* One node, linked from the control by `aria-describedby`, so whichever reason applies
                is announced WITH the Select rather than only in the summary above. It is an `alert`
                only when it actually blocks the submit; when the organisation option is merely
                disabled beside a usable project option it is an ordinary hint, not an error. */}
                  {blockedByOrgPermission || errors.projectId?.message ? (
                    <p id={scopeErrorId} role="alert" className="text-destructive-text text-sm">
                      {blockedByOrgPermission ? ORG_TIER_DENIED_MESSAGE : errors.projectId?.message}
                    </p>
                  ) : null}
                  {orgTierUnavailable && !blockedByOrgPermission ? (
                    <p id={scopeErrorId} className="text-muted-foreground text-sm">
                      {ORG_TIER_DENIED_MESSAGE}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {/* No tier is reachable at all: no `<select>` to operate, just the reason (and the submit is
            disabled above), so the dialog is never a dead end with an unusable control. */}
              {noTierAvailable ? (
                <p role="alert" className="text-destructive-text text-sm">
                  {ORG_TIER_DENIED_MESSAGE}
                </p>
              ) : null}
              {/* Editing: the tier is shown, not edited — a `<dl>` so the value is programmatically
            associated with its term (the read-only convention used by the plan calendar picker). */}
              {LIBRARY_SCOPING_ENABLED && isEdit ? (
                <dl className="flex flex-col gap-1.5">
                  <dt className="text-sm font-medium">Scope</dt>
                  <dd>
                    <CalendarScopeBadge
                      calendar={calendar}
                      {...(projectName ? { projectName } : {})}
                    />
                  </dd>
                </dl>
              ) : null}
              <TextareaField
                label="Description"
                readOnly={readOnly}
                error={errors.description?.message}
                {...register('description')}
              />
            </FormSection>

            {CALENDAR_SHIFT_EDITOR_ENABLED ? (
              <>
                <WeeklyShiftEditor
                  week={week}
                  onChange={reviseWeek}
                  problems={weekProblems}
                  readOnly={readOnly}
                />
                <FormSection
                  title="Standard working day"
                  description="How many hours “one day” means on this calendar. An activity of 1 day is this many hours of work — so on an 08:00–17:00 week, one day is 9 hours and not 24."
                >
                  <TextField
                    label="Hours per day"
                    type="number"
                    step="0.25"
                    min={0.25}
                    max={24}
                    readOnly={readOnly}
                    error={errors.hoursPerDay?.message}
                    className="sm:w-40"
                    // BOTH notes are linked, not merely adjacent. Proximity is a sighted-reader
                    // convention: a screen-reader user who tabs here would otherwise hear the
                    // label and the validation error and nothing about the fact that this number
                    // re-reads every duration on the calendar.
                    aria-describedby={
                      [
                        showSuggestedHours ? suggestedHoursId : null,
                        dayFactorChanged ? dayFactorWarningId : null,
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    {...register('hoursPerDay', { valueAsNumber: true })}
                  />
                  {showSuggestedHours ? (
                    <p id={suggestedHoursId} className="text-muted-foreground text-sm">
                      The week above works {formatHours(suggestedHoursPerDay)} hours on a typical
                      day. Leaving this at {formatHours(hoursPerDayValue)} is allowed — P6 calendars
                      often do — but the two numbers mean different things and only this one
                      converts durations.
                    </p>
                  ) : null}
                  {dayFactorChanged ? (
                    // A DESCRIPTION, not a live region. It is derived from a value the planner is
                    // still typing, so `role="alert"` interrupted on every keystroke — announcing a
                    // transition rather than a settled result, the opposite of the rule this
                    // project states for status messages. Linked above, it is read when the field
                    // is reached and when it is re-read, which is when it matters.
                    <p id={dayFactorWarningId} className="text-destructive-text text-sm">
                      Changing this re-reads every existing duration on this calendar. No dates move
                      and no work is rescheduled — the stored hours are unchanged — but an activity
                      showing “10 days” today will show a different number of days after you save.
                    </p>
                  ) : null}
                </FormSection>
              </>
            ) : (
              <FormSection
                title="Working week"
                description="The days work happens on. Everything scheduled on this calendar counts its duration in these days."
              >
                {weekIsSimplified ? (
                  <p className="text-muted-foreground text-sm" role="note">
                    This calendar works specific hours — a split shift or a part day. The days below
                    show <em>which</em> days work, not their hours. Changing them replaces those
                    hours with whole days; leave them alone and the hours are kept.
                  </p>
                ) : null}
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
              </FormSection>
            )}
          </div>

          <div className="border-border flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {readOnly ? null : (
              <Button
                type="submit"
                // `aria-disabled` + the class pair, never the native attribute: a natively disabled
                // submit is blurred to `<body>` the instant it flips, and it flips twice per save
                // (ADR-0060 M6). The `pointer-events-none` is what makes it genuinely inert.
                className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
                aria-disabled={mutation.isPending || blockedByOrgPermission}
                aria-busy={mutation.isPending}
              >
                {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create calendar'}
              </Button>
            )}
          </div>
        </form>
      </FieldGridContainer>

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
