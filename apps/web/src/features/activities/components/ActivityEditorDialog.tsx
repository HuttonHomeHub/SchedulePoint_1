import {
  SELECTABLE_CONSTRAINT_TYPES,
  type ActivitySummary,
  type CalendarSummary,
  type DependencySummary,
} from '@repo/types';
import { useCallback, useState } from 'react';
import { useWatch } from 'react-hook-form';

import { costBody, generalBody, schedulingBody } from '../api/scope-bodies';
import { useUpdateActivityFields } from '../api/use-activities';
import { activityContextFacts, activitySubtitle } from '../lib/activity-editor-context';
import type { ActivityEditorGating } from '../lib/activity-editor-gating';
import type { ActivityEditorIntent, ActivityEditorTab } from '../lib/activity-editor-intent';
import { DURATION_NEEDS_WHOLE_DAYS, durationWriteFields } from '../model/duration-field';
import { useDurationSeed } from '../model/use-duration-seed';
import {
  ACCRUAL_TYPE_LABELS,
  ACCRUAL_TYPE_OPTIONS,
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
  isDurationDerivedType,
  isMilestoneType,
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
import { ActivityIdentityFields } from './fields/ActivityIdentityFields';
import { ActivityWorkFields } from './fields/ActivityWorkFields';
import { useScopeForm } from './useScopeForm';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { FieldGateProvider } from '@/components/ui/field-gate';
import { CheckboxField, FormProblemCount, SelectField, TextField } from '@/components/ui/form';
import {
  ContextStrip,
  FieldGrid,
  FieldGridContainer,
  FormSection,
} from '@/components/ui/form-layout';
import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import { Tabs, type TabDescriptor, type TabMarker } from '@/components/ui/tabs';
import { useMediaQuery } from '@/components/ui/use-media-query';
import {
  ACTIVITY_CALENDAR_ENABLED,
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED,
  ACTIVITY_STEPS_ENABLED,
  ADVANCED_ACTIVITY_TYPES_ENABLED,
  ADVANCED_CONSTRAINTS_ENABLED,
  COST_ACCRUAL_ENABLED,
  EARNED_VALUE_ENABLED,
  INTER_PROJECT_DATES_ENABLED,
  NOTES_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
  RESOURCES_ENABLED,
  WBS_IMPROVEMENTS_ENABLED,
} from '@/config/env';
import { ActivityLogicPanel } from '@/features/dependencies';
import { ActivityResourcesPanel } from '@/features/resources';
import { ActivityMembersPanel } from '@/features/wbs';
import { effectiveHoursPerDay } from '@/lib/effective-hours-per-day';
import { cn } from '@/lib/utils';

type TabKey = ActivityEditorTab;

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
 *
 * **The layout is ADR-0061 Direction B**: a section rail beside a pane, at the `xl` dialog size.
 * The editor is the app's only dialog that earns it, and the reason is the same one that made
 * per-scope save structural — the scopes carry *different permissions*, and a horizontal tab strip
 * has nowhere to say so. In the rail, a Contributor sees "General 🔒 / Scheduling 🔒 / Progress" on
 * arrival instead of discovering each shut form by clicking into it. Inside the pane, fields are
 * grouped with {@link FormSection} and paired with {@link FieldGrid}; above it, {@link ContextStrip}
 * keeps the computed dates and float on screen, which the previous version showed nowhere at all.
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
  planCalendarId,
  planActivities = [],
  planActivitiesLoading = false,
  planActivitiesError = false,
  logic,
  notesSlot,
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
  /**
   * The plan's own calendar id — what an activity's empty `calendarId` ("inherit") resolves to.
   * Route-composed like {@link calendars}; needed only to read the duration field's working-hours
   * factor (ADR-0070). Absent leaves that field in whole working days.
   */
  planCalendarId?: string;
  planActivities?: ActivitySummary[];
  /**
   * The plan's activities are still in flight — the WBS picker says so rather than reading as
   * "this plan has no summaries", which is the same distinction {@link calendarsLoading} draws.
   * Both mount sites already held this signal and were passing it to the create dialog; the editor
   * had nowhere to put it until M2-T3.
   */
  planActivitiesLoading?: boolean;
  /** The plan's activities failed to load — surfaced in the WBS picker, not swallowed. */
  planActivitiesError?: boolean;
  /**
   * Composition-root wiring for the **Logic** tab, grouped so the tab's seams arrive and leave
   * together rather than as four loose props (the cross-plan slot is the `notesSlot` precedent:
   * this feature must not import `cross-plan-dependencies` sideways). Absent ⇒ the tab renders the
   * plain panel, which is what a host without those flags wants.
   */
  logic?: {
    /** `VITE_PROGRAMME_SCHEDULING`'s cross-plan links section (ADR-0045). */
    crossPlanSlot?: React.ReactNode;
    /** Undo recording for an added link (ADR-0048 M2). */
    onAdded?: (dependency: DependencySummary) => void;
    /** Undo recording for a removed link (ADR-0048 M2). */
    onRemoved?: (dependency: DependencySummary) => void;
    /** The coalesced keyboard lag nudge (ADR-0052 M3) — `Shift+←/→` on a link's row buttons. */
    onNudgeLag?: (dependency: DependencySummary, delta: number) => void;
  };
  /**
   * The `VITE_NOTES` activity-notes section (ADR-0046), passed by the composition root for the same
   * reason as the cross-plan slot: this feature must not import the notes data layer sideways.
   * Absent ⇒ no Notes tab, which is what a host without the flag wants.
   */
  notesSlot?: React.ReactNode;
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

  // The General scope seeds its duration from the factor known at OPEN; `useDurationSeed` below
  // re-reads it once the calendar list lands, so a sub-day duration is never shown (or saved) as
  // its rounded day. The seed factor deliberately reads the SAVED calendar, not a watched one —
  // nothing is watched yet at this point in the render.
  const seedFactor = effectiveHoursPerDay(calendars, {
    activityCalendarId: activity?.calendarId ?? '',
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
  });
  const general = useScopeForm(
    activityGeneralSchema,
    (a) => seedGeneral(a, seedFactor),
    activity,
    open,
  );
  const scheduling = useScopeForm(activitySchedulingSchema, seedScheduling, activity, open);
  const cost = useScopeForm(activityCostSchema, seedCost, activity, open);

  // The live factor follows the calendar the SCHEDULING scope currently selects — a planner can
  // change the calendar and the duration in one visit, and the two tabs must agree (ADR-0070 §3).
  //
  // `useWatch`, never `form.watch`, and on a multi-form host that is not a style choice:
  // `form.watch` subscribes the WHOLE component to that form's every field, so a keystroke in any
  // Scheduling control re-renders all four tabs' worth of markup. This value is also the one the
  // calendar field renders, which is why there is exactly one subscription rather than two.
  const scopeCalendarId = useWatch({ control: scheduling.form.control, name: 'calendarId' });
  const hoursPerDay = effectiveHoursPerDay(calendars, {
    activityCalendarId: scopeCalendarId ?? '',
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
  });
  // Hoisted rather than inlined, for the same reason as in `ActivityFormDialog`: an arrow rebuilt
  // per render defeats the React Compiler's memoization downstream of it.
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
    // The field's LIVE value, not a dirty flag captured by this render — see TECH_DEBT #83.
    readDuration,
    setDuration,
  });

  const type = useWatch({ control: general.form.control, name: 'type' });
  const constraintType = useWatch({ control: scheduling.form.control, name: 'constraintType' });
  const secondaryConstraintType = useWatch({
    control: scheduling.form.control,
    name: 'secondaryConstraintType',
  });

  const parentOptions = planActivities.filter(
    (a) => a.type === 'WBS_SUMMARY' && a.id !== activity?.id,
  );
  // A stored parent the list cannot resolve — soft-deleted, outside the loaded page, or still in
  // flight. Watched rather than read from `activity`, because clearing the picker must remove the
  // honest option rather than leave it selected.
  const parentId = useWatch({ control: general.form.control, name: 'parentId' });
  const missingParent = Boolean(parentId) && !parentOptions.some((p) => p.id === parentId);

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
      ...marker(general.errorCount, general.isDirty, gating.general.writable),
    },
    {
      id: 'scheduling',
      label: 'Scheduling',
      ...marker(scheduling.errorCount, scheduling.isDirty, gating.scheduling.writable),
    },
    // Logic is a **collection**, not a form: it has no draft state to be dirty and no field to be
    // invalid, so it can only ever carry the read-only marker (spec §2 "Save model").
    ...(ACTIVITY_EDITOR_CONVERGENCE_ENABLED
      ? [{ id: 'logic' as const, label: 'Logic', ...collectionMarker(gating.logic) }]
      : []),
    // Resources needs BOTH flags: the convergence one to be a tab at all, and `VITE_RESOURCES`
    // because there is no resources surface without it. A tab whose entry point is hidden — or an
    // entry point with no tab — is the exact flag-parity gap the ADR-0060 security review caught on
    // the steps panel, so the four combinations have their own matrix test.
    //
    // It sits **before** Progress, following the spec's order (§4.11): what the activity IS
    // (General/Scheduling) → what it depends on (Logic) → what does the work (Resources) → how it is
    // going (Progress) → what it costs (Cost) → what people said (Notes). Resources is a definition
    // scope on the same pen-gated rule as Logic, so it belongs on that side of the status divide.
    ...(ACTIVITY_EDITOR_CONVERGENCE_ENABLED && RESOURCES_ENABLED
      ? [{ id: 'resources' as const, label: 'Resources', ...collectionMarker(gating.resources) }]
      : []),
    // Members — a WBS summary's contents (`VITE_WBS_IMPROVEMENTS`). Conditional on the SUBJECT, not
    // just on a flag: every other tab here asks something of any activity, and "what is filed under
    // this?" is meaningless for one that cannot hold anything. It sits after Resources and before
    // Progress, on the definition side of the status divide, because membership is a pen-gated
    // structural fact and reuses the `definition` gate object verbatim (see `gating.members`).
    ...(WBS_IMPROVEMENTS_ENABLED && activity?.type === 'WBS_SUMMARY'
      ? [{ id: 'members' as const, label: 'Members', ...collectionMarker(gating.members) }]
      : []),
    // Progress is never marked read-only: it is the one scope the pen does not gate (ADR-0028 Q-C),
    // so a padlock here would be a lie in exactly the situation the rail exists to clarify.
    { id: 'progress', label: 'Progress' },
    ...(gating.cost.readable
      ? [
          {
            id: 'cost' as const,
            label: 'Cost',
            ...marker(cost.errorCount, cost.isDirty, gating.cost.writable),
          },
        ]
      : []),
    // Notes, like Progress, are **never** marked read-only: the pen does not gate them (ADR-0046),
    // so a padlock would be false for exactly the reader it is meant to inform. Needs `VITE_NOTES`
    // as well as the convergence flag, and the composition root's slot to have anything to show.
    ...(ACTIVITY_EDITOR_CONVERGENCE_ENABLED && NOTES_ENABLED && notesSlot
      ? [{ id: 'notes' as const, label: 'Notes' }]
      : []),
  ];

  const facts = activity ? activityContextFacts(activity) : [];

  // The rail needs ~208px of the dialog's width before the pane starts squeezing its two-column
  // grids into unusable stubs. Below `md` the same list becomes the horizontal strip it was — a
  // structural switch, which is what `useMediaQuery` is for rather than a CSS utility. The fallback
  // is the rail, so jsdom and a server render both get the desktop shape.
  const railFits = useMediaQuery('(min-width: 768px)', true);

  return (
    <Dialog
      open={open}
      // Escape and the backdrop route through the same guard as the Close button — an Escape reflex
      // is exactly the case the confirmation exists for.
      onClose={requestClose}
      confirmBeforeClose
      size="xl"
      body="flush"
      title={activity ? activity.name : 'Edit activity'}
      {...(activity
        ? { description: activitySubtitle(activity, ACTIVITY_TYPE_LABELS[activity.type]) }
        : {})}
    >
      {facts.length > 0 ? (
        <ContextStrip
          label="Computed schedule"
          className="mx-6 mb-4 shrink-0"
          facts={facts.map((fact) => ({
            label: fact.label,
            value: (
              <span
                className={cn(
                  fact.tone === 'critical' && 'text-destructive-text',
                  fact.tone === 'warning' && 'text-warning-text',
                )}
              >
                {fact.text}
              </span>
            ),
          }))}
        />
      ) : null}

      <div className="border-border flex min-h-0 flex-1 flex-col border-t">
        <Tabs
          label="Activity sections"
          tabs={tabs}
          active={active}
          onChange={setActive}
          orientation={railFits ? 'vertical' : 'horizontal'}
          className="flex-1"
        >
          {(current) => (
            <FieldGridContainer className="flex flex-1 flex-col gap-4 p-6">
              {current === 'general' ? (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void general.form.handleSubmit((values) => {
                      // The one check the schema deliberately cannot make (ADR-0070): reachable
                      // only on the degraded whole-days path, where `4h` is well-formed text this
                      // field cannot express without a factor.
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
                      saveScope('general', generalBody(values, hoursPerDay), 'General', () =>
                        general.form.reset(values),
                      );
                    })(event);
                  }}
                  className="flex flex-col gap-4"
                >
                  <FormProblemCount errors={general.form.formState.errors} />
                  {scopeError('general')}

                  <FieldGateProvider gate={gating.general}>
                    <ActivityIdentityFields form={general.form} />

                    <ActivityWorkFields
                      form={general.form}
                      hoursPerDay={hoursPerDay}
                      {...(activity?.type === undefined ? {} : { savedType: activity.type })}
                    />

                    {/* The WBS hint is invariant to loading (mirrors the calendar picker), so it
                      never asserts a false state while the plan activities are still resolving.
                      The "no summaries yet" guidance is a distinct, appended clause shown only
                      once the list has resolved empty — not conflated with loading or a load
                      failure.

                      The section's `aside` is deliberately gone: it read "No summaries in this
                      plan" whenever the offerable list was empty, which is exactly when a stored
                      but unresolvable parent is most likely — so the one activity that disproves
                      the sentence was the one it was shown to. */}
                    {ADVANCED_ACTIVITY_TYPES_ENABLED ? (
                      <FormSection title="Breakdown">
                        <SelectField
                          // "Parent WBS summary", not "WBS summary": the Type selector on this
                          // same form offers an OPTION labelled exactly "WBS summary", so the
                          // shorter label reads as if it sets the type. The editor disambiguated
                          // this and create never did — the one row in D2 where create loses.
                          label="Parent WBS summary"
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
                          {...general.form.register('parentId')}
                        >
                          <option value="">None (top-level)</option>
                          {/* A seeded parent not in the list stays selected under an honest label
                            so the form never silently un-nests the activity (never blank, which
                            reads as "top-level"). */}
                          {missingParent ? (
                            <option value={parentId}>
                              {planActivitiesLoading ? 'Loading…' : 'Unavailable'}
                            </option>
                          ) : null}
                          {parentOptions.map((summary) => (
                            <option key={summary.id} value={summary.id}>
                              {summary.code ? `${summary.code} · ${summary.name}` : summary.name}
                            </option>
                          ))}
                        </SelectField>
                      </FormSection>
                    ) : null}
                    <ScopeSaveBar
                      gate={gating.general}
                      dirty={general.isDirty}
                      pending={update.isPending}
                      saved={savedScope === 'general'}
                      label="Save general"
                    />
                  </FieldGateProvider>
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
                  <FormProblemCount errors={scheduling.form.formState.errors} />
                  {scopeError('scheduling')}

                  <FieldGateProvider gate={gating.scheduling}>
                    {ACTIVITY_CALENDAR_ENABLED ? (
                      <FormSection
                        title="Working time"
                        description="Which calendar's working days this activity's duration is measured in."
                      >
                        <ActivityCalendarField
                          value={scopeCalendarId ?? ''}
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
                        />
                      </FormSection>
                    ) : null}

                    <FormSection
                      title="Constraints"
                      description="Dates you impose on the network. A constraint overrides what the logic would otherwise decide."
                      aside={constraintType ? undefined : 'None set'}
                    >
                      {/* The pair that made the flat list unreadable: a constraint type and its date
                        are one decision, and stacking them made them look like two. */}
                      <FieldGrid columns="lead">
                        <SelectField
                          label="Constraint"
                          hint="Pins the activity’s start or finish to a date. Only constraints the scheduler applies exactly as named are listed."
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
                            error={scheduling.form.formState.errors.constraintDate?.message}
                            {...scheduling.form.register('constraintDate')}
                          />
                        ) : null}
                        {ADVANCED_CONSTRAINTS_ENABLED ? (
                          <>
                            <SelectField
                              label="Secondary constraint"
                              hint="A second date constraint that drives the activity’s late dates. The primary constraint drives its early dates."
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
                                error={
                                  scheduling.form.formState.errors.secondaryConstraintDate?.message
                                }
                                {...scheduling.form.register('secondaryConstraintDate')}
                              />
                            ) : null}
                          </>
                        ) : null}
                      </FieldGrid>
                    </FormSection>

                    <FormSection
                      title="Placement &amp; targets"
                      description="How the activity is positioned once its dates are known."
                    >
                      <FieldGrid>
                        <CheckboxField
                          label="Schedule as late as possible"
                          hint="Draws the activity at its latest position without changing its dates or float. A display preference, not a date constraint."
                          {...scheduling.form.register('scheduleAsLateAsPossible')}
                        />
                        {ADVANCED_CONSTRAINTS_ENABLED && !isDurationDerivedType(type) ? (
                          <TextField
                            label="Expected finish"
                            type="date"
                            hint="A target finish date. When the plan’s “Expected-finish scheduling” option is on, the engine sizes this activity’s work so it finishes on this date (Recalculate to apply)."
                            {...scheduling.form.register('expectedFinish')}
                          />
                        ) : null}
                      </FieldGrid>
                    </FormSection>

                    {INTER_PROJECT_DATES_ENABLED ? (
                      <FormSection
                        title="External interfaces"
                        description="Dates imported from another plan or programme. They bound this activity but never pin it."
                        aside={
                          activity?.externalDriven === true ? 'Driving this activity' : undefined
                        }
                      >
                        <FieldGrid>
                          <TextField
                            label="External early start"
                            type="date"
                            hint="The earliest an upstream plan or project hands this activity over. Recalculate to apply; the later of this and the activity’s logic wins."
                            {...scheduling.form.register('externalEarlyStart')}
                          />
                          <TextField
                            label="External late finish"
                            type="date"
                            hint="The latest a downstream plan or project allows this activity to finish. Earlier than the logic can achieve, it shows as negative float."
                            error={scheduling.form.formState.errors.externalLateFinish?.message}
                            {...scheduling.form.register('externalLateFinish')}
                          />
                        </FieldGrid>
                      </FormSection>
                    ) : null}

                    {RESOURCE_LEVELLING_ENABLED ? (
                      <FormSection
                        title="Levelling"
                        description="Used only when the plan is levelled."
                      >
                        <FieldGrid>
                          <TextField
                            label="Levelling priority"
                            type="number"
                            min={0}
                            hint="Lower wins the resource when two activities contend under resource levelling. Leave blank for lowest priority."
                            error={scheduling.form.formState.errors.levelingPriority?.message}
                            {...scheduling.form.register('levelingPriority', {
                              setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                            })}
                          />
                        </FieldGrid>
                      </FormSection>
                    ) : null}
                    <ScopeSaveBar
                      gate={gating.scheduling}
                      dirty={scheduling.isDirty}
                      pending={update.isPending}
                      saved={savedScope === 'scheduling'}
                      label="Save scheduling"
                    />
                  </FieldGateProvider>
                </form>
              ) : null}

              {/* Logic — the same `ActivityLogicPanel` the Logic dialog renders, not a copy of it.
                  Its queries are gated on this tab being the active one, so opening the editor on
                  General does not fetch every activity's predecessors on the way past. */}
              {current === 'logic' ? (
                <ActivityLogicPanel
                  orgSlug={orgSlug}
                  planId={planId}
                  planActivities={planActivities}
                  calendars={calendars}
                  {...(planCalendarId === undefined ? {} : { planCalendarId })}
                  canManageLogic={gating.logic.writable}
                  enabled={open && current === 'logic'}
                  {...(activity ? { activity } : {})}
                  {...(gating.logic.reason ? { manageLogicReason: gating.logic.reason } : {})}
                  {...(logic?.crossPlanSlot ? { crossPlanSlot: logic.crossPlanSlot } : {})}
                  {...(logic?.onAdded ? { onAdded: logic.onAdded } : {})}
                  {...(logic?.onRemoved ? { onRemoved: logic.onRemoved } : {})}
                  {...(logic?.onNudgeLag ? { onNudgeLag: logic.onNudgeLag } : {})}
                />
              ) : null}

              {/* Members — a WBS summary's contents. Rendered only for a `WBS_SUMMARY`, which is
                  also the only case the tab exists for, so the two conditions cannot disagree. It
                  is handed the plan's already-loaded activities rather than fetching its own: the
                  editor has them, the plan is bounded, and a second list here could disagree with
                  the one the Scheduling tab's parent picker shows. */}
              {current === 'members' && activity ? (
                <ActivityMembersPanel
                  orgSlug={orgSlug}
                  planId={planId}
                  summary={activity}
                  planActivities={planActivities}
                  gate={gating.members}
                />
              ) : null}

              {/* Resources — the same `ActivityResourcesPanel` the Resources dialog renders. The
                  milestone and duration-type facts are derived from the row the editor already
                  holds, rather than passed in by each host as the dialog required. */}
              {current === 'resources' && activity ? (
                <ActivityResourcesPanel
                  orgSlug={orgSlug}
                  planId={planId}
                  activityId={activity.id}
                  activityDurationType={activity.durationType}
                  // The join lag's day↔minute factor (ADR-0071 M4). Deliberately `seedFactor` — the
                  // SAVED calendar — and not the `hoursPerDay` the duration field uses: that one
                  // follows the Scheduling tab's pending selection, which is right for a duration
                  // saved alongside it and wrong for an assignment write that does not carry the
                  // calendar at all.
                  {...(seedFactor === undefined ? {} : { activityHoursPerDay: seedFactor })}
                  isMilestone={isMilestoneType(activity.type)}
                  canWrite={gating.resources.writable}
                  // Shaded with the reason, never hidden — the same seam the Logic tab uses one
                  // block above. Dropping it made a Planner without the pen meet a Resources tab
                  // whose assign form had simply vanished, with a padlock on the rail as the only
                  // clue: the lit-but-inert dead end inverted, which is no better.
                  {...(gating.resources.reason ? { writeReason: gating.resources.reason } : {})}
                  // The Cost tab and the assignment money fields answer to one gate: a role that
                  // cannot read cost gets no tab AND no cost fields on a row. Latent today
                  // (`canReadCost === canWrite`, TECH_DEBT #62) and load-bearing the day it isn't.
                  canReadCost={gating.cost.readable}
                  enabled={open && current === 'resources'}
                />
              ) : null}

              {/* Notes — the composition root's section, given a tab of its own so **Add note**
                  lands on it directly. Before this it opened the Logic dialog and then scrolled +
                  focused a section three panels down; the reveal plumbing that did so survives
                  untouched on the flag-off path, which still needs it. */}
              {current === 'notes' ? notesSlot : null}

              {/* The co-location (M4): three panels, three write scopes, each headed by what it
                  does to the schedule. Rendered only when a row exists — every panel writes. */}
              {current === 'progress' && activity ? (
                <div className="flex flex-col gap-8">
                  <ReportedProgressPanel
                    orgSlug={orgSlug}
                    planId={planId}
                    activity={activity}
                    hoursPerDay={hoursPerDay}
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
                  <FormProblemCount errors={cost.form.formState.errors} />
                  {scopeError('cost')}

                  <FieldGateProvider gate={gating.cost}>
                    {EARNED_VALUE_ENABLED ? (
                      <FormSection
                        title="Expenses"
                        description="Lump sums carried directly on this activity, on top of any resource-derived cost."
                      >
                        <FieldGrid>
                          <TextField
                            label="Budgeted expense"
                            type="number"
                            step="0.01"
                            hint="A lump-sum budgeted cost for this activity, in the plan’s currency, on top of any resource-derived cost."
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
                            error={cost.form.formState.errors.actualExpense?.message}
                            {...cost.form.register('actualExpense', {
                              setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
                            })}
                          />
                        </FieldGrid>
                      </FormSection>
                    ) : null}
                    {COST_ACCRUAL_ENABLED ? (
                      <FormSection
                        title="Recognition"
                        description="Changes only when cost is recognised in Earned value — never a date."
                      >
                        <FieldGrid>
                          <SelectField
                            label="Cost accrual"
                            hint="Sets when this activity’s cost is recognised: Start (all at the start), Uniform (spread evenly), or End (all at the finish)."
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
                    <ScopeSaveBar
                      gate={gating.cost}
                      dirty={cost.isDirty}
                      pending={update.isPending}
                      saved={savedScope === 'cost'}
                      label="Save cost"
                    />
                  </FieldGateProvider>
                </form>
              ) : null}
            </FieldGridContainer>
          )}
        </Tabs>

        {/* The dialog's own footer, outside the pane: Close belongs to the editor, not to whichever
            section happens to be open. It stays put while the pane scrolls, which is the point of
            `body="flush"` — previously it sat below the panel and scrolled away with it. */}
        <div className="border-border bg-muted flex shrink-0 justify-end border-t px-6 py-3">
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

/**
 * One marker per scope, in priority order: **errors, then unsaved edits, then read-only**.
 *
 * The order is the order a planner needs them. An invalid field is the only one that stops a save,
 * so it outranks everything. An unsaved edit is the next most perishable. Read-only comes last
 * because it is the *stable* fact — and a scope cannot be both dirty and read-only anyway, since a
 * shut form has nothing to dirty.
 */
/**
 * The marker for a **collection** tab — Logic, Resources — which owns no draft state.
 *
 * Deliberately never `dot` or `count`: a link is created by its own request the moment you press
 * Add, so there is nothing unsaved to warn about and nothing for the discard confirmation to name.
 * Sharing {@link marker} would have made that a bug waiting for someone to pass a count.
 */
function collectionMarker(gate: { writable: boolean }): Pick<TabDescriptor<string>, 'marker'> {
  return gate.writable
    ? {}
    : { marker: { kind: 'locked', label: 'read-only' } satisfies TabMarker };
}

function marker(
  errorCount: number,
  dirty: boolean,
  writable: boolean,
): Pick<TabDescriptor<string>, 'marker'> {
  if (errorCount > 0) {
    const label = errorCount === 1 ? '1 problem' : `${errorCount} problems`;
    return { marker: { kind: 'count', count: errorCount, label } satisfies TabMarker };
  }
  if (dirty) return { marker: { kind: 'dot', label: 'unsaved changes' } satisfies TabMarker };
  if (!writable) return { marker: { kind: 'locked', label: 'read-only' } satisfies TabMarker };
  return {};
}
