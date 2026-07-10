import { zodResolver } from '@hookform/resolvers/zod';
import type { DependencySummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useUpdateDependency } from '../api/use-dependencies';
import {
  DEPENDENCY_TYPES,
  DEPENDENCY_TYPE_LABELS,
  typeAndLagSchema,
  type TypeAndLagValues,
} from '../schemas/dependency-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * Edit a dependency's type and lag (the endpoints are immutable — re-pointing a
 * link means removing it and adding another). PATCHes with the row's `version`;
 * a stale version surfaces as an inline conflict. `dependency` is optional so the
 * dialog stays mounted (toggled by `open`), preserving native focus-restore.
 */
export function EditDependencyDialog({
  orgSlug,
  dependency,
  open,
  onClose,
}: {
  orgSlug: string;
  dependency?: DependencySummary;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const update = useUpdateDependency(orgSlug);
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TypeAndLagValues>({
    resolver: zodResolver(typeAndLagSchema),
    defaultValues: { type: 'FS', lagDays: 0 },
  });

  useEffect(() => {
    if (open && dependency) {
      reset({ type: dependency.type, lagDays: dependency.lagDays });
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, dependency?.id]);

  const onSubmit = handleSubmit((values) => {
    if (!dependency) return;
    update.mutate(
      {
        dependencyId: dependency.id,
        type: values.type,
        lagDays: values.lagDays,
        version: dependency.version,
      },
      {
        onSuccess: () => {
          announce('Dependency updated.');
          onClose();
        },
      },
    );
  });

  const label = dependency
    ? `${dependency.predecessor.name} → ${dependency.successor.name}`
    : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit dependency"
      {...(label ? { description: label } : {})}
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <FormErrorSummary errors={errors} />
        {update.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {update.error.message}
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">
          The linked activities are fixed. To connect different activities, remove this link and add
          a new one.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-dependency-type">Type</Label>
          <Select id="edit-dependency-type" {...register('type')}>
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending} aria-busy={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
