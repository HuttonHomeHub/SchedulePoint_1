import { type ActivitySummary, type CalendarSummary } from '@repo/types';
import { useCallback, useEffect, useState } from 'react';
import {
  useWatch,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import { useCreateActivity } from '../api/use-activities';
import { DURATION_NEEDS_WHOLE_DAYS, durationWriteFields } from '../model/duration-field';
import { useDurationSeed } from '../model/use-duration-seed';
import { isDurationDerivedType, type ActivityFormValues } from '../schemas/activity-schemas';
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
import { ActivityAccrualField } from './fields/ActivityAccrualField';
import { ActivityBreakdownField } from './fields/ActivityBreakdownField';
import { ActivityCalendarField } from './fields/ActivityCalendarField';
import { ActivityConstraintFields } from './fields/ActivityConstraintFields';
import { ActivityExpenseFields } from './fields/ActivityExpenseFields';
import { ActivityExternalDatesFields } from './fields/ActivityExternalDatesFields';
import { ActivityIdentityFields } from './fields/ActivityIdentityFields';
import { ActivityLevellingField } from './fields/ActivityLevellingField';
import { ActivityMeasureFields } from './fields/ActivityMeasureFields';
import { ActivityPlacementFields } from './fields/ActivityPlacementFields';
import { ActivityWorkFields } from './fields/ActivityWorkFields';
import { useScopeForm } from './useScopeForm';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormProblemCount } from '@/components/ui/form';
import { FieldGridContainer, FormSection } from '@/components/ui/form-layout';
import {
  ACTIVITY_CALENDAR_ENABLED,
  ADVANCED_ACTIVITY_TYPES_ENABLED,
  EARNED_VALUE_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
} from '@/config/env';
import { calendarScopeErrorMessage } from '@/lib/api/calendar-scope-errors';
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
 * (`dist/index.esm.mjs:3007-3009`) and {@link ActivityCreateDialog}'s `focusFirstProblem` stays the
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
 * The **New activity** dialog — an activity DEFINITION, created (ADR-0089).
 *
 * **A host, not a form.** It owns four scope forms, one submit, one ordered focus decision and the
 * ADR-0070 whole-days check; every field on it is rendered by a group in `fields/`, each of which
 * the tabbed {@link ActivityEditorDialog} renders too. That is the point of the dialog-unification
 * epic: the two surfaces a planner meets one activity through had drifted in ten places precisely
 * because they shared no code, and a group cannot drift from itself.
 *
 * **Create-only, and that is recent.** This was `ActivityFormDialog`, a create-or-edit component
 * whose edit half served the activities table and the workspace until `VITE_ACTIVITY_EDITOR_TABS`
 * retired and the tabbed editor became the only edit surface. Deleting that half was the last step
 * of the epic rather than the first: while it existed, every field group had to satisfy two hosts
 * *and* two modes.
 *
 * Progress (status / % / actual dates) is changed elsewhere and is not here. Which fields a given
 * activity type shows is each group's own rule, stated where the field is.
 *
 * The org calendar library (for the per-activity calendar picker, ADR-0037) is **supplied by the
 * composing route/workspace**, not fetched here — so the activities feature stays dependency-free of
 * the calendars feature (like {@link ActivitiesTable}'s `varianceByActivityId`). `CalendarSummary`
 * is a shared `@repo/types` shape.
 */
export function ActivityCreateDialog({
  orgSlug,
  planId,
  open,
  onClose,
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
   * within it, ADR-0038, F8). The **unfiltered** list: the dialog derives the summaries. Nothing is
   * excluded here, unlike the editor, which drops the row being edited — an activity that does not
   * exist yet cannot be its own parent. Route-composed like {@link calendars} (reusing the plan's
   * warm activities query), so the dialog stays a pure presentation component. Only consulted when
   * the WBS surface (`VITE_ADVANCED_ACTIVITY_TYPES`) is on.
   */
  planActivities?: ActivitySummary[];
  /** The plan activities are still loading (the parent options aren't complete yet). */
  planActivitiesLoading?: boolean;
  /** The plan activities failed to load — surface it rather than reading as a confirmed "no summaries". */
  planActivitiesError?: boolean;
}): React.ReactElement {
  const mutation = useCreateActivity(orgSlug, planId);
  const announce = useAnnounce();

  // The valid WBS parents: every summary in the plan, derived from the unfiltered pool. Nothing is
  // excluded — the editor drops the row being edited (it cannot parent itself), but an activity
  // that does not exist yet cannot be its own parent either.
  const parentOptions = planActivities.filter((a) => a.type === 'WBS_SUMMARY');

  // A new activity inherits the plan's calendar, so the factor the General scope seeds its duration
  // from is the plan's. `useDurationSeed` below re-reads it once the calendar list lands, so a
  // sub-day duration is never shown (or saved) as its rounded day.
  const seedFactor = effectiveHoursPerDay(calendars, {
    activityCalendarId: '',
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
    undefined,
    open,
    NO_SCOPE_FOCUS,
  );
  const scheduling = useScopeForm(
    activitySchedulingSchema,
    seedScheduling,
    undefined,
    open,
    NO_SCOPE_FOCUS,
  );
  const measure = useScopeForm(activityMeasureSchema, seedMeasure, undefined, open, NO_SCOPE_FOCUS);
  const cost = useScopeForm(activityCostSchema, seedCost, undefined, open, NO_SCOPE_FOCUS);

  // `useScopeForm` re-seeds the four forms on `[open, activity?.id]`; it has no equivalent for the
  // MUTATION, and dropping this is silent — a failed create's server-error banner would survive into
  // the next open of a dialog these hosts keep mounted and merely toggle.
  useEffect(() => {
    if (open) mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear only on open/target change
  }, [open]);

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
    // No stored row to re-seed from — this is a create.
    activity: undefined,
    // The field's LIVE value, read inside the effect — not a dirty flag captured by this render.
    // A keystroke and the calendar query are independent events, and trusting the flag lost the
    // race between them (TECH_DEBT #83). `getValues` is stable, so this needs no memoisation.
    readDuration,
    setDuration,
  });

  /**
   * The first problem in {@link SUBMIT_FIELD_ORDER} **that the reader can actually reach**, focused
   * — one decision, taken by the host. Returns whether it found one.
   *
   * `getFieldState(name)` reads the form's live internal state rather than the render-time
   * `formState` snapshot, so it is accurate in the same tick the four scope validations settled in.
   *
   * **An entry with no mounted control is skipped, and the walk continues.** The scope schemas
   * validate every field unconditionally while the groups render some of them conditionally — a
   * negative `levelingPriority` survives a change to a milestone type, which hides the field that
   * holds it. This walk used to call `setFocus` on such an entry and `return`, and `setFocus` on an
   * unmounted name is a silent no-op: the first erroring field consumed the one focus decision
   * whether or not it could receive it, masking every later, visible problem. The comment that
   * stood here called that no-op "what makes it safe", which is exactly backwards, and is why the
   * behaviour survived a human read.
   */
  const focusFirstProblem = (): boolean => {
    // A control RHF can focus is one that is in the document. `setFocus` consults its own ref
    // registry, which keeps an entry for an unmounted field, so asking RHF is not enough.
    const isOnScreen = (name: string): boolean => document.getElementsByName(name).length > 0;

    for (const entry of SUBMIT_FIELD_ORDER) {
      if (!isOnScreen(entry.name)) continue;
      switch (entry.scope) {
        case 'general':
          if (general.form.getFieldState(entry.name).error) {
            general.form.setFocus(entry.name);
            return true;
          }
          break;
        case 'scheduling':
          if (scheduling.form.getFieldState(entry.name).error) {
            scheduling.form.setFocus(entry.name);
            return true;
          }
          break;
        case 'measure':
          if (measure.form.getFieldState(entry.name).error) {
            measure.form.setFocus(entry.name);
            return true;
          }
          break;
        case 'cost':
          if (cost.form.getFieldState(entry.name).error) {
            cost.form.setFocus(entry.name);
            return true;
          }
          break;
      }
    }
    return false;
  };

  /**
   * The last submit failed on a field this activity type hides, so no control on screen carries the
   * message. Cleared on the next submit rather than on every keystroke: the reader's way out is to
   * change the type back, which re-renders the field with its own error attached.
   */
  const [hiddenProblem, setHiddenProblem] = useState(false);

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
      // Whether the reader can SEE the problem decides whether anything has to say so.
      // `FormProblemCount` is deliberately silent at one problem, and that silence is lawful only
      // while focus delivers the message instead (WCAG 4.1.3's exemption). When focus cannot land
      // — every erroring field is hidden by the current activity type — nothing else on screen is
      // saying anything, so the form says it (WCAG 3.3.1).
      setHiddenProblem(!focusFirstProblem());
      return;
    }
    setHiddenProblem(false);

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
    mutation.mutate(
      { ...values, ...(hoursPerDay === undefined ? {} : { hoursPerDay }) },
      {
        onSuccess: () => {
          announce(`Activity “${values.name}” created.`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New activity"
      size="lg"
      description="Add an activity to this plan."
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
          {hiddenProblem ? (
            <p role="alert" className="text-destructive-text text-sm">
              One of this activity’s values can’t be saved, and the field holding it is one this
              activity type hides. Change the type back to see and correct it.
            </p>
          ) : null}

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

            <ActivityWorkFields form={general.form} hoursPerDay={hoursPerDay} />

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
                <ActivityMeasureFields form={measure.form} />
              </FormSection>
            ) : null}

            <ActivityExpenseFields form={cost.form} />

            {/* Cost accrual (M7 rung 5, ADR-0044 §32): WHEN the cost is recognised in the
              Earned-Value Planned-Value curve, never a date. Its own flag, mirroring the
              value-measure picker. */}
            <ActivityAccrualField form={cost.form} />

            <ActivityConstraintFields form={scheduling.form} />

            {/* **Placement is not a constraint, and putting it here says so.** "Schedule as late as
              possible" changes where the bar is DRAWN and touches neither dates nor float; expected
              finish is a target the engine sizes work towards. Both sat inside Constraints, beside
              five controls that pin a date — which is the reading a planner is most likely to take
              from a checkbox in that company. The editor had already separated them; create follows
              it, which is the section a group owns arriving with the group (ADR-0089 D5). */}
            <ActivityPlacementFields form={scheduling.form} activityType={type} />
            {/* External / inter-project dates (ADR-0043 / ADR-0035 §30). Shown for every type — a
              milestone can carry an external late finish too (A12500). The group owns its own
              `VITE_INTER_PROJECT_DATES` guard, so there is no outer one here. `externalDriven` is
              the engine's verdict on a scheduled activity, so a create never has one and the
              section's aside stays silent until the plan is recalculated. */}
            <ActivityExternalDatesFields form={scheduling.form} />
          </div>

          <div className="border-border flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Create activity'}
            </Button>
          </div>
        </form>
      </FieldGridContainer>
    </Dialog>
  );
}
