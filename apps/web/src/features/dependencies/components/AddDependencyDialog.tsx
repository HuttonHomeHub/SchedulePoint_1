import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useCreateDependency } from '../api/use-dependencies';
import {
  DEPENDENCY_TYPES,
  DEPENDENCY_TYPE_LABELS,
  dependencyFormSchema,
  type DependencyFormValues,
} from '../schemas/dependency-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Which side of the new link the anchor activity sits on. */
export type LinkDirection = 'predecessor' | 'successor';

/**
 * Add a dependency from an activity's Logic panel. `direction` says whether we are
 * adding a **predecessor** (other → anchor) or a **successor** (anchor → other);
 * `options` is the plan's other activities (self already excluded). Cycle,
 * duplicate and self rejections come back from the API and are shown inline — the
 * server is the source of truth for the acyclic guarantee.
 */
export function AddDependencyDialog({
  orgSlug,
  planId,
  anchor,
  direction,
  options,
  open,
  onClose,
}: {
  orgSlug: string;
  planId: string;
  anchor: ActivitySummary;
  direction: LinkDirection;
  options: ActivitySummary[];
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateDependency(orgSlug);
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DependencyFormValues>({
    resolver: zodResolver(dependencyFormSchema),
    defaultValues: { otherActivityId: '', type: 'FS', lagDays: 0 },
  });

  useEffect(() => {
    if (open) {
      reset({ otherActivityId: '', type: 'FS', lagDays: 0 });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open/direction change
  }, [open, direction, anchor.id]);

  const onSubmit = handleSubmit((values) => {
    // The anchor is the successor when adding a predecessor, else the predecessor.
    const predecessorId = direction === 'predecessor' ? values.otherActivityId : anchor.id;
    const successorId = direction === 'predecessor' ? anchor.id : values.otherActivityId;
    create.mutate(
      { planId, predecessorId, successorId, type: values.type, lagDays: values.lagDays },
      {
        onSuccess: () => {
          announce(`Dependency added to “${anchor.name}”.`);
          onClose();
        },
      },
    );
  });

  const title = direction === 'predecessor' ? 'Add predecessor' : 'Add successor';
  const otherLabel = direction === 'predecessor' ? 'Predecessor activity' : 'Successor activity';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={
        direction === 'predecessor'
          ? `Choose an activity that must come before “${anchor.name}”.`
          : `Choose an activity that “${anchor.name}” drives.`
      }
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <FormErrorSummary errors={errors} />
        {create.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {create.error.message}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dependency-other">{otherLabel}</Label>
          <Select
            id="dependency-other"
            aria-invalid={errors.otherActivityId ? true : undefined}
            aria-describedby={errors.otherActivityId ? 'dependency-other-error' : undefined}
            {...register('otherActivityId')}
          >
            <option value="" disabled>
              Choose an activity…
            </option>
            {options.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.code ? `${activity.code} — ${activity.name}` : activity.name}
              </option>
            ))}
          </Select>
          {errors.otherActivityId?.message ? (
            <p id="dependency-other-error" className="text-destructive-text text-sm">
              {errors.otherActivityId.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dependency-type">Type</Label>
          <Select id="dependency-type" {...register('type')}>
            {DEPENDENCY_TYPES.map((value) => (
              <option key={value} value={value}>
                {DEPENDENCY_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <TextField
          label="Lag (working days, negative for a lead)"
          type="number"
          error={errors.lagDays?.message}
          {...register('lagDays', { valueAsNumber: true })}
        />
        {options.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This plan has no other activities to link to yet.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={create.isPending || options.length === 0}
            aria-busy={create.isPending}
          >
            {create.isPending ? 'Saving…' : 'Add dependency'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
