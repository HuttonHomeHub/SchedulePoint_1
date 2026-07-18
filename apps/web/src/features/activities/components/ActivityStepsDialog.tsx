import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useEffect, useId } from 'react';
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
  const rollupId = useId();

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Steps"
      {...(activity ? { description: `Weighted progress steps for “${activity.name}”.` } : {})}
    >
      <div className="flex flex-col gap-6">
        <div
          id={rollupId}
          className="border-border bg-muted/30 flex items-baseline justify-between gap-4 rounded-md border p-3"
        >
          <span className="text-sm font-medium">Physical % complete (rolled up)</span>
          <span className="text-lg font-semibold tabular-nums" aria-live="polite">
            {formatRollup(rollup)}
          </span>
        </div>
        {hasSteps ? (
          <p className="text-muted-foreground text-sm">
            Steps override the manual physical % complete.
          </p>
        ) : null}

        {steps.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            Couldn’t load steps. Please try again.
          </p>
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
              <ul className="flex flex-col gap-3">
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
                          aria-label={`Remove step ${index + 1}`}
                          onClick={() => remove(index)}
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
                type="button"
                variant="outline"
                onClick={() => append({ ...NEW_STEP })}
                aria-describedby={rollupId}
              >
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
