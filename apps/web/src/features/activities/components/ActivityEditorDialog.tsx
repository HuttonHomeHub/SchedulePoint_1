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
import type { ActivityEditorIntent } from '../lib/activity-editor-intent';
import {
  ACCRUAL_TYPE_LABELS,
  ACCRUAL_TYPE_OPTIONS,
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
  DURATION_TYPE_LABELS,
  isDurationDerivedType,
  selectableActivityTypes,
} from '../schemas/activity-schemas';
import {
  activityCostSchema,
  activityGeneralSchema,
  activitySchedulingSchema,
} from '../schemas/activity-scope-schemas';

import { seedCost, seedGeneral, seedScheduling } from './activity-editor-seeds';
import { ActivityCalendarField } from './ActivityCalendarField';
import {
  ReportedProgressPanel,
  ValueMeasurePanel,
  WeightedStepsPanel,
} from './ActivityProgressPanels';
import { ScopeSaveBar } from './ScopeSaveBar';
import { useScopeForm } from './useScopeForm';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  ACTIVITY_CALENDAR_ENABLED,
  ACTIVITY_STEPS_ENABLED,
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
 * M3 ships the three definition tabs; M4 adds Progress, where the reported %, the value measure and
 * the weighted steps finally sit next to each other — three dialogs' worth of screens that were
 * previously reachable only one at a time, from different menus, with no cue that one overrides
 * another.
 */
export function ActivityEditorDialog({
  orgSlug,
  planId,
  open,
  onClose,
  onSaved,
  activity,
  gating,
  intent,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
  planActivities = [],
}: {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
  /**
   * Why the editor was opened (ADR-0060 §7): which tab to land on, and whether to move focus to the
   * Weighted-steps panel. Omitted ⇒ General, the plain **Edit** behaviour.
   */
  intent?: ActivityEditorIntent;
  /** Called after a scope saves, with the pre-save row and the server's post-save row (ADR-0048). */
  onSaved?: (before: ActivitySummary, after: ActivitySummary) => void;
  /** The row being edited. This editor is edit-only; creation stays with `ActivityFormDialog`. */
  activity: ActivitySummary | undefined;
  /** Per-scope writability and its reason (`deriveActivityEditorGating`). */
  gating: ActivityEditorGating;
  calendars?: CalendarSummary[];
  /** The calendar list is still in flight — the picker says so rather than reading as "inherit". */
  calendarsLoading?: boolean;
  /** The calendar list failed — surfaced in the picker, not swallowed. */
  calendarsError?: boolean;
  planActivities?: ActivitySummary[];
}): React.ReactElement {
  const announce = useAnnounce();
  const update = useUpdateActivityFields(orgSlug, planId);
  const [active, setActive] = useState<TabKey>(intent?.tab ?? 'general');
  /**
   * The failing scope and its message — **scoped**, not one dialog-level banner.
   *
   * The first draft kept a single string above the tablist and cleared it when *any* scope's next
   * save started, so a Scheduling 409 vanished the moment General saved successfully and no marker
   * ever recorded that a conflict was still unresolved. Keyed by scope, the error stays with the tab
   * that owns it.
   */
  const [saveError, setSaveError] = useState<{ scope: TabKey; message: string } | null>(null);
  /** The scope that last saved, cleared on its next edit — the visible half of the save signal. */
  const [savedScope, setSavedScope] = useState<TabKey | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  // The entry point chooses the landing tab (ADR-0060 §7): **Report progress** and **Steps** open
  // the same editor as **Edit**, on the tab that answers the action. The hosts keep this dialog
  // mounted and toggle `open`, so a tab chosen for the previous target would otherwise persist into
  // the next one — but the user's own tab clicks must survive every other re-render.
  //
  // Adjusted **during render** against the previous intent, not in an effect: an effect would paint
  // the stale tab first and then correct it, and setting state from one is the cascading-render
  // pattern the lint rule rejects. Each open builds a fresh intent object, so identity is the signal.
  const [seenIntent, setSeenIntent] = useState(intent);
  if (intent !== seenIntent) {
    setSeenIntent(intent);
    if (intent) setActive(intent.tab);
  }

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
   * The scopes with unsaved edits, named for the discard confirmation. Progress's three panels own
   * their own forms and their own saves, so they are not represented here — each is one endpoint
   * away from durable, and none of them can be lost by a stray Escape without the others.
   */
  const dirtyScopeNames = [
    general.isDirty ? 'General' : null,
    scheduling.isDirty ? 'Scheduling' : null,
    cost.isDirty && gating.cost.readable ? 'Cost' : null,
  ].filter((name): name is string => name !== null);

  /** Close, unless there is work to lose — then ask (spec US-5). */
  const requestClose = (): void => {
    if (dirtyScopeNames.length > 0) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  };

  /**
   * Recover a scope after a conflict: re-seed it from the row the failed save's refetch brought
   * back, so the retry carries the CURRENT version rather than the one that just 409'd. Without
   * this a user's only route out of a stale-version error is to close and reopen the editor —
   * discarding every other tab's work on the way.
   */
  const refreshScope = (scope: TabKey): void => {
    setSaveError(null);
    if (scope === 'general') general.form.reset(seedGeneral(activity));
    if (scope === 'scheduling') scheduling.form.reset(seedScheduling(activity));
    if (scope === 'cost') cost.form.reset(seedCost(activity));
  };

  /** One scope's server error, with the way out. Rendered inside the tab that owns it. */
  const scopeError = (scope: TabKey): React.ReactElement | null => {
    if (saveError?.scope !== scope) return null;
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-destructive-text text-sm">
          {saveError.message}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => refreshScope(scope)}>
          Refresh this section
        </Button>
      </div>
    );
  };

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
    setSaveError((current) => (current?.scope === scope ? null : current));
    update.mutate(
      { activityId: activity.id, version: activity.version, patch },
      {
        onSuccess: (after) => {
          onSaved?.(activity, after);
          // The editor stays open (the agreed behaviour): a multi-scope session would be pointless
          // if saving one tab closed the others. Reset marks the scope clean so its dirty marker
          // clears without discarding what the user just saved.
          resetTo();
          setSavedScope(scope);
          announce(`${label} saved.`);
        },
        onError: (error: Error) => {
          setSaveError({ scope, message: error.message });
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
      // Escape and the backdrop route through the same guard as the Close button — an Escape reflex
      // is exactly the case the confirmation exists for.
      onClose={requestClose}
      confirmBeforeClose
      title={activity ? `Edit ${activity.name}` : 'Edit activity'}
    >
      <div className="flex min-h-0 flex-col gap-4">
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
                  {scopeError('general')}
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
                    saved={savedScope === 'general'}
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
                  {scopeError('scheduling')}
                  {ACTIVITY_CALENDAR_ENABLED ? (
                    <ActivityCalendarField
                      value={scheduling.form.watch('calendarId') ?? ''}
                      onChange={(calendarId) =>
                        scheduling.form.setValue('calendarId', calendarId, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      calendars={calendars}
                      loading={calendarsLoading}
                      errored={calendarsError}
                      activityType={type}
                      disabled={!gating.scheduling.writable}
                    />
                  ) : null}

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
                    saved={savedScope === 'scheduling'}
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
                    saved={savedScope === 'progress'}
                    onSave={(patch, reset) => saveScope('progress', patch, 'Measure', reset)}
                  />
                  {/* Same flag pair the Steps entry points check (`ActivitiesTable`,
                      `selection-actions`). Without it the tab would show a checklist that no menu
                      offers a way to reach — a flag-parity gap the security review caught. */}
                  {ACTIVITY_STEPS_ENABLED && EARNED_VALUE_ENABLED ? (
                    <WeightedStepsPanel
                      orgSlug={orgSlug}
                      planId={planId}
                      activity={activity}
                      gate={gating.steps}
                      open={open}
                      announce={announce}
                      // Only the **Steps** entry point asks for this. Landing at the top of a
                      // three-panel tab would make that action feel like it opened the wrong thing.
                      autoFocusHeading={intent?.focusSteps === true}
                    />
                  ) : null}
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
                  {scopeError('cost')}
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
                    saved={savedScope === 'cost'}
                    label="Save cost"
                  />
                </form>
              ) : null}
            </div>
          )}
        </Tabs>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={requestClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Discard confirmation (spec US-5). The blast radius is why it matters here and not in the
          dialogs this replaces: up to three scopes can be independently dirty at once, so one
          Escape reflex now risks three forms' worth of work instead of one. */}
      <ConfirmDialog
        open={confirmingClose}
        onClose={() => setConfirmingClose(false)}
        onConfirm={() => {
          setConfirmingClose(false);
          onClose();
        }}
        title="Discard unsaved changes?"
        description={`${dirtyScopeNames.join(', ')} ${
          dirtyScopeNames.length === 1 ? 'has' : 'have'
        } unsaved changes. Closing will discard them.`}
        confirmLabel="Discard"
      />
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
