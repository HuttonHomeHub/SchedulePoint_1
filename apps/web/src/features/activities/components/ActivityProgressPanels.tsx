import type { ActivityStep, ActivitySummary } from '@repo/types';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useWatch, type UseFieldArrayReturn, type UseFormReturn } from 'react-hook-form';

import type { ScopeGate } from '../lib/activity-editor-gating';
import { durationInputProps } from '../model/duration-field';
import {
  REMAINING_NEEDS_WHOLE_DAYS,
  remainingHelp,
  remainingLabel,
  remainingWriteFields,
} from '../model/remaining-field';
import { deriveStatusLabel, type ProgressFormValues } from '../schemas/activity-schemas';
import type { ActivityMeasureValues } from '../schemas/activity-scope-schemas';
import { rollupPhysicalPercent, type StepsFormValues } from '../schemas/step-schemas';

import {
  ActivityMeasureFields,
  MEASURE_SECTION_DESCRIPTION,
  MEASURE_SECTION_TITLE,
} from './fields/ActivityMeasureFields';

import { Button } from '@/components/ui/button';
import { FieldGateProvider } from '@/components/ui/field-gate';
import { FormProblemCount, TextField } from '@/components/ui/form';
import { FieldGrid } from '@/components/ui/form-layout';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import { EARNED_VALUE_ENABLED, PROGRESS_INGESTION_ENABLED } from '@/config/env';

/**
 * The Progress tab's panels (ADR-0060 §4, M4) — the co-location this epic exists for.
 *
 * Progress was spread across four dialogs: the schedule %-complete that **moves the dates**, the
 * physical % that **earns value and moves nothing**, the weighted steps that silently **override**
 * that physical %, and the `% complete type` selector that chooses between measures — which sat in
 * a fifth place, the Edit dialog, away from every measure it selects.
 *
 * They are now one tab with three panels, each headed by **what it does to the schedule**, and each
 * with its own Save because each is a different write:
 *
 * | Panel | Endpoint | Gate |
 * | --- | --- | --- |
 * | Reported progress | `PATCH …/progress` | role only — **never** the pen (ADR-0028 Q-C) |
 * | How value is measured | `PATCH …/:id` | pen-gated |
 * | Weighted steps | `PUT …/steps` | pen-gated (ADR-0060 §5) |
 *
 * The three Save buttons are the honest consequence of that table, not clutter. A single Save would
 * have to pick one gate, and picking the pen would remove a Contributor's ability to report progress
 * while a Planner holds it.
 *
 * **Steps do not drive the schedule.** They roll up to the *physical* measure only (ADR-0044 §33),
 * which is P6-faithful and deliberately unchanged here — see ADR-0060's rejected alternatives.
 */

/**
 * **The panels render forms they do not own** (ADR-0169, `docs/specs/activity-editor-seeding` M4).
 *
 * Each panel is handed its form by `ActivityEditorSession`, which creates all three with the editor's
 * other scopes. The panels are mounted only while the Progress tab is showing, so a form made here
 * died on every tab switch while the editor's marker and close confirmation went on claiming it
 * (F4). Held by the session, a draft survives the visit elsewhere, and the session reads `isDirty`
 * itself — there is no copy of the flag to go stale. The panels keep what is about the DOM they
 * render: the markup, the derived figures, and the steps panel's focus choreography.
 */

/** Reported progress — the Contributor path. Moves the activity's dates. */
export function ReportedProgressPanel({
  form,
  isDirty,
  hoursPerDay,
  gate,
  onSave,
  pending,
  saved,
  error,
}: {
  form: UseFormReturn<ProgressFormValues>;
  isDirty: boolean;
  /**
   * The activity's effective working hours per day, or `undefined` when the calendar list has not
   * resolved. Required rather than defaulted (ADR-0070 §3) — after ADR-0068 there is no safe
   * default, and the remaining field degrades to whole days rather than guessing one.
   */
  hoursPerDay: number | undefined;
  gate: ScopeGate;
  /** Saves through the host, which owns the mutation (ADR-0169 D-10) and marks the form clean. */
  onSave: (values: ProgressFormValues) => void;
  pending: boolean;
  saved: boolean;
  /** The last save's failure, held by the host so it cannot outlive the opening. */
  error: string | null;
}): React.ReactElement {
  const values = useWatch({ control: form.control }) as ProgressFormValues;

  // `version` is read from the live row by the host at submit time, not captured on open — a sibling
  // scope's save bumps it, and a stale one would 409 every time after the first.
  const onSubmit = form.handleSubmit(onSave);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(event);
      }}
      className="flex flex-col gap-4"
    >
      <FieldGateProvider gate={gate}>
        <PanelHeading title="Reported progress" effect="Moves the activity’s dates." />
        <FormProblemCount errors={form.formState.errors} />
        {error ? (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        ) : null}
        {/* Two decisions, two groups: how far along it is, and when it actually happened. Flat, the
          six controls read as one undifferentiated list of numbers and dates. */}
        <FieldGrid>
          <TextField
            label="Percent complete"
            type="number"
            min={0}
            max={100}
            error={form.formState.errors.percentComplete?.message}
            {...form.register('percentComplete', { valueAsNumber: true })}
          />
          {PROGRESS_INGESTION_ENABLED ? (
            <TextField
              label={remainingLabel(hoursPerDay)}
              {...durationInputProps(hoursPerDay)}
              hint={remainingHelp(hoursPerDay)}
              error={
                form.formState.errors.remaining?.message ??
                (remainingWriteFields(values.remaining ?? '', hoursPerDay) === null
                  ? REMAINING_NEEDS_WHOLE_DAYS
                  : undefined)
              }
              {...form.register('remaining')}
            />
          ) : null}
          <TextField label="Actual start" type="date" {...form.register('actualStart')} />
          <TextField
            label="Actual finish"
            type="date"
            error={form.formState.errors.actualFinish?.message}
            {...form.register('actualFinish')}
          />
          {PROGRESS_INGESTION_ENABLED ? (
            <>
              {/* Suspend is a RECORD, resume is the schedule input, and the two look identical
                sitting side by side — so each says which it is (surface audit F1, ADR-0035 §4).
                Only the resume date reaches the engine: it floors the remaining work at
                `max(data date, resume date)`. The suspend date is stored, shown and exported, and
                the recalculation does not read it. Saying so here is the whole fix: a planner who
                sets a suspend date and sees no dates move should be able to find out why from the
                field rather than from the source. */}
              <TextField
                label="Suspend date"
                type="date"
                hint="Recorded only — it does not move any dates."
                {...form.register('suspendDate')}
              />
              <TextField
                label="Resume date"
                type="date"
                hint="Remaining work is scheduled from this date, or the data date if later."
                error={form.formState.errors.resumeDate?.message}
                {...form.register('resumeDate')}
              />
            </>
          ) : null}
        </FieldGrid>
        {/* The consequence of the six fields above, given the same weight as a field rather than
          trailing off as a sentence — it is the answer to "what did I just say happened?". */}
        <div className="bg-muted flex items-center justify-between gap-3 rounded-md px-3 py-2">
          <span className="text-muted-foreground text-sm">Resulting status</span>
          <strong className="text-sm font-semibold">{deriveStatusLabel(values)}</strong>
        </div>
        <ScopeSaveBar
          gate={gate}
          dirty={isDirty}
          pending={pending}
          saved={saved}
          label="Save progress"
        />
      </FieldGateProvider>
    </form>
  );
}

/** How value is measured — the EV source and its manual physical %. Earns value, moves no date. */
export function ValueMeasurePanel({
  form,
  isDirty,
  steps,
  gate,
  onSave,
  onOpenResources,
  pending,
  saved = false,
  error = null,
}: {
  form: UseFormReturn<ActivityMeasureValues>;
  isDirty: boolean;
  /**
   * The activity's steps, which the session fetches once for the whole tab: they decide whether the
   * manual physical % is shaded (steps win), and this panel must not own a second copy of the query.
   */
  steps: readonly ActivityStep[];
  gate: ScopeGate;
  /** Saves through the host, which owns the mutation (ADR-0169 D-10) and marks the form clean. */
  onSave: (values: ActivityMeasureValues) => void;
  onOpenResources?: () => void;
  pending: boolean;
  /** This panel saves through the host (it shares the activity PATCH), so the host owns the flag. */
  saved?: boolean;
  /** The last save's failure, held by the host so it cannot outlive the opening. */
  error?: string | null;
}): React.ReactElement {
  const measure = useWatch({ control: form.control, name: 'percentCompleteType' });
  const manual = useWatch({ control: form.control, name: 'physicalPercentComplete' });

  const stepRows = steps;
  const rolled = rollupPhysicalPercent(
    stepRows.map((s) => ({ weight: Number(s.weight), percentComplete: s.percentComplete })),
    manual ?? null,
  );
  // Steps WIN whenever their weights sum above zero (ADR-0044 §33 / N27). Until now the manual
  // field stayed editable and was silently ignored — the defect that started this epic.
  const stepsWin =
    stepRows.length > 0 &&
    stepRows.reduce((sum, s) => sum + Number(s.weight), 0) > 0 &&
    rolled !== null;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(onSave)(event);
      }}
      className="flex flex-col gap-4"
    >
      <FieldGateProvider gate={gate}>
        <PanelHeading title={MEASURE_SECTION_TITLE} effect={MEASURE_SECTION_DESCRIPTION} />
        <FormProblemCount errors={form.formState.errors} />
        {error ? (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        ) : null}
        {EARNED_VALUE_ENABLED ? (
          <>
            {/* The chooser and the value it governs, side by side — the pairing that makes "steps are
              overriding this" legible at a glance instead of two rows apart. */}
            <ActivityMeasureFields
              form={form}
              {...(stepsWin
                ? {
                    physicalGate: {
                      writable: false,
                      reason: `Weighted steps are setting this to ${Math.round(rolled)}%. Clear the steps to enter a value by hand.`,
                    },
                  }
                : {})}
            />

            {measure === 'UNITS' ? (
              <p className="text-muted-foreground text-sm">
                Units come from resource assignments.{' '}
                {onOpenResources ? (
                  <Button type="button" variant="ghost" onClick={onOpenResources}>
                    Open Resources to change them
                  </Button>
                ) : (
                  'Open Resources to change them.'
                )}
              </p>
            ) : null}

            {stepsWin ? (
              <p className="text-muted-foreground text-sm">
                From weighted steps:{' '}
                <strong className="text-foreground">{Math.round(rolled)}%</strong>
              </p>
            ) : null}
          </>
        ) : null}
        <ScopeSaveBar
          gate={gate}
          dirty={isDirty}
          pending={pending}
          saved={saved}
          label="Save measure"
        />
      </FieldGateProvider>
    </form>
  );
}

/** A blank list starts empty; append adds equally-weighted rows so a first save is a plain average. */
const NEW_STEP = { name: '', weight: 1, percentComplete: 0 } as const;

/** The rolled-up physical % as a display string: an em dash when unresolved (no steps + unset manual %). */
function formatRollup(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

/**
 * Weighted steps — the checklist that rolls up to the physical %. Pen-gated (ADR-0060 §5, M0), which
 * is what both web hosts already assumed and what the server now agrees with.
 *
 * Ported from `ActivityStepsDialog` with its focus choreography intact, because that choreography is
 * the only thing standing between a keyboard user and a dropped focus on every add, remove and move.
 * Two things changed in the port, both deliberate:
 *
 * 1. **Reordering restores focus.** A `move` re-keys the rows, so the DOM node — and with it the
 *    focus — follows the step, which is right. But the button it lands on becomes *disabled* at
 *    either end of the list, dropping focus to `<body>` exactly when a keyboard user is walking a
 *    step to the top. Focus now falls through to the row's other move button.
 * 2. **The gate is honoured on every control**, not just Save: editing rows you cannot save is the
 *    lit-but-inert dead end this epic exists to remove.
 */
export function WeightedStepsPanel({
  form,
  array,
  isDirty,
  query,
  activity,
  gate,
  onSave,
  pending,
  saved,
  error,
  announce,
  autoFocusHeading = false,
}: {
  form: UseFormReturn<StepsFormValues>;
  /** The session's `useFieldArray`: the rows are its state, so a draft outlives this panel. */
  array: UseFieldArrayReturn<StepsFormValues, 'steps'>;
  isDirty: boolean;
  /** The session's steps query, reduced to what this panel renders. */
  query: { isError: boolean; isPending: boolean; refetch: () => unknown };
  activity: ActivitySummary;
  gate: ScopeGate;
  /** Saves through the host, which owns the mutation (ADR-0169 D-10) and re-seeds from the saved list. */
  onSave: (steps: StepsFormValues['steps']) => void;
  pending: boolean;
  saved: boolean;
  /** The last save's failure, held by the host so it cannot outlive the opening. */
  error: string | null;
  announce: (message: string) => void;
  /** The **Steps** entry point opened the editor: move focus here rather than the tab's top. */
  autoFocusHeading?: boolean;
  /**
   * NOTE: `isDirty` comes from the session's own `useForm` + `useFieldArray`, not `useScopeForm`,
   * so a `move()` re-keys the rows and can mark it dirty even if the planner restores the order.
   * Accepted rather than fixed: the cost of that false positive is one extra confirmation dialog,
   * and the cost of chasing it is comparing arrays on every keystroke.
   */
}): React.ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // After the frame, not at mount: this panel mounts in the same commit that opens the dialog, and
  // child effects run before `Dialog`'s `showModal()` effect — so a synchronous `focus()` here lands
  // on an element of a dialog that is not yet showing and does nothing. A frame later it is.
  useEffect(() => {
    if (!autoFocusHeading) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocusHeading, activity.id]);

  // A `useFieldArray` mutation re-renders, so the new/previous DOM only exists after the next commit.
  // A no-dep LAYOUT effect runs in every commit and drains a one-shot callback. Not a passive effect:
  // React flushes the previous commit's pending passive effects before it renders a new update, and
  // that flush runs after the click handler has set the callback — so it drained against the OLD DOM
  // and dropped focus to <body> whenever a click followed a commit closely (observed in the editor's
  // "focuses the new row's name field on add" test once the steps mutation left this component).
  const listRef = useRef<HTMLUListElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      pendingFocus.current();
      pendingFocus.current = null;
    }
  });

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;
  const { fields, append, remove, move } = array;

  // The same weighted mean the server computes, so the planner sees the figure before saving.
  const watchedSteps = useWatch({ control, name: 'steps' });
  const rollup = rollupPhysicalPercent(
    (watchedSteps ?? []).map((step) => ({
      weight: Number.isFinite(step?.weight) ? step.weight : 0,
      percentComplete: Number.isFinite(step?.percentComplete) ? step.percentComplete : 0,
    })),
    activity.physicalPercentComplete ?? null,
  );

  // The host reads the version from the live row at submit time, like every other scope.
  const onSubmit = handleSubmit((values) => onSave(values.steps));

  const rowAt = (index: number): Element | undefined =>
    listRef.current?.querySelectorAll(':scope > li')[index];

  // Focus the new row's name input — otherwise focus stays on "Add step" below the list and a
  // keyboard user never lands in the field they just created.
  const addStep = (): void => {
    append({ ...NEW_STEP });
    pendingFocus.current = () => {
      rowAt(fields.length)?.querySelector<HTMLInputElement>('input')?.focus();
    };
    announce('Step added.');
  };

  // Restore focus to the previous row's Remove button (or "Add step" when the first row went) —
  // the removed control would otherwise drop focus to <body>. Earlier rows keep their index after a
  // later removal, so `index - 1` is still the previous row post-commit.
  const removeStep = (index: number): void => {
    remove(index);
    pendingFocus.current = () => {
      const button =
        index > 0 ? rowAt(index - 1)?.querySelector<HTMLButtonElement>('[data-step-remove]') : null;
      (button ?? addButtonRef.current)?.focus();
    };
    announce('Step removed.');
  };

  const moveStep = (index: number, delta: -1 | 1): void => {
    const target = index + delta;
    move(index, target);
    pendingFocus.current = () => {
      const row = rowAt(target);
      if (!row) return;
      const [wanted, fallback] =
        delta === -1
          ? ['[data-step-up]', '[data-step-down]']
          : ['[data-step-down]', '[data-step-up]'];
      const preferred = row.querySelector<HTMLButtonElement>(wanted);
      // At either end of the list the button just pressed is now disabled; fall through to its
      // sibling rather than letting focus land on <body>.
      (preferred && !preferred.disabled
        ? preferred
        : row.querySelector<HTMLButtonElement>(fallback)
      )?.focus();
    };
    announce(`Step moved to position ${target + 1} of ${fields.length}.`);
  };

  return (
    <section className="flex flex-col gap-4">
      <PanelHeading
        title="Weighted steps"
        effect="Sets the physical % complete. Changes no dates."
        headingRef={headingRef}
      />

      {/* aria-live on the container, not the value, so AT hears the label with the figure —
          "Physical % complete (rolled up) 75%", not a bare "75%". */}
      <div
        aria-live="polite"
        className="border-border bg-muted/30 flex items-baseline justify-between gap-4 rounded-md border p-3"
      >
        <span className="text-sm font-medium">Physical % complete (rolled up)</span>
        <span className="text-lg font-semibold tabular-nums">{formatRollup(rollup)}</span>
      </div>

      {query.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            Couldn’t load steps.
          </p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.isPending ? (
        <p className="text-muted-foreground text-sm">Loading steps…</p>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(event);
          }}
          className="flex flex-col gap-4"
        >
          <FieldGateProvider gate={gate}>
            <FormProblemCount errors={errors} />
            {error ? (
              <p role="alert" className="text-destructive-text text-sm">
                {error}
              </p>
            ) : null}

            {fields.length === 0 ? (
              <NoticeStrip
                emphasis="dashed"
                density="comfortable"
                messageFit="grow"
                message="No steps yet. Add a step to build a weighted checklist; until then the physical % complete is whatever is typed above."
              />
            ) : (
              <ul ref={listRef} className="flex flex-col gap-3">
                {fields.map((field, index) => {
                  const rowErrors = errors.steps?.[index];
                  return (
                    <li
                      key={field.id}
                      className="border-border flex flex-col gap-3 rounded-md border p-3"
                    >
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-48 flex-1">
                          <TextField
                            label={`Step ${index + 1} name`}
                            error={rowErrors?.name?.message}
                            {...register(`steps.${index}.name`)}
                          />
                        </div>
                        <div className="w-28">
                          <TextField
                            label={`Step ${index + 1} weight`}
                            type="number"
                            min={0}
                            step="any"
                            error={rowErrors?.weight?.message}
                            {...register(`steps.${index}.weight`, { valueAsNumber: true })}
                          />
                        </div>
                        <div className="w-28">
                          <TextField
                            label={`Step ${index + 1} % complete`}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            error={rowErrors?.percentComplete?.message}
                            {...register(`steps.${index}.percentComplete`, { valueAsNumber: true })}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-step-up=""
                          disabled={!gate.writable || index === 0}
                          aria-label={`Move up, step ${index + 1}`}
                          onClick={() => moveStep(index, -1)}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-step-down=""
                          disabled={!gate.writable || index === fields.length - 1}
                          aria-label={`Move down, step ${index + 1}`}
                          onClick={() => moveStep(index, 1)}
                        >
                          Move down
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          data-step-remove=""
                          disabled={!gate.writable}
                          aria-label={`Remove step ${index + 1}`}
                          onClick={() => removeStep(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                ref={addButtonRef}
                type="button"
                variant="outline"
                disabled={!gate.writable}
                onClick={addStep}
              >
                Add step
              </Button>
            </div>

            {/* `saved` is what makes a successful save visible: without it the helper text goes from
              "Unsaved changes in this section." to blank and the button greys — pixel-identical to a
              panel nobody has touched. The mutation's own success flag is the honest source, and
              editing again re-dirties the form, which takes precedence in the bar. */}
            <ScopeSaveBar
              gate={gate}
              dirty={isDirty}
              pending={pending}
              saved={saved}
              label="Save steps"
            />
          </FieldGateProvider>
        </form>
      )}
    </section>
  );
}

function PanelHeading({
  title,
  effect,
  headingRef,
}: {
  title: string;
  effect: string;
  /** Present when an entry point lands focus on this panel — hence `tabIndex={-1}`, never in the tab
   * sequence, only programmatically focusable (the app-shell heading-focus precedent). */
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <h3
        ref={headingRef}
        {...(headingRef ? { tabIndex: -1 } : {})}
        className="text-sm font-semibold outline-none"
      >
        {title}
      </h3>
      {/* The effect line is the whole point of the co-location: two measures that look alike do
          different things, and the heading says which. */}
      <p className="text-muted-foreground text-sm">{effect}</p>
    </div>
  );
}
