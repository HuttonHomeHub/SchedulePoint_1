import { zodResolver } from '@hookform/resolvers/zod';
import { type ActivitySummary } from '@repo/types';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { costBody, generalBody, measureBody, schedulingBody } from '../api/scope-bodies';
import { useActivitySteps } from '../api/use-activity-steps';
import { activityContextFacts } from '../lib/activity-editor-context';
import type { ActivityEditorTab } from '../lib/activity-editor-intent';
import { DURATION_NEEDS_WHOLE_DAYS, durationWriteFields } from '../model/duration-field';
import { seedRemainingText } from '../model/remaining-field';
import { useDurationSeed, useLateSeed } from '../model/use-duration-seed';
import {
  isDurationDerivedType,
  isMilestoneType,
  progressFormSchema,
  type ProgressFormValues,
} from '../schemas/activity-schemas';
import {
  activityCostSchema,
  activityGeneralSchema,
  activityMeasureSchema,
  activitySchedulingSchema,
  type ActivityMeasureValues,
} from '../schemas/activity-scope-schemas';
import {
  sameStepRows,
  stepRowsFromSaved,
  stepsFormSchema,
  type StepsFormValues,
} from '../schemas/step-schemas';

import {
  seedCost,
  seedGeneral,
  seedMeasure,
  seedProgress,
  seedScheduling,
} from './activity-editor-seeds';
import type { ActivityEditorSessionProps } from './activity-editor-types';
import {
  ReportedProgressPanel,
  ValueMeasurePanel,
  WeightedStepsPanel,
} from './ActivityProgressPanels';
import { ActivityAccrualField } from './fields/ActivityAccrualField';
import { ActivityBreakdownField } from './fields/ActivityBreakdownField';
import { ActivityCalendarField } from './fields/ActivityCalendarField';
import { ActivityConstraintFields } from './fields/ActivityConstraintFields';
import { ActivityExpenseFields } from './fields/ActivityExpenseFields';
import { ActivityExternalDatesFields } from './fields/ActivityExternalDatesFields';
import { ActivityIdentityFields } from './fields/ActivityIdentityFields';
import { ActivityLevellingField } from './fields/ActivityLevellingField';
import { MEASURE_SECTION_TITLE } from './fields/ActivityMeasureFields';
import { ActivityPlacementFields } from './fields/ActivityPlacementFields';
import { ActivityWorkFields } from './fields/ActivityWorkFields';
import { useScopeForm } from './useScopeForm';

import { useRegisterUnsavedWork } from '@/components/layout/unsaved-work/unsaved-work-provider';
import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FieldGateProvider } from '@/components/ui/field-gate';
import { FormProblemCount } from '@/components/ui/form';
import { ContextStrip, FieldGridContainer, FormSection } from '@/components/ui/form-layout';
import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import { Tabs, type TabDescriptor, type TabMarker } from '@/components/ui/tabs';
import { useMediaQuery } from '@/components/ui/use-media-query';
import {
  ACTIVITY_CALENDAR_ENABLED,
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED,
  ACTIVITY_STEPS_ENABLED,
  ADVANCED_ACTIVITY_TYPES_ENABLED,
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
import { activityDayFactorFrame, effectiveHoursPerDay } from '@/lib/effective-hours-per-day';
import {
  buildReport,
  describeUnsavedWork,
  type UnsavedWorkReport,
} from '@/lib/unsaved-work/report';
import { cn } from '@/lib/utils';

type TabKey = ActivityEditorTab;

/** The Progress tab's three panels, each of which saves and fails on its own. */
type PanelSlot = 'progress' | 'measure' | 'steps';

/** Every scope that can say "Saved.": the tabs' definition scopes and the Progress tab's panels. */
type SaveSlot = TabKey | PanelSlot;

/**
 * One opening of the editor (ADR-0169 D3): every form and every other piece of working state, mounted
 * when the dialog opens and gone when it closes. What must outlive an opening — the `<dialog>` and
 * the scope-save mutation — stays in {@link ActivityEditorDialog}, which is why its forms are
 * born with their values rather than reset into them.
 */
export function ActivityEditorSession({
  handleRef,
  orgSlug,
  planId,
  onClose,
  saves,
  gating,
  intent,
  activity,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
  planCalendarId,
  planActivities = [],
  planActivitiesLoading = false,
  planActivitiesError = false,
  logic,
  notesSlot,
}: ActivityEditorSessionProps): React.ReactElement {
  const announce = useAnnounce();
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
  /**
   * The scopes that have saved — the visible half of the save signal, shown by `ScopeSaveBar` while
   * the scope is clean. A record rather than one slot because the Progress tab shows three scopes at
   * once, each of which says "Saved." for itself. Cleared per scope when its next save begins.
   */
  const [savedSlots, setSavedSlots] = useState<Partial<Record<SaveSlot, true>>>({});
  const markSaved = (slot: SaveSlot, saved: boolean): void =>
    setSavedSlots((held) => {
      if (saved) return { ...held, [slot]: true };
      const { [slot]: _cleared, ...rest } = held;
      return rest;
    });
  /**
   * A Progress-tab panel's save failure, shown inside the panel that made the write. These panels have
   * no "Refresh this section" recovery (their rows are not re-seeded from the list), so they carry a
   * message and nothing else — held here, not in the mutation, because the mutation outlives the
   * session (ADR-0169 D-10) and its error would greet the next opening.
   */
  const [panelErrors, setPanelErrors] = useState<Partial<Record<PanelSlot, string>>>({});
  const setPanelError = (slot: PanelSlot, message: string | null): void =>
    setPanelErrors((held) => {
      if (message !== null) return { ...held, [slot]: message };
      const { [slot]: _cleared, ...rest } = held;
      return rest;
    });
  /** Whether the discard confirmation (spec US-5) is showing. */
  const [confirmingClose, setConfirmingClose] = useState(false);

  // The entry point chooses the landing tab (ADR-0060 §7): **Report progress** and **Steps** open
  // the same editor as **Edit**, on the tab that answers the action. A session is born per opening,
  // so `useState` above already lands it; this adjustment covers a host that hands the SAME session
  // a new intent without closing, while the user's own tab clicks survive every other re-render.
  //
  // Adjusted **during render** against the previous intent, not in an effect: an effect would paint
  // the stale tab first and then correct it, and setting state from one is the cascading-render
  // pattern the lint rule rejects. A new intent is a fresh object, so identity is the signal.
  const [seenIntent, setSeenIntent] = useState(intent);
  if (intent !== seenIntent) {
    setSeenIntent(intent);
    if (intent) setActive(intent.tab);
  }

  // The steps list is fetched on the first visit to Progress in an opening, not at open (D-8) — the
  // query lives with the form it seeds, and a Contributor who never looks at Progress never pays for
  // it. Adjusted during render for the same reason as the intent above: it is derived from `active`.
  const [stepsRequested, setStepsRequested] = useState(active === 'progress');
  if (active === 'progress' && !stepsRequested) setStepsRequested(true);

  // The General scope seeds its duration from the factor known at OPEN; `useDurationSeed` below
  // re-reads it once the calendar list lands, so a sub-day duration is never shown (or saved) as
  // its rounded day. The seed factor deliberately reads the SAVED calendar, not a watched one —
  // nothing is watched yet at this point in the render.
  //
  // **Two rules, so two values** (`docs/TECH_DEBT.md` #86). This was one `seedFactor` serving both
  // the duration seed and the Resources tab's join-lag prop, and those are measured on different
  // calendars for a driven activity: a duration measures the WORK (the driving resource's calendar,
  // ADR-0039 §4) and the join lag is deliberately framed on the activity's OWN (ADR-0071 §1).
  // Before this split the single value was the second answer, which made the duration seed wrong.
  const seedFrame = activityDayFactorFrame(activity);
  const durationSeedFactor = effectiveHoursPerDay(calendars, {
    activityCalendarId: activity.calendarId ?? '',
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
    frame: seedFrame,
  });
  const joinLagFactor = effectiveHoursPerDay(calendars, {
    activityCalendarId: activity.calendarId ?? '',
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
    frame: { kind: 'own' },
  });
  const general = useScopeForm(
    activityGeneralSchema,
    (a) => seedGeneral(a, durationSeedFactor),
    activity,
  );
  const scheduling = useScopeForm(activitySchedulingSchema, seedScheduling, activity);
  const cost = useScopeForm(activityCostSchema, seedCost, activity);

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
    // The Duration field and the Progress tab's remaining both measure the WORK, so they read on the
    // calendar the activity schedules on (#86). The calendar id is the WATCHED one — a planner can
    // change calendar and duration in one edit — while the type and driver come from the saved row,
    // because neither is editable here.
    frame: seedFrame,
  });
  // Hoisted rather than inlined, for the same reason as in `ActivityCreateDialog`: an arrow rebuilt
  // per render defeats the React Compiler's memoization downstream of it.
  const generalSetValue = general.form.setValue;
  const generalGetValues = general.form.getValues;
  const setDuration = useCallback(
    (text: string) => generalSetValue('duration', text),
    [generalSetValue],
  );
  const readDuration = useCallback(() => generalGetValues('duration'), [generalGetValues]);
  useDurationSeed({
    hoursPerDay,
    activity,
    // The field's LIVE value, not a dirty flag captured by this render — see TECH_DEBT #83.
    readDuration,
    setDuration,
  });

  // **The Progress tab's three forms live here, with the others** (F4, ADR-0169 §4.6). The panels are
  // mounted only while their tab shows, so a form made inside one died on every tab switch while the
  // marker and the close confirmation went on claiming it. Born with their values, like every other
  // scope: nothing seeds them again, so they open no typed-input window.
  const progress = useScopeForm<ProgressFormValues>(
    progressFormSchema,
    (row) => seedProgress(row, hoursPerDay),
    activity,
  );
  const measure = useScopeForm<ActivityMeasureValues>(activityMeasureSchema, seedMeasure, activity);

  // Remaining was seeded late only because its panel used to mount late. It takes the duration's
  // treatment: once per opening, compared to the field's live value, never over typed text. The write
  // is `resetField`, so the seeded text becomes the field's default and a seed is not an edit.
  const progressResetField = progress.form.resetField;
  const progressGetValues = progress.form.getValues;
  const readRemaining = useCallback(
    () => progressGetValues('remaining') ?? '',
    [progressGetValues],
  );
  const setRemaining = useCallback(
    (text: string) => progressResetField('remaining', { defaultValue: text }),
    [progressResetField],
  );
  useLateSeed({
    hoursPerDay,
    read: readRemaining,
    write: setRemaining,
    seed: (factor) => seedRemainingText(activity, factor),
  });

  const stepsQuery = useActivitySteps(orgSlug, stepsRequested ? activity.id : '');
  const stepsForm = useForm<StepsFormValues>({
    resolver: zodResolver(stepsFormSchema),
    defaultValues: { steps: [] },
  });
  const stepsArray = useFieldArray({ control: stepsForm.control, name: 'steps' });
  const stepsDirty = stepsForm.formState.isDirty;

  /**
   * The rows the steps form was last seeded or saved with — what "clean" is measured against, as a
   * live comparison rather than RHF's flag (which a `move()` marks dirty even when the order comes
   * back). Written only from the seed effect and the save callback, never during render.
   */
  const stepsHeld = useRef<StepsFormValues['steps'] | null>(null);
  const stepsData = stepsQuery.data;
  const resetSteps = stepsForm.reset;
  const getSteps = stepsForm.getValues;
  // The first arrival seeds with `keepFieldsRef`, so the registered inputs keep their refs and the
  // rows are not re-registered under a typist. A LATER arrival with different data re-seeds only a
  // clean form (spec D-9): steps are pen-gated, so a change under a draft means the pen moved, and a
  // draft is reported as unsavable (ADR-0108 D5), never wiped by a refetch.
  useEffect(() => {
    if (!stepsData) return;
    const incoming = stepRowsFromSaved(stepsData);
    const held = stepsHeld.current;
    if (held !== null) {
      if (sameStepRows(incoming, held)) return;
      if (!sameStepRows(getSteps('steps'), held)) return;
    }
    stepsHeld.current = incoming;
    resetSteps({ steps: incoming }, { keepFieldsRef: true });
  }, [stepsData, getSteps, resetSteps]);

  const type = useWatch({ control: general.form.control, name: 'type' });

  const parentOptions = planActivities.filter(
    (a) => a.type === 'WBS_SUMMARY' && a.id !== activity.id,
  );

  /**
   * **Every scope this editor can hold work in, with whether it could still be saved.**
   *
   * Six, not three. The `cost` condition on `gating.cost.readable` is preserved exactly: a role that
   * cannot read cost has no Cost tab, and naming a tab the reader cannot see would be worse than
   * saying nothing. That was the one piece of the old derivation that was not a plain `isDirty`.
   *
   * `savable` carries the product owner's CQ-2 answer: when the pen is lost mid-edit the work is
   * unsaved AND unsavable, and the reader is told so rather than let go in silence.
   */
  const unsavedReport = useMemo<UnsavedWorkReport>(
    () =>
      buildReport('This activity', [
        {
          when: general.isDirty,
          key: 'general',
          label: 'General',
          savable: gating.general.writable,
        },
        {
          when: scheduling.isDirty,
          key: 'scheduling',
          label: 'Scheduling',
          savable: gating.general.writable,
        },
        {
          when: cost.isDirty && gating.cost.readable,
          key: 'cost',
          label: 'Cost',
          savable: gating.cost.writable,
        },
        // The labels are the SECTION HEADINGS a planner actually sees, not shorthand. The first
        // version said 'Progress', 'Value measure' and 'Steps' — and 'Progress' is also the name of
        // the TAB that hosts all three, so the dialog could say "Progress, Value measure have
        // unsaved changes", naming a tab and a string that appears nowhere on screen. Found by the
        // ux review; the spec had named the right labels and the code had not used them.
        {
          when: progress.isDirty,
          key: 'progress',
          label: 'Reported progress',
          savable: gating.progress.writable,
        },
        {
          when: measure.isDirty,
          key: 'measure',
          label: MEASURE_SECTION_TITLE,
          savable: gating.progress.writable,
        },
        {
          when: stepsDirty,
          key: 'steps',
          label: 'Weighted steps',
          savable: gating.steps.writable,
        },
      ]),
    [
      general.isDirty,
      scheduling.isDirty,
      cost.isDirty,
      progress.isDirty,
      measure.isDirty,
      stepsDirty,
      gating.general.writable,
      gating.cost.readable,
      gating.cost.writable,
      gating.progress.writable,
      gating.steps.writable,
    ],
  );

  /**
   * Register with the app shell so a navigation, a reload or a closed tab is guarded too — not just
   * this dialog's own Close (unsaved-work guard, M2-T4). The session exists only while the editor is
   * open, so unmounting is what unregisters it: a stale form from a dismissed editor cannot block
   * navigation.
   */
  useRegisterUnsavedWork(unsavedReport);

  const dirtyScopeNames = unsavedReport.scopes.map((scope) => scope.label);

  /** Close, unless there is work to lose — then ask (spec US-5). */
  const requestClose = (): void => {
    if (dirtyScopeNames.length > 0) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  };
  // No deps array, deliberately: `requestClose` closes over this render's `dirtyScopeNames`, and the
  // frame must read the answer as of the latest render, at the moment of the click. A memoised
  // handle would answer from a stale dirty set.
  useImperativeHandle(handleRef, () => ({ requestClose }));

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
   * Save one definition scope through the frame, which owns the mutation (see
   * {@link ActivityEditorDialog}). A 409 surfaces its message and the list refetch re-seeds, so a retry
   * carries the version the other tab's save produced.
   */
  const saveScope = (
    scope: 'general' | 'scheduling' | 'cost',
    patch: Record<string, unknown>,
    label: string,
    resetTo: (after: ActivitySummary) => void,
  ): void => {
    setSaveError((current) => (current?.scope === scope ? null : current));
    markSaved(scope, false);
    saves.saveFields({
      activity,
      patch,
      label,
      // The editor stays open (the agreed behaviour): a multi-scope session would be pointless
      // if saving one tab closed the others. Reset marks the scope clean so its dirty marker
      // clears without discarding what the user just saved.
      onSuccess: (after) => {
        resetTo(after);
        markSaved(scope, true);
      },
      onError: (error) => {
        setSaveError({ scope, message: error.message });
        setActive(scope);
      },
    });
  };

  /** The Progress tab's three writes: the panel's own error and "Saved.", never another scope's. */
  const savePanel = (slot: PanelSlot, begin: () => void): void => {
    setPanelError(slot, null);
    markSaved(slot, false);
    begin();
  };

  const saveMeasure = (values: ActivityMeasureValues): void =>
    savePanel('measure', () =>
      saves.saveFields({
        activity,
        // The body comes from the shared builder, never a literal here — `scope-bodies.ts` is where
        // "this scope's keys and no other's" is stated once and pinned by test.
        patch: measureBody(values),
        label: 'Measure',
        onSuccess: () => {
          measure.form.reset(values);
          markSaved('measure', true);
        },
        onError: (error) => setPanelError('measure', error.message),
      }),
    );

  const saveProgress = (values: ProgressFormValues): void =>
    savePanel('progress', () =>
      saves.saveProgress({
        activity,
        hoursPerDay,
        values,
        onSuccess: () => {
          progress.form.reset(values);
          markSaved('progress', true);
        },
        onError: (error) => setPanelError('progress', error.message),
      }),
    );

  const saveSteps = (steps: StepsFormValues['steps']): void =>
    savePanel('steps', () =>
      saves.saveSteps({
        activity,
        steps,
        onSuccess: (saved) => {
          const rows = stepRowsFromSaved(saved);
          stepsHeld.current = rows;
          stepsForm.reset({ steps: rows });
          markSaved('steps', true);
        },
        onError: (error) => setPanelError('steps', error.message),
      }),
    );

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
    ...(WBS_IMPROVEMENTS_ENABLED && activity.type === 'WBS_SUMMARY'
      ? [{ id: 'members' as const, label: 'Members', ...collectionMarker(gating.members) }]
      : []),
    // Progress is never marked read-only: it is the one scope the pen does not gate (ADR-0028 Q-C),
    // so a padlock here would be a lie in exactly the situation the rail exists to clarify. It DOES
    // carry the unsaved dot (`docs/TECH_DEBT.md` #63), read from the three forms this session holds.
    {
      id: 'progress',
      label: 'Progress',
      ...progressMarker(progress.isDirty || measure.isDirty || stepsDirty),
    },
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

  const facts = activityContextFacts(activity);

  // The rail needs ~208px of the dialog's width before the pane starts squeezing its two-column
  // grids into unusable stubs. Below `md` the same list becomes the horizontal strip it was — a
  // structural switch, which is what `useMediaQuery` is for rather than a CSS utility. The fallback
  // is the rail, so jsdom and a server render both get the desktop shape.
  const viewportFitsRail = useMediaQuery('(min-width: 768px)', true);

  return (
    <>
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
          orientation={viewportFitsRail ? 'vertical' : 'horizontal'}
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
                      saveScope('general', generalBody(values, hoursPerDay), 'General', (after) => {
                        general.form.reset(values);
                        // A type change across the finish-milestone convention made the server
                        // re-express the stored dates (ADR-0162 decision 3), and the Scheduling
                        // form still shows the old ones: a later edit there would send them back
                        // and undo the move. Re-seed it from the saved row — but only when clean,
                        // because a dirty Scheduling tab holds dates the reader typed, and
                        // replacing them would discard work (plan M2-T2 risk R2; the Type hint
                        // says a later Scheduling save is read the new way).
                        if (after.type !== activity.type && !scheduling.form.formState.isDirty) {
                          scheduling.form.reset(seedScheduling(after));
                        }
                      });
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
                      savedType={activity.type}
                      savedDurationMinutes={activity.durationMinutes}
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
                      <ActivityBreakdownField
                        form={general.form}
                        parentOptions={parentOptions}
                        loading={planActivitiesLoading}
                        errored={planActivitiesError}
                      />
                    ) : null}
                    <ScopeSaveBar
                      gate={gating.general}
                      dirty={general.isDirty}
                      pending={saves.fieldsPending}
                      saved={savedSlots.general === true}
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

                    <ActivityConstraintFields form={scheduling.form} />

                    <ActivityPlacementFields form={scheduling.form} activityType={type} />

                    {INTER_PROJECT_DATES_ENABLED ? (
                      <ActivityExternalDatesFields
                        form={scheduling.form}
                        externalDriven={activity.externalDriven === true}
                      />
                    ) : null}

                    {RESOURCE_LEVELLING_ENABLED ? (
                      <ActivityLevellingField form={scheduling.form} activityType={type} />
                    ) : null}
                    <ScopeSaveBar
                      gate={gating.scheduling}
                      dirty={scheduling.isDirty}
                      pending={saves.fieldsPending}
                      saved={savedSlots.scheduling === true}
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
                  enabled={current === 'logic'}
                  activity={activity}
                  {...(gating.logic.reason ? { manageLogicReason: gating.logic.reason } : {})}
                  {...(logic?.crossPlanSlot ? { crossPlanSlot: logic.crossPlanSlot } : {})}
                  {...(logic?.onAdded ? { onAdded: logic.onAdded } : {})}
                  {...(logic?.onRemoved ? { onRemoved: logic.onRemoved } : {})}
                  {...(logic?.onEdited ? { onEdited: logic.onEdited } : {})}
                  {...(logic?.onNudgeLag ? { onNudgeLag: logic.onNudgeLag } : {})}
                />
              ) : null}

              {/* Members — a WBS summary's contents. Rendered only for a `WBS_SUMMARY`, which is
                  also the only case the tab exists for, so the two conditions cannot disagree. It
                  is handed the plan's already-loaded activities rather than fetching its own: the
                  editor has them, the plan is bounded, and a second list here could disagree with
                  the one the Scheduling tab's parent picker shows. */}
              {current === 'members' ? (
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
              {current === 'resources' ? (
                <ActivityResourcesPanel
                  key={activity.id}
                  orgSlug={orgSlug}
                  planId={planId}
                  activityId={activity.id}
                  activityDurationType={activity.durationType}
                  // The join lag's day↔minute factor (ADR-0071 M4). Deliberately `joinLagFactor` — the
                  // SAVED calendar — and not the `hoursPerDay` the duration field uses: that one
                  // follows the Scheduling tab's pending selection, which is right for a duration
                  // saved alongside it and wrong for an assignment write that does not carry the
                  // calendar at all.
                  {...(joinLagFactor === undefined ? {} : { activityHoursPerDay: joinLagFactor })}
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
                  enabled={current === 'resources'}
                />
              ) : null}

              {/* Notes — the composition root's section, given a tab of its own so **Add note**
                  lands on it directly. Before this it opened the Logic dialog and then scrolled +
                  focused a section three panels down; the reveal plumbing that did so survives
                  untouched on the flag-off path, which still needs it. */}
              {current === 'notes' ? notesSlot : null}

              {/* The co-location (M4): three panels, three write scopes, each headed by what it
                  does to the schedule. Rendered only when a row exists — every panel writes. */}
              {current === 'progress' ? (
                <div className="flex flex-col gap-8">
                  <ReportedProgressPanel
                    form={progress.form}
                    isDirty={progress.isDirty}
                    hoursPerDay={hoursPerDay}
                    gate={gating.progress}
                    onSave={saveProgress}
                    pending={saves.progressPending}
                    saved={savedSlots.progress === true}
                    error={panelErrors.progress ?? null}
                  />
                  <ValueMeasurePanel
                    form={measure.form}
                    isDirty={measure.isDirty}
                    steps={stepsQuery.data ?? []}
                    gate={gating.measure}
                    onSave={saveMeasure}
                    pending={saves.fieldsPending}
                    saved={savedSlots.measure === true}
                    error={panelErrors.measure ?? null}
                  />
                  {/* The flag pair that decides whether weighted steps exist at all.
                      **It used to be described as matching "the Steps entry points" in
                      `ActivitiesTable` and `selection-actions`, and those are gone**
                      (`docs/specs/object-bar-defects/` M1) — both opened this tab, so the panel is
                      now reached only through `Progress`. The pair still belongs here for the
                      reason the security review gave: without it the tab would show a checklist the
                      product has no business offering. What changed is that this is now the ONLY
                      place the flags are read for steps, so there is no parity left to keep. */}
                  {ACTIVITY_STEPS_ENABLED && EARNED_VALUE_ENABLED ? (
                    <WeightedStepsPanel
                      form={stepsForm}
                      array={stepsArray}
                      isDirty={stepsDirty}
                      query={stepsQuery}
                      activity={activity}
                      gate={gating.steps}
                      onSave={saveSteps}
                      pending={saves.stepsPending}
                      saved={savedSlots.steps === true}
                      error={panelErrors.steps ?? null}
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
                    {EARNED_VALUE_ENABLED ? <ActivityExpenseFields form={cost.form} /> : null}
                    {COST_ACCRUAL_ENABLED ? <ActivityAccrualField form={cost.form} /> : null}
                    <ScopeSaveBar
                      gate={gating.cost}
                      dirty={cost.isDirty}
                      pending={saves.fieldsPending}
                      saved={savedSlots.cost === true}
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
        // The first sentence comes from the shared builder so this dialog and the navigation
        // guard cannot drift about what is dirty (ADR-0065's one-implementation argument). The
        // action clause stays here, because only this call site knows which action it confirms.
        description={`${describeUnsavedWork([unsavedReport])} Closing will discard them.`}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </>
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

/**
 * The marker for **Progress**, whose three panels have their own forms and their own Saves.
 *
 * Deliberately not {@link marker}: Progress can never be `locked` (the pen does not gate it,
 * ADR-0028 Q-C — a padlock would be false for exactly the reader it is meant to inform), and it has
 * no error COUNT to show, because each panel validates and reports its own problems at its own Save
 * rather than through one scope form. So the only marker it can honestly carry is the dot — which
 * is the whole of what `docs/TECH_DEBT.md` #63 was missing: switch to General with a changed
 * weighted step and the tab said nothing, while every other tab in the strip would have.
 *
 * It reads the three forms' own `isDirty`, which the session holds across tab switches, so the dot
 * can neither disappear while a draft exists nor outlive one (F4).
 */
function progressMarker(anyDirty: boolean): Pick<TabDescriptor<string>, 'marker'> {
  return anyDirty ? { marker: { kind: 'dot', label: 'unsaved changes' } satisfies TabMarker } : {};
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
