import { zodResolver } from '@hookform/resolvers/zod';
import {
  DURATION_TYPES,
  SELECTABLE_CONSTRAINT_TYPES,
  isParkedConstraintType,
  type ActivitySummary,
  type CalendarSummary,
} from '@repo/types';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateActivity, useUpdateActivity } from '../api/use-activities';
import {
  ACCRUAL_TYPE_LABELS,
  ACCRUAL_TYPE_OPTIONS,
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
  DURATION_TYPE_LABELS,
  INHERIT_CALENDAR_LABEL,
  PERCENT_COMPLETE_TYPE_LABELS,
  PERCENT_COMPLETE_TYPE_OPTIONS,
  activityFormSchema,
  isDurationDerivedType,
  selectableActivityTypes,
  type ActivityFormValues,
} from '../schemas/activity-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import {
  CheckboxField,
  FormErrorSummary,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  ACTIVITY_CALENDAR_ENABLED,
  ADVANCED_ACTIVITY_TYPES_ENABLED,
  ADVANCED_CONSTRAINTS_ENABLED,
  COST_ACCRUAL_ENABLED,
  DURATION_TYPES_ENABLED,
  EARNED_VALUE_ENABLED,
  INTER_PROJECT_DATES_ENABLED,
  LIBRARY_SCOPING_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
} from '@/config/env';
import { calendarScopeErrorMessage } from '@/lib/api/calendar-scope-errors';
import {
  CALENDAR_TIER_GROUP_LABELS,
  groupCalendarsByTier,
  offerableCalendars,
  toCalendarOptions,
} from '@/lib/calendar-tiers';
import { PARKED_CONSTRAINT_LABELS } from '@/lib/constraint-format';
import { minorToMajorInput } from '@/lib/format-money';
import { matchesLibraryQuery } from '@/lib/library-filters';

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
  onSaved,
  activity,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
  planActivities = [],
  planActivitiesLoading = false,
  planActivitiesError = false,
}: {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
  /**
   * Called after an EDIT saves, with the pre-edit row and the server's post-edit row — the seam the
   * workspace uses to record an undo command (ADR-0048). Optional and additive: callers that don't
   * pass it (e.g. the activities table) behave exactly as before, and it never fires on create.
   */
  onSaved?: (before: ActivitySummary, after: ActivitySummary) => void;
  activity?: ActivitySummary;
  /** The org's calendars, for the calendar picker's options (route-composed). */
  calendars?: CalendarSummary[];
  /** The calendars list is still loading (its options aren't complete yet). */
  calendarsLoading?: boolean;
  /** The calendars list failed to load — surface it rather than silently offering only "inherit". */
  calendarsError?: boolean;
  /**
   * The plan's activities — the pool the WBS-nesting picker draws valid parents from (the summaries
   * within it, ADR-0038, F8). The **unfiltered** list: the dialog derives the summaries (and excludes
   * the activity being edited — it can't parent itself, and the API rejects it too). Route-composed
   * like {@link calendars} (reusing the plan's warm activities query), so the dialog stays a pure
   * presentation component. Only consulted when the WBS surface (`VITE_ADVANCED_ACTIVITY_TYPES`) is on.
   */
  planActivities?: ActivitySummary[];
  /** The plan activities are still loading (the parent options aren't complete yet). */
  planActivitiesLoading?: boolean;
  /** The plan activities failed to load — surface it rather than reading as a confirmed "no summaries". */
  planActivitiesError?: boolean;
}): React.ReactElement {
  const isEdit = activity !== undefined;
  const create = useCreateActivity(orgSlug, planId);
  const update = useUpdateActivity(orgSlug, planId);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  // The valid WBS parents: the plan's summaries minus the activity being edited (no self-parent; the
  // API rejects it too), derived from the unfiltered plan-activities pool.
  const parentOptions = planActivities.filter(
    (a) => a.type === 'WBS_SUMMARY' && a.id !== activity?.id,
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      name: '',
      code: '',
      type: 'TASK',
      durationType: 'FIXED_DURATION_AND_UNITS_TIME',
      durationDays: 1,
      constraintType: '',
      constraintDate: '',
      secondaryConstraintType: '',
      secondaryConstraintDate: '',
      scheduleAsLateAsPossible: false,
      expectedFinish: '',
      externalEarlyStart: '',
      externalLateFinish: '',
      calendarId: '',
      parentId: '',
      levelingPriority: undefined,
      percentCompleteType: 'DURATION',
      accrualType: 'UNIFORM',
      physicalPercentComplete: undefined,
      budgetedExpense: undefined,
      actualExpense: undefined,
      description: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: activity?.name ?? '',
        code: activity?.code ?? '',
        type: activity?.type ?? 'TASK',
        // Always seed from the row so a stored value round-trips even when the picker is hidden
        // (flag off) — an edit then never silently resets the duration type. Defaults to the API default.
        durationType: activity?.durationType ?? 'FIXED_DURATION_AND_UNITS_TIME',
        durationDays: activity?.durationDays ?? 1,
        constraintType: activity?.constraintType ?? '',
        constraintDate: activity?.constraintDate ?? '',
        // Always seed the M4 advanced fields from the row so a stored value round-trips even when the
        // fields are hidden (flag off) — an edit then never silently clears them.
        secondaryConstraintType: activity?.secondaryConstraintType ?? '',
        secondaryConstraintDate: activity?.secondaryConstraintDate ?? '',
        scheduleAsLateAsPossible: activity?.scheduleAsLateAsPossible ?? false,
        expectedFinish: activity?.expectedFinish ?? '',
        // Always seed the external / inter-project dates from the row so a stored value round-trips even
        // when the section is hidden (flag off) — an edit then never silently clears an imported bound.
        externalEarlyStart: activity?.externalEarlyStart ?? '',
        externalLateFinish: activity?.externalLateFinish ?? '',
        // Always seed from the row so the value round-trips even when the picker is hidden
        // (flag off) — an edit then never silently clears an assigned calendar. '' = inherit.
        calendarId: activity?.calendarId ?? '',
        // Seeded from the row so a stored WBS parent round-trips even with the picker hidden
        // (flag off) — an edit then never silently un-nests the activity. '' = top-level.
        parentId: activity?.parentId ?? '',
        // Always seed from the row so a stored levelling priority round-trips even with the field
        // hidden (flag off) — an edit then never silently clears it. `null` → undefined (blank).
        levelingPriority: activity?.levelingPriority ?? undefined,
        // Earned-Value inputs (EV4b): always seed from the row so a stored value round-trips even with
        // the fields hidden (flag off) — an edit then never clears them. `percentCompleteType` defaults
        // to the API default; `null` physical %/expense → undefined (blank), money minor → major units.
        percentCompleteType: activity?.percentCompleteType ?? 'DURATION',
        // Cost accrual (M7 rung 5, ADR-0044 §32): always seed from the row so a stored value round-trips
        // even with the picker hidden (flag off) — an edit then never silently resets it. API default UNIFORM.
        accrualType: activity?.accrualType ?? 'UNIFORM',
        physicalPercentComplete: activity?.physicalPercentComplete ?? undefined,
        budgetedExpense: minorToMajorInput(activity?.budgetedExpense),
        actualExpense: minorToMajorInput(activity?.actualExpense),
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
  const parentId = useWatch({ control, name: 'parentId' });
  const percentCompleteType = useWatch({ control, name: 'percentCompleteType' });
  // A seeded parent that isn't in the fetched summary list (still loading, or the parent was itself
  // deleted/changed): keep it visible as an honest one-off option so opening the form never silently
  // un-nests the activity — the same honest-selector pattern as the calendar picker.
  const missingParent = Boolean(parentId) && !parentOptions.some((p) => p.id === parentId);
  // A seeded non-inherit value that doesn't match any option (the list is still loading, or failed
  // to load): inject a synthetic option so the Select shows it as selected — never blank, which
  // would read as "inherit".
  const missingCalendar = Boolean(calendarId) && !calendars.some((c) => c.id === calendarId);
  // Behind `LIBRARY_SCOPING_ENABLED` the list spans two tiers (ADR-0053 §1) — the project's own
  // calendars alongside the organisation's — so the options are grouped under named `<optgroup>`s,
  // which a screen reader announces with the option. Not grouped when the project has none of its
  // own: a single-group list reads better flat.
  const calendarTiers = groupCalendarsByTier(calendars);
  const groupCalendars = LIBRARY_SCOPING_ENABLED && calendarTiers.project.length > 0;
  // The combobox's search term (ADR-0053 §4 / US-8). Not debounced: `calendars` is already the
  // COMPLETE project-usable library (paged in full), so this is a client-side array pass.
  const [calendarQuery, setCalendarQuery] = useState('');
  // Archived calendars are offered only when one IS the current value (US-8) — a calendar retired
  // after this activity was bound to it stays selected, badged, rather than reading as "inherit".
  const calendarOptions = useMemo(() => {
    if (!LIBRARY_SCOPING_ENABLED) return [];
    const offerable = offerableCalendars(calendars, calendarId ?? '').filter((calendar) =>
      matchesLibraryQuery(calendarQuery, calendar.name),
    );
    return toCalendarOptions(offerable, { grouped: groupCalendars });
  }, [calendars, calendarId, calendarQuery, groupCalendars]);
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
          onSuccess: (saved) => {
            announce(`Activity “${values.name}” saved.`);
            // Hand the before/after rows to the workspace so it can record an undo command (ADR-0048).
            // Optional — absent for the activities-table dialog, so that path is byte-identical.
            onSaved?.(activity, saved);
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
            {/* A calendar-scope rejection (ADR-0053 §2) reads as its own actionable sentence;
                every other failure keeps the server's message verbatim, exactly as before. */}
            {calendarScopeErrorMessage(mutation.error) ?? mutation.error.message}
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
        <SelectField
          label="Type"
          id="activity-type"
          error={errors.type?.message}
          {...register('type')}
        >
          {selectableActivityTypes(ADVANCED_ACTIVITY_TYPES_ENABLED, type).map((value) => (
            <option key={value} value={value}>
              {ACTIVITY_TYPE_LABELS[value]}
            </option>
          ))}
        </SelectField>
        {isDurationDerivedType(type) ? (
          type === 'LEVEL_OF_EFFORT' ? (
            <p className="text-muted-foreground text-sm">
              A level-of-effort activity’s duration is derived from its span — the start of its
              earliest start-to-start predecessor to the finish of its latest finish-to-finish
              successor. Add those links, then Recalculate.
            </p>
          ) : type === 'WBS_SUMMARY' ? (
            <p className="text-muted-foreground text-sm">
              A WBS summary’s dates roll up from the activities grouped under it — the earliest
              start to the latest finish of its branch. It carries no logic of its own (no
              dependencies). To fill it, open each activity in the branch and set its WBS summary to
              this one, then Recalculate.
            </p>
          ) : null
        ) : (
          <TextField
            label="Duration (working days)"
            type="number"
            min={0}
            error={errors.durationDays?.message}
            {...register('durationDays', { valueAsNumber: true })}
          />
        )}
        {/* Duration type governs the resource-units triad (ADR-0040), so it is meaningless for a type
            with no entered duration/units (a milestone, LOE or WBS summary) — hidden for those, mirroring
            the Duration field. */}
        {DURATION_TYPES_ENABLED && !isDurationDerivedType(type) ? (
          <SelectField
            label="Duration type"
            id="activity-duration-type"
            hint={
              'Defaults to “Fixed duration & units/time”. Sets how editing one of duration, units or ' +
              'units/time recomputes the others so units = duration × units/time stays true — e.g. a ' +
              'crew installing a fixed quantity takes longer if its rate drops. With “Fixed units” or ' +
              '“Fixed units/time”, the driving resource’s units ÷ rate derive this activity’s ' +
              'duration; with the two fixed-duration types, editing the duration here also updates ' +
              'the driving resource’s units or rate.'
            }
            {...register('durationType')}
          >
            {DURATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {DURATION_TYPE_LABELS[value]}
              </option>
            ))}
          </SelectField>
        ) : null}
        {/* The WBS hint is invariant to loading (mirrors the calendar picker), so it never asserts a
            false state while the plan activities are still resolving. The "no summaries yet"
            guidance is a distinct, appended clause shown only once the list has resolved empty —
            not conflated with loading or a load failure. */}
        {ADVANCED_ACTIVITY_TYPES_ENABLED ? (
          <SelectField
            label="WBS summary (optional)"
            id="activity-parent"
            disabled={planActivitiesLoading}
            aria-busy={planActivitiesLoading}
            errorRole="alert"
            error={
              planActivitiesError
                ? 'Couldn’t load the plan’s activities, so no WBS summaries are available to choose.'
                : undefined
            }
            hint={
              'Groups this activity under a WBS summary, whose dates roll up from its members.' +
              (!planActivitiesLoading &&
              !planActivitiesError &&
              parentOptions.length === 0 &&
              !missingParent
                ? ' There are no WBS summaries in this plan yet — create a “WBS summary” activity to nest others under it.'
                : '')
            }
            {...register('parentId')}
          >
            <option value="">None (top-level)</option>
            {/* A seeded parent not in the list stays selected under an honest label so the form
                  never silently un-nests the activity (never blank, which reads as "top-level"). */}
            {missingParent ? (
              <option value={parentId}>{planActivitiesLoading ? 'Loading…' : 'Unavailable'}</option>
            ) : null}
            {parentOptions.map((summary) => (
              <option key={summary.id} value={summary.id}>
                {summary.code ? `${summary.code} · ${summary.name}` : summary.name}
              </option>
            ))}
          </SelectField>
        ) : null}
        {ACTIVITY_CALENDAR_ENABLED ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-calendar">Calendar (optional)</Label>
            {LIBRARY_SCOPING_ENABLED ? (
              /* The shared APG combobox (ADR-0053 §4 / US-8): type-ahead over a large library, the
                 tiers as labelled option groups, and the "" = inherit choice as `emptyOption`. */
              <Combobox
                id="activity-calendar"
                value={calendarId ?? ''}
                onChange={(value) =>
                  setValue('calendarId', value, { shouldDirty: true, shouldValidate: true })
                }
                query={calendarQuery}
                onQueryChange={setCalendarQuery}
                options={calendarOptions}
                // The seeded calendar isn't resolvable from the list — still loading, or the list
                // failed to load. The combobox falls back to "Loading…"/"Unavailable" itself, so the
                // field is never blank (which would read as "inherit").
                selectedLabel={calendars.find((c) => c.id === calendarId)?.name}
                groupLabels={CALENDAR_TIER_GROUP_LABELS}
                emptyOption={{ label: INHERIT_CALENDAR_LABEL }}
                loading={calendarsLoading}
                errored={calendarsError}
                describedBy={
                  calendarsError
                    ? 'activity-calendar-help activity-calendar-error'
                    : 'activity-calendar-help'
                }
                invalid={calendarsError}
                toggleLabel="Show calendars"
                emptyMessage="No calendars match your search."
              />
            ) : (
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
                  <option value={calendarId}>
                    {calendarsLoading ? 'Loading…' : 'Unavailable'}
                  </option>
                ) : null}
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </option>
                ))}
              </Select>
            )}
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
        {/* Levelling priority (ADR-0041) only breaks ties when levelling delays over-allocated
            activities, so it is meaningless for a type levelling never moves (a milestone, LOE or WBS
            summary) — hidden for those, mirroring the Duration/Duration-type fields. */}
        {RESOURCE_LEVELLING_ENABLED && !isDurationDerivedType(type) ? (
          <TextField
            label="Levelling priority (optional)"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            hint="Lower wins the resource when two activities contend under resource levelling. Leave blank for lowest priority."
            error={errors.levelingPriority?.message}
            {...register('levelingPriority', {
              setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
            })}
          />
        ) : null}
        {/* Earned-Value inputs (EV4b, ADR-0042): the %-complete measure that earns value, an optional
            hand-entered physical % (only relevant to the PHYSICAL measure), and the lump-sum budgeted /
            actual expense carried on the activity. Meaningless for a type with no entered
            duration/units/cost (a milestone, LOE or WBS summary) — hidden for those, mirroring the
            Duration / Duration-type fields. Money is entered in major units (e.g. dollars). */}
        {(EARNED_VALUE_ENABLED || COST_ACCRUAL_ENABLED) && !isDurationDerivedType(type) ? (
          <fieldset className="border-border flex flex-col gap-4 border-t pt-4">
            <legend className="sr-only">Cost &amp; earned value</legend>
            <p className="text-sm font-medium" aria-hidden="true">
              Cost &amp; earned value
            </p>
            {EARNED_VALUE_ENABLED ? (
              <>
                <SelectField
                  label="% complete type"
                  id="activity-percent-complete-type"
                  hint={`${PERCENT_COMPLETE_TYPE_LABELS[percentCompleteType].description} It changes no dates — only how Earned value measures progress.`}
                  {...register('percentCompleteType')}
                >
                  {PERCENT_COMPLETE_TYPE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {PERCENT_COMPLETE_TYPE_LABELS[value].label}
                    </option>
                  ))}
                </SelectField>
                {percentCompleteType === 'PHYSICAL' ? (
                  <TextField
                    label="Physical % complete (optional)"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    hint="The hand-entered physical progress that earns value when the measure is Physical. 0–100."
                    error={errors.physicalPercentComplete?.message}
                    {...register('physicalPercentComplete', {
                      setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                    })}
                  />
                ) : null}
                <TextField
                  label="Budgeted expense (optional)"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  hint="A lump-sum budgeted cost for this activity, in the plan’s currency, on top of any resource-derived cost. Leave blank for none."
                  error={errors.budgetedExpense?.message}
                  {...register('budgetedExpense', {
                    setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                  })}
                />
                <TextField
                  label="Actual expense (optional)"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  hint="The lump-sum cost booked against this activity so far, in the plan’s currency. Leave blank for none."
                  error={errors.actualExpense?.message}
                  {...register('actualExpense', {
                    setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                  })}
                />
              </>
            ) : null}
            {/* Cost accrual (M7 rung 5, ADR-0044 §32): WHEN the cost is recognised in the Earned-Value
                Planned-Value curve, never a date. Its own flag, mirroring the %-complete-type picker. */}
            {COST_ACCRUAL_ENABLED ? (
              <SelectField
                label="Cost accrual"
                id="activity-accrual-type"
                hint={
                  'Sets when this activity’s cost is recognised: Start (all at the start), Uniform ' +
                  '(spread evenly), or End (all at the finish). It changes only when cost is ' +
                  'recognised in Earned value — never a date.'
                }
                {...register('accrualType')}
              >
                {ACCRUAL_TYPE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {ACCRUAL_TYPE_LABELS[value]}
                  </option>
                ))}
              </SelectField>
            ) : null}
          </fieldset>
        ) : null}
        <SelectField
          label="Constraint (optional)"
          id="activity-constraint-type"
          error={errors.constraintType?.message}
          hint={
            'Pins the activity’s start or finish to a date. Only constraints the scheduler applies ' +
            'exactly as named are listed (an existing value keeps its own label).'
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
        </SelectField>
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
            <SelectField
              label="Secondary constraint"
              id="activity-secondary-constraint-type"
              error={errors.secondaryConstraintType?.message}
              hint={
                'A second date constraint that drives the activity’s late dates — e.g. a primary ' +
                '“start no earlier than” with a secondary “finish no later than”. The primary ' +
                'constraint drives its early dates.'
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
            </SelectField>
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
            {/* Expected finish sizes work to a target finish, so it's meaningless for a type whose
                duration isn't entered — a milestone (a point in time) or a level-of-effort (span-
                derived) — hidden for those, mirroring the Duration field. */}
            {isDurationDerivedType(type) ? null : (
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
        {/* External / inter-project dates (ADR-0043 / ADR-0035 §30). Grouped by the same top-border
            divider as the other stacked sections (a `<fieldset>`/`<legend>` for the semantic grouping,
            no box). Shown for every type — a milestone can carry an external late finish too (A12500). */}
        {INTER_PROJECT_DATES_ENABLED ? (
          <fieldset className="border-border flex flex-col gap-4 border-t pt-4">
            <legend className="sr-only">External dates</legend>
            <p className="text-sm font-medium" aria-hidden="true">
              External dates
            </p>
            <p className="text-muted-foreground text-sm">
              Imported commitments from outside this plan (a vendor delivery, a downstream
              commissioning window). The later of the activity’s logic and the external early start
              drives its start; an external late finish earlier than the logic can achieve shows as
              negative float. They never override a hard constraint.
            </p>
            <TextField
              label="External early start (optional)"
              type="date"
              hint="The earliest an upstream plan or project hands this activity over. Recalculate to apply; the later of this and the activity’s logic wins. A date before the data date is honoured but can’t pull work earlier."
              error={errors.externalEarlyStart?.message}
              {...register('externalEarlyStart')}
            />
            <TextField
              label="External late finish (optional)"
              type="date"
              hint="The latest a downstream plan or project allows this activity to finish. Earlier than the logic can achieve, it shows as negative float."
              error={errors.externalLateFinish?.message}
              {...register('externalLateFinish')}
            />
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
