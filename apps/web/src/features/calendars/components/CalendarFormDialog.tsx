import { zodResolver } from '@hookform/resolvers/zod';
import type { CalendarScope, CalendarSummary } from '@repo/types';
import { STANDARD_WEEKDAYS_MASK, WorkingWeekdays } from '@repo/types';
import { useEffect, useId, type Ref } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { useCreateCalendar, useUpdateCalendar } from '../api/use-calendars';
import {
  calendarFormSchema,
  CALENDAR_SCOPE_LABELS,
  WEEKDAY_LONG_LABELS,
  WEEKDAY_SHORT_LABELS,
  type CalendarFormValues,
} from '../schemas/calendar-schemas';

import { CalendarExceptionsEditor } from './CalendarExceptionsEditor';
import { CalendarScopeBadge } from './CalendarScopeBadge';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { LIBRARY_SCOPING_ENABLED } from '@/config/env';
import { calendarErrorMessage } from '@/lib/api/calendar-scope-errors';

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
            {calendarErrorMessage(mutation.error, 'Couldn’t save this calendar. Please try again.')}
          </p>
        ) : null}
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
              aria-invalid={blockedByOrgPermission || Boolean(errors.projectId) ? true : undefined}
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
              <CalendarScopeBadge calendar={calendar} {...(projectName ? { projectName } : {})} />
            </dd>
          </dl>
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
            <Button
              type="submit"
              disabled={mutation.isPending || blockedByOrgPermission}
              aria-busy={mutation.isPending}
            >
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
