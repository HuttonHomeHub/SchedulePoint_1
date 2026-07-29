import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { measureBody } from '../api/scope-bodies';
import { useUpdateActivityProgress } from '../api/use-activities';
import { useActivitySteps, useReplaceActivitySteps } from '../api/use-activity-steps';
import type { ScopeGate } from '../lib/activity-editor-gating';
import {
  PERCENT_COMPLETE_TYPE_LABELS,
  PERCENT_COMPLETE_TYPE_OPTIONS,
  deriveStatusLabel,
  progressFormSchema,
  type ProgressFormValues,
} from '../schemas/activity-schemas';
import { activityMeasureSchema } from '../schemas/activity-scope-schemas';
import {
  rollupPhysicalPercent,
  stepsFormSchema,
  type StepsFormValues,
} from '../schemas/step-schemas';

import { seedMeasure } from './activity-editor-seeds';
import { ScopeSaveBar } from './ScopeSaveBar';
import { useScopeForm } from './useScopeForm';

import { Button } from '@/components/ui/button';
import { FormErrorSummary, SelectField, TextField } from '@/components/ui/form';
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

/** Reported progress — the Contributor path. Moves the activity's dates. */
export function ReportedProgressPanel({
  orgSlug,
  planId,
  activity,
  gate,
  open,
  announce,
}: {
  orgSlug: string;
  planId: string;
  activity: ActivitySummary;
  gate: ScopeGate;
  open: boolean;
  announce: (message: string) => void;
}): React.ReactElement {
  const mutation = useUpdateActivityProgress(orgSlug, planId);
  const { form, isDirty } = useScopeForm<ProgressFormValues>(
    progressFormSchema,
    (row) => ({
      percentComplete: row?.percentComplete ?? 0,
      actualStart: row?.actualStart ?? '',
      actualFinish: row?.actualFinish ?? '',
      ...(row?.remainingDurationDays === null || row?.remainingDurationDays === undefined
        ? {}
        : { remainingDurationDays: row.remainingDurationDays }),
      suspendDate: row?.suspendDate ?? '',
      resumeDate: row?.resumeDate ?? '',
    }),
    activity,
    open,
  );

  const values = useWatch({ control: form.control }) as ProgressFormValues;

  const onSubmit = form.handleSubmit((submitted) => {
    mutation.mutate(
      // `version` is read from the live row at submit time, not captured on open — a sibling
      // scope's save bumps it, and a stale one would 409 every time after the first.
      { activityId: activity.id, version: activity.version, ...submitted },
      {
        onSuccess: (result) => {
          form.reset(submitted);
          // The server reports the repairs it applied to keep the report self-consistent
          // (ADR-0035 §6). Dropping them in the port would hide a silent correction.
          const warnings = result.meta?.warnings ?? [];
          announce(
            warnings.length > 0
              ? `Progress saved with ${warnings.length} adjustment${warnings.length === 1 ? '' : 's'}.`
              : 'Progress saved.',
          );
        },
      },
    );
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(event);
      }}
      className="flex flex-col gap-4"
    >
      <PanelHeading title="Reported progress" effect="Moves the activity’s dates." />
      <FormErrorSummary errors={form.formState.errors} />
      {mutation.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {mutation.error.message}
        </p>
      ) : null}
      <TextField
        label="Percent complete"
        type="number"
        min={0}
        max={100}
        disabled={!gate.writable}
        error={form.formState.errors.percentComplete?.message}
        {...form.register('percentComplete', { valueAsNumber: true })}
      />
      <TextField
        label="Actual start"
        type="date"
        disabled={!gate.writable}
        {...form.register('actualStart')}
      />
      <TextField
        label="Actual finish"
        type="date"
        disabled={!gate.writable}
        error={form.formState.errors.actualFinish?.message}
        {...form.register('actualFinish')}
      />
      {PROGRESS_INGESTION_ENABLED ? (
        <>
          <TextField
            label="Remaining duration (days)"
            type="number"
            min={0}
            hint="Leave blank to derive the remaining work from the percent complete."
            disabled={!gate.writable}
            error={form.formState.errors.remainingDurationDays?.message}
            {...form.register('remainingDurationDays', {
              setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
            })}
          />
          <TextField
            label="Suspend date"
            type="date"
            disabled={!gate.writable}
            {...form.register('suspendDate')}
          />
          <TextField
            label="Resume date"
            type="date"
            disabled={!gate.writable}
            error={form.formState.errors.resumeDate?.message}
            {...form.register('resumeDate')}
          />
        </>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Resulting status: <strong className="text-foreground">{deriveStatusLabel(values)}</strong>
      </p>
      <ScopeSaveBar
        gate={gate}
        dirty={isDirty}
        pending={mutation.isPending}
        saved={mutation.isSuccess}
        label="Save progress"
      />
    </form>
  );
}

/** How value is measured — the EV source and its manual physical %. Earns value, moves no date. */
export function ValueMeasurePanel({
  orgSlug,
  activity,
  gate,
  open,
  onSave,
  onOpenResources,
  pending,
  saved = false,
}: {
  orgSlug: string;
  activity: ActivitySummary;
  gate: ScopeGate;
  open: boolean;
  onSave: (patch: Record<string, unknown>, reset: () => void) => void;
  onOpenResources?: () => void;
  pending: boolean;
  /** This panel saves through the host (it shares the activity PATCH), so the host owns the flag. */
  saved?: boolean;
}): React.ReactElement {
  const { form, isDirty } = useScopeForm(activityMeasureSchema, seedMeasure, activity, open);
  const steps = useActivitySteps(orgSlug, activity.id);
  const measure = useWatch({ control: form.control, name: 'percentCompleteType' });
  const manual = useWatch({ control: form.control, name: 'physicalPercentComplete' });

  const stepRows = steps.data ?? [];
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
        // The body comes from the shared builder, never a literal here — `scope-bodies.ts` is where
        // "this scope's keys and no other's" is stated once and pinned by test. A hand-rolled copy
        // beside it is two implementations of one mapping, with nothing keeping them equal.
        void form.handleSubmit((values) => onSave(measureBody(values), () => form.reset(values)))(
          event,
        );
      }}
      className="flex flex-col gap-4"
    >
      <PanelHeading
        title="How value is measured"
        effect="Earns value in Earned Value. Changes no dates."
      />
      <FormErrorSummary errors={form.formState.errors} />
      {EARNED_VALUE_ENABLED ? (
        <>
          <SelectField
            label="Earn value from"
            hint={PERCENT_COMPLETE_TYPE_LABELS[measure].description}
            disabled={!gate.writable}
            {...form.register('percentCompleteType')}
          >
            {PERCENT_COMPLETE_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {PERCENT_COMPLETE_TYPE_LABELS[value].label}
              </option>
            ))}
          </SelectField>

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

          <TextField
            label="Physical % complete"
            type="number"
            min={0}
            max={100}
            // The reason, never a bare "Read-only" — a disabled control that does not say what
            // would re-enable it is the dead end this epic set out to remove.
            hint={
              stepsWin
                ? `Weighted steps are setting this to ${Math.round(rolled)}%. Clear the steps to enter a value by hand.`
                : 'The hand-entered physical progress that earns value when the measure is Physical.'
            }
            disabled={!gate.writable || stepsWin}
            error={form.formState.errors.physicalPercentComplete?.message}
            {...form.register('physicalPercentComplete', {
              setValueAs: (v: string) => (v === '' ? undefined : Number(v)),
            })}
          />
        </>
      ) : null}
      <ScopeSaveBar
        gate={gate}
        dirty={isDirty}
        pending={pending}
        saved={saved}
        label="Save measure"
      />
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
  orgSlug,
  planId,
  activity,
  gate,
  open,
  announce,
  autoFocusHeading = false,
}: {
  orgSlug: string;
  planId: string;
  activity: ActivitySummary;
  gate: ScopeGate;
  open: boolean;
  announce: (message: string) => void;
  /** The **Steps** entry point opened the editor: move focus here rather than the tab's top. */
  autoFocusHeading?: boolean;
}): React.ReactElement {
  const steps = useActivitySteps(orgSlug, activity.id);
  const replace = useReplaceActivitySteps(orgSlug, planId, activity.id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open && autoFocusHeading) headingRef.current?.focus();
  }, [open, autoFocusHeading, activity.id]);

  // A `useFieldArray` mutation re-renders, so the new/previous DOM only exists on the next paint.
  // A no-dep effect runs after every commit and drains a one-shot callback.
  const listRef = useRef<HTMLUListElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (pendingFocus.current) {
      pendingFocus.current();
      pendingFocus.current = null;
    }
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<StepsFormValues>({
    resolver: zodResolver(stepsFormSchema),
    defaultValues: { steps: [] },
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'steps' });

  // Seeded on open / target / load change — a late-arriving fetch still populates. Unlike the
  // definition scopes (see `useScopeForm`'s trap 2) the steps list is its own query, so keying on the
  // loaded rows cannot be tripped by a sibling scope's save refetching the activity.
  const loadedSteps = steps.data;
  useEffect(() => {
    if (!open) return;
    reset({
      steps: (loadedSteps ?? []).map((step) => ({
        name: step.name,
        weight: step.weight,
        percentComplete: step.percentComplete,
      })),
    });
    replace.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open / target / load change
  }, [open, activity.id, loadedSteps]);

  // The same weighted mean the server computes, so the planner sees the figure before saving.
  const watchedSteps = useWatch({ control, name: 'steps' });
  const rollup = rollupPhysicalPercent(
    (watchedSteps ?? []).map((step) => ({
      weight: Number.isFinite(step?.weight) ? step.weight : 0,
      percentComplete: Number.isFinite(step?.percentComplete) ? step.percentComplete : 0,
    })),
    activity.physicalPercentComplete ?? null,
  );

  const onSubmit = handleSubmit((values) => {
    replace.mutate(
      // Read from the live row at submit time, like every other scope — a sibling save bumps it.
      { version: activity.version, steps: values.steps },
      {
        onSuccess: (saved) => {
          reset({ steps: saved.map((s) => ({ ...s })) });
          announce('Steps saved.');
        },
      },
    );
  });

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

      {steps.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            Couldn’t load steps.
          </p>
          <Button variant="outline" size="sm" onClick={() => void steps.refetch()}>
            Try again
          </Button>
        </div>
      ) : steps.isPending ? (
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
          <FormErrorSummary errors={errors} />
          {replace.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {replace.error.message}
            </p>
          ) : null}

          {fields.length === 0 ? (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              No steps yet. Add a step to build a weighted checklist; until then the physical %
              complete is whatever is typed above.
            </div>
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
                          disabled={!gate.writable}
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
                          disabled={!gate.writable}
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
                          disabled={!gate.writable}
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

          <ScopeSaveBar
            gate={gate}
            dirty={isDirty}
            pending={replace.isPending}
            label="Save steps"
          />
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
