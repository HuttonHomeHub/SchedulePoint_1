import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useCaptureBaseline } from '../api/use-baselines';
import {
  captureBaselineSchema,
  captureErrorMessage,
  type CaptureBaselineValues,
} from '../schemas/baseline-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';

/**
 * Capture-a-baseline dialog. The only field is the name; the snapshot is frozen
 * server-side from the plan's current computed schedule (ADR-0025). A duplicate name
 * (409) and a never-calculated plan (422 `SCHEDULE_NOT_CALCULATED`) surface as friendly
 * inline messages with a "recalculate first" hint.
 */
export function CreateBaselineDialog({
  orgSlug,
  planId,
  open,
  onClose,
}: {
  orgSlug: string;
  planId: string;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const capture = useCaptureBaseline(orgSlug, planId);
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CaptureBaselineValues>({
    resolver: zodResolver(captureBaselineSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ name: '' });
      capture.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open
  }, [open]);

  const onSubmit = handleSubmit((values) => {
    capture.mutate(
      { name: values.name },
      {
        onSuccess: () => {
          announce(`Baseline “${values.name}” captured.`);
          onClose();
        },
      },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Capture baseline"
      description="Freeze the plan’s current computed schedule as a plan of record."
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <FormErrorSummary errors={errors} />
        {capture.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {captureErrorMessage(capture.error)}
          </p>
        ) : null}
        <TextField
          label="Name"
          autoComplete="off"
          placeholder="e.g. Contract Baseline"
          error={errors.name?.message}
          {...register('name')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={capture.isPending} aria-busy={capture.isPending}>
            {capture.isPending ? 'Capturing…' : 'Capture baseline'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
