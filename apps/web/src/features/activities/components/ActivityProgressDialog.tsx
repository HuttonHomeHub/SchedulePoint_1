import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useUpdateActivityProgress } from '../api/use-activities';
import {
  deriveStatusLabel,
  progressFormSchema,
  type ProgressFormValues,
} from '../schemas/activity-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';

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
  activity: ActivitySummary;
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
    defaultValues: { percentComplete: 0, actualStart: '', actualFinish: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        percentComplete: activity.percentComplete,
        actualStart: activity.actualStart ?? '',
        actualFinish: activity.actualFinish ?? '',
      });
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, activity.id]);

  const percentComplete = useWatch({ control, name: 'percentComplete' });
  const actualStart = useWatch({ control, name: 'actualStart' });
  const actualFinish = useWatch({ control, name: 'actualFinish' });
  const preview = deriveStatusLabel({
    percentComplete: Number(percentComplete) || 0,
    actualStart,
    actualFinish,
  });

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      { activityId: activity.id, version: activity.version, ...values },
      {
        onSuccess: () => {
          announce(`Progress for “${activity.name}” saved.`);
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
      description={`Update progress for “${activity.name}”.`}
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
        <p className="text-muted-foreground text-sm">
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
