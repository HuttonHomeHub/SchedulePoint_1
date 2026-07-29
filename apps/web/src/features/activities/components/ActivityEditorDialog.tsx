import {
  SELECTABLE_CONSTRAINT_TYPES,
  type ActivitySummary,
  type CalendarSummary,
} from '@repo/types';
import { DURATION_TYPES } from '@repo/types';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';

import { costBody, generalBody, schedulingBody } from '../api/scope-bodies';
import { useUpdateActivityFields } from '../api/use-activities';
import type { ActivityEditorGating } from '../lib/activity-editor-gating';
import {
  ACCRUAL_TYPE_LABELS,
  ACCRUAL_TYPE_OPTIONS,
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
  DURATION_TYPE_LABELS,
  INHERIT_CALENDAR_LABEL,
  isDurationDerivedType,
  selectableActivityTypes,
} from '../schemas/activity-schemas';
import {
  activityCostSchema,
  activityGeneralSchema,
  activitySchedulingSchema,
} from '../schemas/activity-scope-schemas';

import { seedCost, seedGeneral, seedScheduling } from './activity-editor-seeds';
import { ReportedProgressPanel, ValueMeasurePanel } from './ActivityProgressPanels';
import { useScopeForm } from './useScopeForm';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  CheckboxField,
  FormErrorSummary,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/form';
import { Tabs, type TabDescriptor } from '@/components/ui/tabs';
import {
  ADVANCED_ACTIVITY_TYPES_ENABLED,
  ADVANCED_CONSTRAINTS_ENABLED,
  COST_ACCRUAL_ENABLED,
  DURATION_TYPES_ENABLED,
  EARNED_VALUE_ENABLED,
  INTER_PROJECT_DATES_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
} from '@/config/env';

type TabKey = 'general' | 'scheduling' | 'progress' | 'cost';

/**
 * The tabbed activity editor (ADR-0060). Behind `VITE_ACTIVITY_EDITOR_TABS`; the flag-off path
 * keeps {@link ActivityFormDialog} unchanged.
 *
 * **Saves per write scope, not per dialog.** Each tab owns an independent form and its own Save,
 * because the three write paths this editor spans do not share a permission: definition writes need
 * the plan edit-lock, progress writes deliberately do not (ADR-0028 Q-C), and steps joined the pen
 * side in ADR-0060 §5. One merged Save would have to pick one rule and break the others — it would
 * quietly remove a Contributor's ability to report progress. Per-scope save is therefore structural,
 * not a layout preference.
 *
 * **`version` is read at submit time, never captured.** Every scope save bumps the row's version, so
 * a second save from another tab must use the version the *first* one produced. Reading it from the
 * live `activity` prop inside the submit handler is what makes a two-tab edit session work at all.
 *
 * Copy follows `docs/specs/activity-editor-restructure/copy-review.md` — reviewed as it moved, not
 * moved verbatim. Most visibly, `(optional)` is gone from labels: it was on eleven of twenty-two,
 * which is enough that it stopped meaning anything.
 *
 * M3 ships the three definition tabs. Progress (with the co-located steps and physical %) is M4.
 */
export function ActivityEditorDialog({
  orgSlug,
  planId,
  open,
  onClose,
  onSaved,
  activity,
  gating,
  calendars = [],
  planActivities = [],
}: {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
  /** Called after a scope saves, with the pre-save row and the server's post-save row (ADR-0048). */
  onSaved?: (before: ActivitySummary, after: ActivitySummary) => void;
  /** The row being edited. This editor is edit-only; creation stays with `ActivityFormDialog`. */
  activity: ActivitySummary | undefined;
  /** Per-scope writability and its reason (`deriveActivityEditorGating`). */
  gating: ActivityEditorGating;
  calendars?: CalendarSummary[];
  planActivities?: ActivitySummary[];
}): React.ReactElement {
  const announce = useAnnounce();
  const update = useUpdateActivityFields(orgSlug, planId);
  const [active, setActive] = useState<TabKey>('general');
  const [saveError, setSaveError] = useState<string | null>(null);

  const general = useScopeForm(activityGeneralSchema, seedGeneral, activity, open);
  const scheduling = useScopeForm(activitySchedulingSchema, seedScheduling, activity, open);
  const cost = useScopeForm(activityCostSchema, seedCost, activity, open);

  const type = useWatch({ control: general.form.control, name: 'type' });
  const constraintType = useWatch({ control: scheduling.form.control, name: 'constraintType' });
  const secondaryConstraintType = useWatch({
    control: scheduling.form.control,
    name: 'secondaryConstraintType',
  });

  const parentOptions = planActivities.filter(
    (a) => a.type === 'WBS_SUMMARY' && a.id !== activity?.id,
  );

  /**
   * Save one scope. `version` comes from the live row **now**, not from when the dialog opened —
   * see the docblock. A 409 surfaces its message and the list refetch re-seeds, so a retry carries
   * the version the other tab's save produced.
   */
  const saveScope = (
    scope: TabKey,
    patch: Record<string, unknown>,
    label: string,
    resetTo: () => void,
  ): void => {
    if (!activity) return;
    setSaveError(null);
    update.mutate(
      { activityId: activity.id, version: activity.version, patch },
      {
        onSuccess: (after) => {
          onSaved?.(activity, after);
          // The editor stays open (the agreed behaviour): a multi-scope session would be pointless
          // if saving one tab closed the others. Reset marks the scope clean so its dirty marker
          // clears without discarding what the user just saved.
          resetTo();
          announce(`${label} saved.`);
        },
        onError: (error: Error) => {
          setSaveError(error.message);
          setActive(scope);
        },
      },
    );
  };

  const tabs: TabDescriptor<TabKey>[] = [
    {
      id: 'general',
      label: 'General',
      ...marker(general.errorCount, general.isDirty),
    },
    {
      id: 'scheduling',
      label: 'Scheduling',
      ...marker(scheduling.errorCount, scheduling.isDirty),
    },
    { id: 'progress', label: 'Progress' },
    ...(gating.cost.readable
      ? [{ id: 'cost' as const, label: 'Cost', ...marker(cost.errorCount, cost.isDirty) }]
      : []),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={activity ? `Edit ${activity.name}` : 'Edit activity'}
    >
      <div className="flex min-h-0 flex-col gap-4">
        {saveError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {saveError}
          </p>
        ) : null}

        <Tabs label="Activity sections" tabs={tabs} active={active} onChange={setActive}>
          {(current) => (
            <div className="flex flex-col gap-4 py-4">
              {current === 'general' ? (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void general.form.handleSubmit((values) =>
                      saveScope('general', generalBody(values), 'General', () =>
                        general.form.reset(values),
                      ),
                    )(event);
                  }}
                  className="flex flex-col gap-4"
                >
                  <FormErrorSummary errors={general.form.formState.errors} />
                  <TextField
                    label="Name"
                    disabled={!gating.general.writable}
                    error={general.form.formState.errors.name?.message}
                    {...general.form.register('name')}
                  />
                  <TextField
                    label="Code"
                    autoComplete="off"
                    disabled={!gating.general.writable}
                    error={general.form.formState.errors.code?.message}
                    {...general.form.register('code')}
                  />
                  <SelectField
                    label="Type"
                    disabled={!gating.general.writable}
                    error={general.form.formState.errors.type?.message}
                    {...general.form.register('type')}
                  >
                    {selectableActivityTypes(ADVANCED_ACTIVITY_TYPES_ENABLED, activity?.type).map(
                      (value) => (
                        <option key={value} value={value}>
                          {ACTIVITY_TYPE_LABELS[value]}
                        </option>
                      ),
                    )}
                  </SelectField>
                  {!isDurationDerivedType(type) ? (
                    <TextField
                      label="Duration (working days)"
                      type="number"
                      min={0}
                      disabled={!gating.general.writable}
                      error={general.form.formState.errors.durationDays?.message}
                      {...general.form.register('durationDays', { valueAsNumber: true })}
                    />
                  ) : null}
                  {DURATION_TYPES_ENABLED && !isDurationDerivedType(type) ? (
                    <SelectField
                      label="Duration type"
                      hint="Sets how editing one of duration, units or units/time recomputes the others, so units = duration × units/time stays true. A crew installing a fixed quantity takes longer if its rate drops."
                      disabled={!gating.general.writable}
                      {...general.form.register('durationType')}
                    >
                      {DURATION_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {DURATION_TYPE_LABELS[value]}
                        </option>
                      ))}
                    </SelectField>
                  ) : null}
                  {ADVANCED_ACTIVITY_TYPES_ENABLED ? (
                    <SelectField
                      label="Parent WBS summary"
                      hint="Groups this activity under a WBS summary, whose dates roll up from its members."
                      disabled={!gating.general.writable}
                      {...general.form.register('parentId')}
                    >
                      <option value="">None (top level)</option>
                      {parentOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </SelectField>
                  ) : null}
                  <TextareaField
                    label="Description"
                    disabled={!gating.general.writable}
                    error={general.form.formState.errors.description?.message}
                    {...general.form.register('description')}
                  />
                  <ScopeSaveBar
                    gate={gating.general}
                    dirty={general.isDirty}
                    pending={update.isPending}
                    label="Save general"
                  />
                </form>
              ) : null}

              {current === 'scheduling' ? (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void scheduling.form.handleSubmit((values) =>
                      saveScope('scheduling', schedulingBody(values), 'Scheduling', () =>
                        scheduling.form.reset(values),
                      ),
                    )(event);
                  }}
                  className="flex flex-col gap-4"
                >
                  <FormErrorSummary errors={scheduling.form.formState.errors} />
                  <SelectField
                    label="Calendar"
                    hint="The working-time calendar this activity schedules on. Inherit uses the plan’s."
                    disabled={!gating.scheduling.writable}
                    {...scheduling.form.register('calendarId')}
                  >
                    <option value="">{INHERIT_CALENDAR_LABEL}</option>
                    {calendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendar.name}
                      </option>
                    ))}
                  </SelectField>

                  <fieldset className="border-border flex flex-col gap-4 border-t pt-4">
                    <legend className="sr-only">Constraints</legend>
                    <p className="text-sm font-medium" aria-hidden="true">
                      Constraints
                    </p>
                    <SelectField
                      label="Constraint"
                      hint="Pins the activity’s start or finish to a date. Only constraints the scheduler applies exactly as named are listed."
                      disabled={!gating.scheduling.writable}
                      {...scheduling.form.register('constraintType')}
                    >
                      <option value="">None</option>
                      {SELECTABLE_CONSTRAINT_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {CONSTRAINT_TYPE_LABELS[value]}
                        </option>
                      ))}
                    </SelectField>
                    {constraintType ? (
                      <TextField
                        label="Constraint date"
                        type="date"
                        disabled={!gating.scheduling.writable}
                        error={scheduling.form.formState.errors.constraintDate?.message}
                        {...scheduling.form.register('constraintDate')}
                      />
                    ) : null}
                    {ADVANCED_CONSTRAINTS_ENABLED ? (
                      <>
                        <SelectField
                          label="Secondary constraint"
                          hint="A second date constraint that drives the activity’s late dates. The primary constraint drives its early dates."
                          disabled={!gating.scheduling.writable}
                          {...scheduling.form.register('secondaryConstraintType')}
                        >
                          <option value="">None</option>
                          {SELECTABLE_CONSTRAINT_TYPES.map((value) => (
                            <option key={value} value={value}>
                              {CONSTRAINT_TYPE_LABELS[value]}
                            </option>
                          ))}
                        </SelectField>
                        {secondaryConstraintType ? (
                          <TextField
                            label="Secondary constraint date"
                            type="date"
                            disabled={!gating.scheduling.writable}
                            error={
                              scheduling.form.formState.errors.secondaryConstraintDate?.message
                            }
                            {...scheduling.form.register('secondaryConstraintDate')}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </fieldset>

                  <fieldset className="border-border flex flex-col gap-4 border-t pt-4">
                    <legend className="sr-only">Placement and targets</legend>
                    <p className="text-sm font-medium" aria-hidden="true">
                      Placement and targets
                    </p>
                    <CheckboxField
                      label="Schedule as late as possible"
                      hint="Draws the activity at its latest position without changing its dates or float. A display preference, not a date constraint."
                      disabled={!gating.scheduling.writable}
                      {...scheduling.form.register('scheduleAsLateAsPossible')}
                    />
                    {ADVANCED_CONSTRAINTS_ENABLED && !isDurationDerivedType(type) ? (
                      <TextField
                        label="Expected finish"
                        type="date"
                        hint="A target finish date. When the plan’s “Expected-finish scheduling” option is on, the engine sizes this activity’s work so it finishes on this date (Recalculate to apply)."
                        disabled={!gating.scheduling.writable}
                        {...scheduling.form.register('expectedFinish')}
                      />
                    ) : null}
                  </fieldset>

                  {INTER_PROJECT_DATES_ENABLED ? (
                    <fieldset className="border-border flex flex-col gap-4 border-t pt-4">
                      <legend className="sr-only">External dates</legend>
                      <p className="text-sm font-medium" aria-hidden="true">
                        External dates
                      </p>
                      <TextField
                        label="External early start"
                        type="date"
                        hint="The earliest an upstream plan or project hands this activity over. Recalculate to apply; the later of this and the activity’s logic wins."
                        disabled={!gating.scheduling.writable}
                        {...scheduling.form.register('externalEarlyStart')}
                      />
                      <TextField
                        label="External late finish"
                        type="date"
                        hint="The latest a downstream plan or project allows this activity to finish. Earlier than the logic can achieve, it shows as negative float."
                        disabled={!gating.scheduling.writable}
                        error={scheduling.form.formState.errors.externalLateFinish?.message}
                        {...scheduling.form.register('externalLateFinish')}
                      />
                    </fieldset>
                  ) : null}

                  {RESOURCE_LEVELLING_ENABLED ? (
                    <fieldset className="border-border flex flex-col gap-4 border-t pt-4">
                      <legend className="sr-only">Resource levelling</legend>
                      <p className="text-sm font-medium" aria-hidden="true">
                        Resource levelling
                      </p>
                      <TextField
                        label="Levelling priority"
                        type="number"
                        min={0}
                        hint="Lower wins the resource when two activities contend under resource levelling. Leave blank for lowest priority."
                        disabled={!gating.scheduling.writable}
                        error={scheduling.form.formState.errors.levelingPriority?.message}
                        {...scheduling.form.register('levelingPriority', {
                          setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                        })}
                      />
                    </fieldset>
                  ) : null}

                  <ScopeSaveBar
                    gate={gating.scheduling}
                    dirty={scheduling.isDirty}
                    pending={update.isPending}
                    label="Save scheduling"
                  />
                </form>
              ) : null}

              {/* The co-location (M4): three panels, three write scopes, each headed by what it
                  does to the schedule. Rendered only when a row exists — every panel writes. */}
              {current === 'progress' && activity ? (
                <div className="flex flex-col gap-8">
                  <ReportedProgressPanel
                    orgSlug={orgSlug}
                    planId={planId}
                    activity={activity}
                    gate={gating.progress}
                    open={open}
                    announce={announce}
                  />
                  <ValueMeasurePanel
                    orgSlug={orgSlug}
                    activity={activity}
                    gate={gating.measure}
                    open={open}
                    pending={update.isPending}
                    onSave={(patch, reset) => saveScope('progress', patch, 'Measure', reset)}
                  />
                </div>
              ) : null}

              {current === 'cost' && gating.cost.readable ? (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void cost.form.handleSubmit((values) =>
                      saveScope('cost', costBody(values), 'Cost', () => cost.form.reset(values)),
                    )(event);
                  }}
                  className="flex flex-col gap-4"
                >
                  <FormErrorSummary errors={cost.form.formState.errors} />
                  {EARNED_VALUE_ENABLED ? (
                    <>
                      <TextField
                        label="Budgeted expense"
                        type="number"
                        step="0.01"
                        hint="A lump-sum budgeted cost for this activity, in the plan’s currency, on top of any resource-derived cost."
                        disabled={!gating.cost.writable}
                        error={cost.form.formState.errors.budgetedExpense?.message}
                        {...cost.form.register('budgetedExpense', {
                          setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                        })}
                      />
                      <TextField
                        label="Actual expense"
                        type="number"
                        step="0.01"
                        hint="The lump-sum cost booked against this activity so far, in the plan’s currency."
                        disabled={!gating.cost.writable}
                        error={cost.form.formState.errors.actualExpense?.message}
                        {...cost.form.register('actualExpense', {
                          setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                        })}
                      />
                    </>
                  ) : null}
                  {COST_ACCRUAL_ENABLED ? (
                    <SelectField
                      label="Cost accrual"
                      hint="Sets when this activity’s cost is recognised: Start (all at the start), Uniform (spread evenly), or End (all at the finish). It changes only when cost is recognised in Earned value — never a date."
                      disabled={!gating.cost.writable}
                      {...cost.form.register('accrualType')}
                    >
                      {ACCRUAL_TYPE_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {ACCRUAL_TYPE_LABELS[value]}
                        </option>
                      ))}
                    </SelectField>
                  ) : null}
                  <ScopeSaveBar
                    gate={gating.cost}
                    dirty={cost.isDirty}
                    pending={update.isPending}
                    label="Save cost"
                  />
                </form>
              ) : null}
            </div>
          )}
        </Tabs>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** An error marker wins over a dirty marker: an invalid tab is more urgent than an unsaved one. */
function marker(errorCount: number, dirty: boolean): Pick<TabDescriptor<string>, 'marker'> {
  if (errorCount > 0) {
    return {
      marker: {
        count: errorCount,
        label: errorCount === 1 ? '1 problem' : `${errorCount} problems`,
      },
    };
  }
  return dirty ? { marker: { label: 'unsaved changes' } } : {};
}

/**
 * One scope's Save, with its reason when it cannot be used. Never a bare disabled button: the
 * repo's rule is shade-with-a-reason, and a Save whose disabled state is unexplained is the same
 * lit-but-inert defect this epic set out to remove.
 */
function ScopeSaveBar({
  gate,
  dirty,
  pending,
  label,
}: {
  gate: { writable: boolean; reason: string | null };
  dirty: boolean;
  pending: boolean;
  label: string;
}): React.ReactElement {
  return (
    <div className="border-border flex items-center justify-between gap-4 border-t pt-4">
      <p className="text-muted-foreground text-sm">
        {gate.writable ? (dirty ? 'Unsaved changes in this section.' : null) : gate.reason}
      </p>
      <Button type="submit" disabled={!gate.writable || !dirty || pending} aria-busy={pending}>
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  );
}
