import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { useActivitySteps, useReplaceActivitySteps } from '../api/use-activity-steps';
import {
  rollupPhysicalPercent,
  stepsFormSchema,
  type StepsFormValues,
} from '../schemas/step-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';

/** A blank list starts one empty row so a planner has somewhere to type; append adds equally-weighted rows. */
const NEW_STEP = { name: '', weight: 1, percentComplete: 0 } as const;

/** The rolled-up physical % as a display string: an em dash when unresolved (no steps + unset manual %). */
function formatRollup(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

/**
 * Per-activity **weighted steps** editor (M7 rung 5, ADR-0044 §2 / ADR-0035 §33), opened from the
 * activities row menu behind `VITE_ACTIVITY_STEPS`. Edits the activity's progress checklist as an
 * ordered list of steps — each a name, a relative weight, and its own % complete — with add / remove /
 * reorder, saved in one bulk `PUT …/activities/:activityId/steps` that carries the parent activity's
 * optimistic-lock version. A live, client-side preview shows the rolled-up physical % (the weighted
 * mean the server's `rollupPhysicalPercent` resolver computes), and a note makes clear that steps
 * override the manual physical % once any are present. Every query renders its loading / error state.
 */
export function ActivityStepsDialog({
  orgSlug,
  planId,
  activity,
  open,
  onClose,
}: {
  orgSlug: string;
  planId: string;
  /** Optional so the dialog can stay mounted (toggled by `open`), preserving focus restore. */
  activity?: ActivitySummary;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const activityId = activity?.id ?? '';
  const steps = useActivitySteps(orgSlug, activityId);
  const replace = useReplaceActivitySteps(orgSlug, planId, activityId);
  const announce = useAnnounce();

  // Focus management for the field array (a11y review): the "Add step" button sits below the list, so
  // after an add/remove the natural focus point isn't reachable without tabbing back up. We move focus
  // explicitly after the commit — a `useFieldArray` mutation re-renders, so the new/prev DOM only
  // exists on the next paint. A no-dep effect runs after every commit and drains a one-shot callback.
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
    formState: { errors },
  } = useForm<StepsFormValues>({
    resolver: zodResolver(stepsFormSchema),
    defaultValues: { steps: [] },
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'steps' });

  // Seed the field array from the persisted steps whenever the dialog opens on an activity (or its
  // step list finishes loading). Keyed on open + activityId + the loaded rows so a late-arriving fetch
  // still populates. The manual physical % is the fallback the rollup preview falls back to.
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
  }, [open, activityId, loadedSteps]);

  // Live values drive the rolled-up % preview — the same weighted mean the server computes, so the
  // planner sees the figure before saving. Falls back to the manual physical % when weights sum ≤ 0.
  const watchedSteps = useWatch({ control, name: 'steps' });
  const currentSteps = watchedSteps ?? [];
  const rollup = rollupPhysicalPercent(
    currentSteps.map((step) => ({
      weight: Number.isFinite(step?.weight) ? step.weight : 0,
      percentComplete: Number.isFinite(step?.percentComplete) ? step.percentComplete : 0,
    })),
    activity?.physicalPercentComplete ?? null,
  );
  const hasSteps = fields.length > 0;

  const onSubmit = handleSubmit((values) => {
    if (!activity) return;
    replace.mutate(
      { version: activity.version, steps: values.steps },
      { onSuccess: () => announce(`Steps for “${activity.name}” saved.`) },
    );
  });

  // Append a row, then focus its name input and announce it (a11y review) — otherwise focus stays on
  // the "Add step" button below the list and a keyboard user never lands in the field they just added.
  const addStep = (): void => {
    append({ ...NEW_STEP });
    pendingFocus.current = () => {
      const rows = listRef.current?.querySelectorAll(':scope > li');
      const last = rows?.[rows.length - 1];
      last?.querySelector<HTMLInputElement>('input')?.focus();
    };
    announce('Step added.');
  };

  // Remove a row, then restore focus to the previous row's Remove button (or the "Add step" button when
  // the first/last row was removed), and announce it — the removed control would otherwise drop focus
  // to <body> (a11y review). Earlier rows keep their index after a later removal, so `index - 1` is
  // still the previous row post-commit.
  const removeStep = (index: number): void => {
    remove(index);
    pendingFocus.current = () => {
      if (index > 0) {
        const rows = listRef.current?.querySelectorAll(':scope > li');
        const prev = rows?.[index - 1];
        const button = prev?.querySelector<HTMLButtonElement>('[data-step-remove]');
        (button ?? addButtonRef.current)?.focus();
      } else {
        addButtonRef.current?.focus();
      }
    };
    announce('Step removed.');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Steps"
      {...(activity ? { description: `Weighted progress steps for “${activity.name}”.` } : {})}
    >
      <div className="flex flex-col gap-6">
        {/* aria-live on the whole container (not just the value) so AT hears the label with the value —
            "Physical % complete (rolled up) 75%", not a bare "75%" (a11y review). */}
        <div
          aria-live="polite"
          className="border-border bg-muted/30 flex items-baseline justify-between gap-4 rounded-md border p-3"
        >
          <span className="text-sm font-medium">Physical % complete (rolled up)</span>
          <span className="text-lg font-semibold tabular-nums">{formatRollup(rollup)}</span>
        </div>
        {hasSteps ? (
          <p className="text-muted-foreground text-sm">
            Steps override the manual physical % complete.
          </p>
        ) : null}

        {steps.isError ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-destructive-text text-sm">
              Couldn’t load steps.
            </p>
            <Button variant="outline" size="sm" onClick={() => void steps.refetch()}>
              Try again
            </Button>
          </div>
        ) : steps.isPending && activityId ? (
          <p className="text-muted-foreground text-sm">Loading steps…</p>
        ) : (
          <form
            noValidate
            onSubmit={(event) => void onSubmit(event)}
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
                No steps yet. Add the first step to build a weighted progress checklist.
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
                          disabled={index === 0}
                          aria-label={`Move step ${index + 1} up`}
                          onClick={() => move(index, index - 1)}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={index === fields.length - 1}
                          aria-label={`Move step ${index + 1} down`}
                          onClick={() => move(index, index + 1)}
                        >
                          Move down
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          data-step-remove=""
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
              <Button ref={addButtonRef} type="button" variant="outline" onClick={addStep}>
                Add step
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button type="submit" disabled={replace.isPending} aria-busy={replace.isPending}>
                  {replace.isPending ? 'Saving…' : 'Save steps'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
