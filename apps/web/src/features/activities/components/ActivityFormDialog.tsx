import { type ActivitySummary, type CalendarSummary } from '@repo/types';
import { useCallback, useEffect } from 'react';
import {
  useWatch,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import { useCreateActivity, useUpdateActivity } from '../api/use-activities';
import { DURATION_NEEDS_WHOLE_DAYS, durationWriteFields } from '../model/duration-field';
import { useDurationSeed } from '../model/use-duration-seed';
import {
  ACCRUAL_TYPE_LABELS,
  ACCRUAL_TYPE_OPTIONS,
  PERCENT_COMPLETE_TYPE_LABELS,
  PERCENT_COMPLETE_TYPE_OPTIONS,
  isDurationDerivedType,
  type ActivityFormValues,
} from '../schemas/activity-schemas';
import {
  activityCostSchema,
  activityGeneralSchema,
  activityMeasureSchema,
  activitySchedulingSchema,
  type ActivityCostValues,
  type ActivityGeneralValues,
  type ActivityMeasureValues,
  type ActivitySchedulingValues,
} from '../schemas/activity-scope-schemas';

import { seedCost, seedGeneral, seedMeasure, seedScheduling } from './activity-editor-seeds';
import { ActivityBreakdownField } from './fields/ActivityBreakdownField';
import { ActivityCalendarField } from './fields/ActivityCalendarField';
import { ActivityConstraintFields } from './fields/ActivityConstraintFields';
import { ActivityExternalDatesFields } from './fields/ActivityExternalDatesFields';
import { ActivityIdentityFields } from './fields/ActivityIdentityFields';
import { ActivityLevellingField } from './fields/ActivityLevellingField';
import { ActivityPlacementFields } from './fields/ActivityPlacementFields';
import { ActivityWorkFields } from './fields/ActivityWorkFields';
import { useScopeForm } from './useScopeForm';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormProblemCount, SelectField, TextField } from '@/components/ui/form';
import { FieldGrid, FieldGridContainer, FormSection } from '@/components/ui/form-layout';
import {
  ACTIVITY_CALENDAR_ENABLED,
  ADVANCED_ACTIVITY_TYPES_ENABLED,
  COST_ACCRUAL_ENABLED,
  EARNED_VALUE_ENABLED,
  INTER_PROJECT_DATES_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
} from '@/config/env';
import { calendarScopeErrorMessage } from '@/lib/api/calendar-scope-errors';
import {} from '@/lib/calendar-tiers';
import { effectiveHoursPerDay } from '@/lib/effective-hours-per-day';

/** One field, named against the scope form that owns it. The scope tag is what makes the list below
 * checkable: `{ scope: 'general', name: 'constraintType' }` does not compile, because
 * `FieldPath<ActivityGeneralValues>` has no such member. */
type SubmitFieldEntry =
  | { scope: 'general'; name: FieldPath<ActivityGeneralValues> }
  | { scope: 'scheduling'; name: FieldPath<ActivitySchedulingValues> }
  | { scope: 'measure'; name: FieldPath<ActivityMeasureValues> }
  | { scope: 'cost'; name: FieldPath<ActivityCostValues> };

/**
 * The order a failed submit walks to choose the **one** control it focuses.
 *
 * **Declared, not derived, and it mirrors the sections below rather than the scopes.** Neither
 * available derivation is right: scope order (general → scheduling → measure → cost) is not what the
 * planner sees, because this form interleaves scheduling fields both *before* Cost & earned value
 * (Working time, Levelling) and *after* it (Constraints, External interfaces); and the DOM cannot be
 * walked at all, since a field hidden by an off flag or by the current activity type is absent from
 * it while still able to carry an error. So the list is written out, in the order the sections
 * render, and has to be edited when a section moves — which is the cost of the guarantee that the
 * reader is sent to the first problem they can see rather than the first one a scope happens to hold.
 *
 * Until M1 this ordering was RHF's: `handleSubmit` focuses by registration order, which is render
 * order. The four-form submit still validates through each scope's own `handleSubmit` — but with
 * `shouldFocusError: false`, because four forms each focusing their own first problem is four
 * competing focus calls — so the host owns the decision instead, and `FormProblemCount`'s silence
 * at one problem is only lawful because this still moves focus (ADR-0077 §9 / spec §4.5).
 */
const SUBMIT_FIELD_ORDER = [
  // Identity
  { scope: 'general', name: 'name' },
  { scope: 'general', name: 'code' },
  { scope: 'general', name: 'description' },
  // Work
  { scope: 'general', name: 'type' },
  { scope: 'general', name: 'duration' },
  { scope: 'general', name: 'durationType' },
  // Breakdown
  { scope: 'general', name: 'parentId' },
  // Working time
  { scope: 'scheduling', name: 'calendarId' },
  // Levelling
  { scope: 'scheduling', name: 'levelingPriority' },
  // Cost & earned value
  { scope: 'measure', name: 'percentCompleteType' },
  { scope: 'measure', name: 'physicalPercentComplete' },
  { scope: 'cost', name: 'budgetedExpense' },
  { scope: 'cost', name: 'actualExpense' },
  { scope: 'cost', name: 'accrualType' },
  // Constraints
  { scope: 'scheduling', name: 'constraintType' },
  { scope: 'scheduling', name: 'constraintDate' },
  { scope: 'scheduling', name: 'secondaryConstraintType' },
  { scope: 'scheduling', name: 'secondaryConstraintDate' },
  { scope: 'scheduling', name: 'scheduleAsLateAsPossible' },
  { scope: 'scheduling', name: 'expectedFinish' },
  // External interfaces
  { scope: 'scheduling', name: 'externalEarlyStart' },
  { scope: 'scheduling', name: 'externalLateFinish' },
] as const satisfies readonly SubmitFieldEntry[];

/** Hoisted so the four `useScopeForm` calls share one object identity rather than allocating a
 * fresh options literal on every render. */
const NO_SCOPE_FOCUS = { shouldFocusError: false } as const;

/**
 * Validate ONE scope form, returning whether it passed — through that form's own `handleSubmit`.
 *
 * **`handleSubmit`, not `trigger`, and that is a behaviour fix rather than a style choice.**
 * `trigger()` runs the resolver and writes the errors, but it never sets `isSubmitted`: RHF sets
 * that flag only in `handleSubmit`'s own state emission (`react-hook-form@7.84.0`,
 * `dist/index.esm.mjs:3075`). And `isSubmitted` is exactly what turns `reValidateMode: 'onChange'`
 * on — the change handler passes it to `skipValidation`, which returns `true` (skip) while the
 * form's mode is the default `onSubmit` and nothing has been submitted
 * (`dist/index.esm.mjs:2608`). So a `trigger()`-validated submit leaves a corrected field showing
 * its old error until the planner submits again. Validating through `handleSubmit` restores
 * error-clears-as-you-fix, which is the behaviour this form has always had.
 *
 * Focus is suppressed at the FORM (`shouldFocusError: false`, {@link NO_SCOPE_FOCUS}) rather than
 * per call, so `handleSubmit`'s two `_focusError()` calls are both no-ops
 * (`dist/index.esm.mjs:3007-3009`) and {@link ActivityFormDialog}'s `focusFirstProblem` stays the
 * single ordered decision.
 *
 * The `onValid` callback deliberately does no work: the submit's real work needs all four scopes'
 * values merged, which no single scope's callback can see.
 */
async function validateScope<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
): Promise<boolean> {
  let valid = false;
  await form.handleSubmit(() => {
    valid = true;
  })();
  return valid;
}

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
  planCalendarId,
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
   * The plan's own calendar id — what `calendarId: ''` ("inherit") resolves to. Route-composed like
   * {@link calendars}, and needed only to read the activity's working-hours factor (ADR-0070): a
   * host that cannot supply it leaves the duration field in whole working days, which is what the
   * field has always been.
   */
  planCalendarId?: string;
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

  // The General scope seeds its duration from the factor known at OPEN — the SAVED calendar, because
  // nothing is watched yet at this point in the render. `useDurationSeed` below re-reads it once the
  // calendar list lands, so a sub-day duration is never shown (or saved) as its rounded day.
  const seedFactor = effectiveHoursPerDay(calendars, {
    activityCalendarId: activity?.calendarId ?? '',
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
  });
  // Four scope forms, one submit (ADR-0060 §4 / the dialog-unification epic M1). The wide
  // `useForm<ActivityFormValues>` this replaced could not feed a scope-typed field group:
  // `UseFormReturn<ActivityFormValues>` is not assignable to `UseFormReturn<ActivityGeneralValues>`
  // (RHF's generic is invariant — measured, M0-T2 claim 4). Every seed reads the row for EVERY
  // field, including ones behind an off flag, so a hidden value round-trips rather than being
  // silently cleared; `activity-editor-seeds.ts` carries that rule and its reasons.
  //
  // All four take `shouldFocusError: false`: this host owns the ONE ordered focus decision
  // (`focusFirstProblem` below), and per-form focus would be four competing calls. The option is
  // per-host rather than baked into the hook, so `ActivityEditorDialog` — one visible scope at a
  // time — keeps RHF's default and is untouched.
  const general = useScopeForm(
    activityGeneralSchema,
    (a) => seedGeneral(a, seedFactor),
    activity,
    open,
    NO_SCOPE_FOCUS,
  );
  const scheduling = useScopeForm(
    activitySchedulingSchema,
    seedScheduling,
    activity,
    open,
    NO_SCOPE_FOCUS,
  );
  const measure = useScopeForm(activityMeasureSchema, seedMeasure, activity, open, NO_SCOPE_FOCUS);
  const cost = useScopeForm(activityCostSchema, seedCost, activity, open, NO_SCOPE_FOCUS);

  // `useScopeForm` re-seeds the four forms on `[open, activity?.id]`; it has no equivalent for the
  // MUTATION, and dropping this is silent — a failed create's server-error banner would survive into
  // the next open of a dialog these hosts keep mounted and merely toggle.
  useEffect(() => {
    if (open) mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear only on open/target change
  }, [open, activity?.id]);

  // Per scope, so a field reads its OWN form's errors and reaching for a neighbour's is a compile
  // error (`schedulingErrors.name` does not exist) — the same seam `register` gets.
  const generalErrors = general.form.formState.errors;
  const schedulingErrors = scheduling.form.formState.errors;
  const measureErrors = measure.form.formState.errors;
  const costErrors = cost.form.formState.errors;
  // The count is a property of the SUBMIT, not of one scope, so it reads all four. The keys cannot
  // collide, and the annotation says why rather than asserting it: the four shapes partition
  // `ActivityFormValues` exactly (`activity-scope-schemas.structural.test.ts` computes that union
  // and fails if it drifts), so their merged errors ARE that type — no cast.
  const allErrors: FieldErrors<ActivityFormValues> = {
    ...generalErrors,
    ...schedulingErrors,
    ...measureErrors,
    ...costErrors,
  };

  // `useWatch`, never `form.watch`: on a four-form host `watch` subscribes the WHOLE component to
  // one form's every keystroke, so typing a name would re-render the Constraints section.
  const type = useWatch({ control: general.form.control, name: 'type' });
  const calendarId = useWatch({ control: scheduling.form.control, name: 'calendarId' });
  const percentCompleteType = useWatch({
    control: measure.form.control,
    name: 'percentCompleteType',
  });
  // A seeded non-inherit value that doesn't match any option (the list is still loading, or failed
  // to load): inject a synthetic option so the Select shows it as selected — never blank, which
  // would read as "inherit".
  // The duration field's day↔minute factor, read from the calendar the FORM currently selects — not
  // the saved one, because a planner can change the calendar and the duration in the same edit
  // (ADR-0070 §3). `undefined` = not known, which degrades the field to whole working days.
  const hoursPerDay = effectiveHoursPerDay(calendars, {
    activityCalendarId: calendarId ?? '',
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
  });
  // Hoisted rather than inlined: an arrow rebuilt per render defeats the React Compiler's
  // memoization of everything downstream of it (`Existing memoization could not be preserved`).
  const generalSetValue = general.form.setValue;
  const generalGetValues = general.form.getValues;
  const setDuration = useCallback(
    (text: string) => generalSetValue('duration', text),
    [generalSetValue],
  );
  const readDuration = useCallback(() => generalGetValues('duration'), [generalGetValues]);
  useDurationSeed({
    open,
    hoursPerDay,
    activity,
    // The field's LIVE value, read inside the effect — not a dirty flag captured by this render.
    // A keystroke and the calendar query are independent events, and trusting the flag lost the
    // race between them (TECH_DEBT #83). `getValues` is stable, so this needs no memoisation.
    readDuration,
    setDuration,
  });

  /**
   * The first problem in {@link SUBMIT_FIELD_ORDER}, focused — **one** decision, taken by the host.
   *
   * `getFieldState(name)` reads the form's live internal state rather than the render-time
   * `formState` snapshot, so it is accurate in the same tick the four scope validations settled in.
   * `setFocus` is a no-op for a name with no mounted control, which is what makes it safe to walk
   * fields whose sections are behind an off flag (or hidden by the current activity type).
   */
  const focusFirstProblem = (): void => {
    for (const entry of SUBMIT_FIELD_ORDER) {
      switch (entry.scope) {
        case 'general':
          if (general.form.getFieldState(entry.name).error) {
            general.form.setFocus(entry.name);
            return;
          }
          break;
        case 'scheduling':
          if (scheduling.form.getFieldState(entry.name).error) {
            scheduling.form.setFocus(entry.name);
            return;
          }
          break;
        case 'measure':
          if (measure.form.getFieldState(entry.name).error) {
            measure.form.setFocus(entry.name);
            return;
          }
          break;
        case 'cost':
          if (cost.form.getFieldState(entry.name).error) {
            cost.form.setFocus(entry.name);
            return;
          }
          break;
      }
    }
  };

  const onSubmit = async (): Promise<void> => {
    // Each scope validates through its OWN `handleSubmit` — see {@link validateScope} for why that
    // is not interchangeable with `trigger()` (it is what sets `isSubmitted`, and so what keeps
    // `reValidateMode: 'onChange'` clearing a corrected field's error before the next submit).
    // Focus is suppressed at the form, so all four are silent and the host decides once, below.
    const valid = await Promise.all([
      validateScope(general.form),
      validateScope(scheduling.form),
      validateScope(measure.form),
      validateScope(cost.form),
    ]);
    if (valid.some((ok) => !ok)) {
      focusFirstProblem();
      return;
    }

    // The four scopes partition `activityFormSchema`'s keys exactly (no key in two scopes, none
    // dropped — `activity-scope-schemas.structural.test.ts` computes that union and fails if it
    // drifts), so the merge is assignable with no cast and the body builders below are unmodified.
    const values: ActivityFormValues = {
      ...general.form.getValues(),
      ...scheduling.form.getValues(),
      ...measure.form.getValues(),
      ...cost.form.getValues(),
    };

    // The one check the schema deliberately cannot make (ADR-0070): whether this text converts on
    // THIS activity's calendar. Only reachable on the degraded whole-days path, where `4h` is a
    // well-formed duration the field simply cannot express.
    if (
      !isDurationDerivedType(values.type) &&
      durationWriteFields(values.duration, hoursPerDay) === null
    ) {
      general.form.setError(
        'duration',
        { message: DURATION_NEEDS_WHOLE_DAYS },
        { shouldFocus: true },
      );
      return;
    }
    if (isEdit) {
      update.mutate(
        {
          activityId: activity.id,
          version: activity.version,
          ...values,
          ...(hoursPerDay === undefined ? {} : { hoursPerDay }),
        },
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
      create.mutate(
        { ...values, ...(hoursPerDay === undefined ? {} : { hoursPerDay }) },
        {
          onSuccess: () => {
            announce(`Activity “${values.name}” created.`);
            onClose();
          },
        },
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit activity' : 'New activity'}
      size="lg"
      {...(isEdit ? {} : { description: 'Add an activity to this plan.' })}
    >
      <FieldGridContainer>
        <form
          noValidate
          onSubmit={(event) => {
            // `handleSubmit` used to do this; the four-form submit is the host's own function, so
            // the default is prevented here rather than inside RHF.
            event.preventDefault();
            void onSubmit();
          }}
          className="flex flex-col gap-5"
        >
          <FormProblemCount errors={allErrors} />
          {mutation.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {/* A calendar-scope rejection (ADR-0053 §2) reads as its own actionable sentence;
                every other failure keeps the server's message verbatim, exactly as before. */}
              {calendarScopeErrorMessage(mutation.error) ?? mutation.error.message}
            </p>
          ) : null}

          {/* The sections are consecutive siblings in their own wrapper (ADR-0061), and they mirror
            the tabbed editor's — so the create form and the edit surface answer the same questions
            in the same order rather than being two different shapes for one record. */}
          <div className="flex flex-col gap-5">
            <ActivityIdentityFields form={general.form} />

            <ActivityWorkFields
              form={general.form}
              hoursPerDay={hoursPerDay}
              {...(activity?.type === undefined ? {} : { savedType: activity.type })}
            />

            {/* The WBS hint is invariant to loading (mirrors the calendar picker), so it never asserts a
            false state while the plan activities are still resolving. The "no summaries yet"
            guidance is a distinct, appended clause shown only once the list has resolved empty —
            not conflated with loading or a load failure. */}
            {ADVANCED_ACTIVITY_TYPES_ENABLED ? (
              <ActivityBreakdownField
                form={general.form}
                parentOptions={parentOptions}
                loading={planActivitiesLoading}
                errored={planActivitiesError}
              />
            ) : null}

            {ACTIVITY_CALENDAR_ENABLED ? (
              <FormSection
                title="Working time"
                description="Which calendar's working days this activity's duration is measured in."
              >
                <ActivityCalendarField
                  value={calendarId ?? ''}
                  onChange={(value) =>
                    scheduling.form.setValue('calendarId', value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  calendars={calendars}
                  loading={calendarsLoading}
                  errored={calendarsError}
                  activityType={type}
                />
              </FormSection>
            ) : null}

            {/* Levelling priority (ADR-0041) only breaks ties when levelling delays over-allocated
            activities, so it is meaningless for a type levelling never moves (a milestone, LOE or WBS
            summary) — hidden for those, mirroring the Duration/Duration-type fields. */}
            {RESOURCE_LEVELLING_ENABLED && !isDurationDerivedType(type) ? (
              <ActivityLevellingField form={scheduling.form} activityType={type} />
            ) : null}
            {/* **Cost is not one section, and a milestone is not exempt.** These fields spanned two
              write scopes — the value MEASURE (which earns value and moves nothing) and the COST
              itself — under one heading, and were withheld from every duration-derived type. That
              withholding is the defect D9 names: a payment milestone is precisely an activity with
              cost and no duration, and create is the only surface that makes one, so the value
              could never be entered. The API accepts it (`apps/api/test/activities.e2e-spec.ts`,
              run rather than reasoned), so the gate goes. */}
            {EARNED_VALUE_ENABLED ? (
              <FormSection
                title="How value is measured"
                description="Earns value in Earned Value. Changes no dates."
              >
                <FieldGrid columns="lead">
                  <SelectField
                    label="Earn value from"
                    hint={`${PERCENT_COMPLETE_TYPE_LABELS[percentCompleteType].description} It changes no dates — only how Earned value measures progress.`}
                    {...measure.form.register('percentCompleteType')}
                  >
                    {PERCENT_COMPLETE_TYPE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {PERCENT_COMPLETE_TYPE_LABELS[value].label}
                      </option>
                    ))}
                  </SelectField>
                  {/* Rendered whatever the measure, which is D10 and the ADR-0060 §6 rule: shading
                    implies a value is there, hiding claims there is none. `physicalPercentComplete`
                    is stored, so hiding it from a reader whose measure is Duration says the
                    activity has no physical progress when it may well have some. */}
                  <TextField
                    label="Physical % complete"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    hint="The hand-entered physical progress that earns value when the measure is Physical. 0–100."
                    error={measureErrors.physicalPercentComplete?.message}
                    {...measure.form.register('physicalPercentComplete', {
                      setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                    })}
                  />
                </FieldGrid>
              </FormSection>
            ) : null}

            {EARNED_VALUE_ENABLED ? (
              <FormSection
                title="Expenses"
                description="Lump sums carried directly on this activity, on top of any resource-derived cost."
              >
                <FieldGrid>
                  <TextField
                    label="Budgeted expense"
                    type="number"
                    min={0}
                    // The UNION of the two hosts (D8): hundredths from the editor, because money is
                    // stored in minor units and `step="any"` invites a third decimal that is then
                    // silently rounded; the floor and the decimal keypad from create.
                    step="0.01"
                    inputMode="decimal"
                    hint="A lump-sum budgeted cost for this activity, in the plan’s currency, on top of any resource-derived cost. Leave blank for none."
                    error={costErrors.budgetedExpense?.message}
                    {...cost.form.register('budgetedExpense', {
                      setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                    })}
                  />
                  <TextField
                    label="Actual expense"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    hint="The lump-sum cost booked against this activity so far, in the plan’s currency. Leave blank for none."
                    error={costErrors.actualExpense?.message}
                    {...cost.form.register('actualExpense', {
                      setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                    })}
                  />
                </FieldGrid>
              </FormSection>
            ) : null}

            {/* Cost accrual (M7 rung 5, ADR-0044 §32): WHEN the cost is recognised in the
              Earned-Value Planned-Value curve, never a date. Its own flag, mirroring the
              value-measure picker. */}
            {COST_ACCRUAL_ENABLED ? (
              <FormSection
                title="Recognition"
                description="Changes only when cost is recognised in Earned value — never a date."
              >
                <FieldGrid>
                  <SelectField
                    label="Cost accrual"
                    hint={
                      'Sets when this activity’s cost is recognised: Start (all at the start), Uniform ' +
                      '(spread evenly), or End (all at the finish).'
                    }
                    {...cost.form.register('accrualType')}
                  >
                    {ACCRUAL_TYPE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {ACCRUAL_TYPE_LABELS[value]}
                      </option>
                    ))}
                  </SelectField>
                </FieldGrid>
              </FormSection>
            ) : null}

            <ActivityConstraintFields form={scheduling.form} />

            {/* **Placement is not a constraint, and putting it here says so.** "Schedule as late as
              possible" changes where the bar is DRAWN and touches neither dates nor float; expected
              finish is a target the engine sizes work towards. Both sat inside Constraints, beside
              five controls that pin a date — which is the reading a planner is most likely to take
              from a checkbox in that company. The editor had already separated them; create follows
              it, which is the section a group owns arriving with the group (ADR-0089 D5). */}
            <ActivityPlacementFields form={scheduling.form} activityType={type} />
            {/* External / inter-project dates (ADR-0043 / ADR-0035 §30). Grouped by the same top-border
            divider as the other stacked sections (a `<fieldset>`/`<legend>` for the semantic grouping,
            no box). Shown for every type — a milestone can carry an external late finish too (A12500). */}
            {INTER_PROJECT_DATES_ENABLED ? (
              <ActivityExternalDatesFields
                form={scheduling.form}
                externalDriven={activity?.externalDriven === true}
              />
            ) : null}
          </div>

          <div className="border-border flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create activity'}
            </Button>
          </div>
        </form>
      </FieldGridContainer>
    </Dialog>
  );
}
