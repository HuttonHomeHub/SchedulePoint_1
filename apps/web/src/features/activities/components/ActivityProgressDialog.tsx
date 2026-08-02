import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useUpdateActivityProgress } from '../api/use-activities';
import { seedRemainingText } from '../model/remaining-field';
import {
  deriveStatusLabel,
  progressFormSchema,
  type ProgressFormValues,
} from '../schemas/activity-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { PROGRESS_INGESTION_ENABLED } from '@/config/env';

/**
 * Report an activity's progress (percent + actual dates). This is the
 * Contributor-capable editor — it never touches the definition or logic. The
 * status is derived by the API from these numbers, so it is shown here as a live,
 * read-only preview rather than an input. Saves PATCH the progress endpoint with
 * the row's `version`.
 */
export function ActivityProgressDialog({
  orgSlug,
  planId,
  open,
  onClose,
  activity,
}: {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
  /** The row being edited. Optional so the dialog stays mounted (toggled by
   * `open`), which preserves the native `<dialog>` close/focus-restore. */
  activity?: ActivitySummary;
}): React.ReactElement {
  const update = useUpdateActivityProgress(orgSlug, planId);
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ProgressFormValues>({
    resolver: zodResolver(progressFormSchema),
    defaultValues: {
      percentComplete: 0,
      actualStart: '',
      actualFinish: '',
      remaining: '',
      suspendDate: '',
      resumeDate: '',
    },
  });

  useEffect(() => {
    if (open && activity) {
      reset({
        percentComplete: activity.percentComplete,
        actualStart: activity.actualStart ?? '',
        actualFinish: activity.actualFinish ?? '',
        // Seed the M2 fields from the row even when the inputs are hidden (flag off), so an
        // edit round-trips a stored remaining/suspend/resume unchanged (ADR-0035). This dialog is
        // the ADR-0062 flag-off path and composes no calendar list, so the remaining field takes
        // its degraded whole-days shape — the same code path an unresolved calendar takes in the
        // tabbed editor, which is what keeps the two states from rotting apart (ADR-0070 §4).
        remaining: seedRemainingText(activity, undefined),
        suspendDate: activity.suspendDate ?? '',
        resumeDate: activity.resumeDate ?? '',
      });
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, activity?.id]);

  const percentComplete = useWatch({ control, name: 'percentComplete' });
  const actualStart = useWatch({ control, name: 'actualStart' });
  const actualFinish = useWatch({ control, name: 'actualFinish' });
  const preview = deriveStatusLabel({
    percentComplete: Number(percentComplete) || 0,
    actualStart,
    actualFinish,
  });

  const onSubmit = handleSubmit((values) => {
    if (!activity) return;
    update.mutate(
      { activityId: activity.id, version: activity.version, hoursPerDay: undefined, ...values },
      {
        onSuccess: (result) => {
          // Surface any server-side repairs (ADR-0035 §6) so a silent field override doesn't go
          // unnoticed — e.g. "the finish was set to the data date because the activity is complete".
          const warnings = result.meta?.warnings ?? [];
          const suffix = warnings.length > 0 ? ` ${warnings.map((w) => w.message).join(' ')}` : '';
          announce(`Progress for “${activity.name}” saved.${suffix}`);
          onClose();
        },
      },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report progress"
      {...(activity ? { description: `Update progress for “${activity.name}”.` } : {})}
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <FormErrorSummary errors={errors} />
        {update.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {update.error.message}
          </p>
        ) : null}
        <TextField
          label="Percent complete"
          type="number"
          min={0}
          max={100}
          error={errors.percentComplete?.message}
          {...register('percentComplete', { valueAsNumber: true })}
        />
        <TextField
          label="Actual start (optional)"
          type="date"
          error={errors.actualStart?.message}
          {...register('actualStart')}
        />
        <TextField
          label="Actual finish (optional)"
          type="date"
          error={errors.actualFinish?.message}
          {...register('actualFinish')}
        />
        {PROGRESS_INGESTION_ENABLED ? (
          <>
            <p className="text-muted-foreground border-border border-t pt-3 text-sm">
              These reschedule the remaining work on the next recalculation; they don’t change the
              status (that stays derived from percent complete and the actual dates).
            </p>
            {/* Whole days only here, deliberately: this is the flag-off path and it composes no
                calendar list, so there is no factor to read hours and minutes against. Blank
                clears the explicit remaining (null → the API derives it from percent). */}
            <TextField
              label="Remaining duration (days, optional)"
              type="number"
              min={0}
              max={10000}
              hint="Leave blank to derive it from percent complete."
              error={errors.remaining?.message}
              {...register('remaining')}
            />
            <TextField
              label="Suspend date (optional)"
              type="date"
              error={errors.suspendDate?.message}
              {...register('suspendDate')}
            />
            <TextField
              label="Resume date (optional)"
              type="date"
              hint="Remaining work resumes from here when it is after the data date."
              error={errors.resumeDate?.message}
              {...register('resumeDate')}
            />
          </>
        ) : null}
        <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
          Status (set automatically): <span className="text-foreground font-medium">{preview}</span>
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending} aria-busy={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save progress'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
