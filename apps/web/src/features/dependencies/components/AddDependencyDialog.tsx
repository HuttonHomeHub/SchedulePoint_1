import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateDependency } from '../api/use-dependencies';
import {
  DEPENDENCY_TYPES,
  DEPENDENCY_TYPE_LABELS,
  LAG_CALENDAR_DISPLAY_ORDER,
  LAG_CALENDAR_HINT,
  LAG_CALENDAR_LABELS,
  dependencyFormSchema,
  lagFieldLabel,
  type DependencyFormValues,
} from '../schemas/dependency-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, SelectField, TextField } from '@/components/ui/form';
import { FieldGrid, FieldGridContainer, FormSection } from '@/components/ui/form-layout';

/** Which side of the new link the anchor activity sits on. */
export type LinkDirection = 'predecessor' | 'successor';

/**
 * Add a dependency from an activity's Logic panel. `direction` says whether we are
 * adding a **predecessor** (other → anchor) or a **successor** (anchor → other);
 * `options` is the plan's other activities (self already excluded). Cycle,
 * duplicate and self rejections come back from the API and are shown inline — the
 * server is the source of truth for the acyclic guarantee. `anchor`/`options` are
 * optional so the dialog stays mounted (toggled by `open`) for native focus-restore.
 */
export function AddDependencyDialog({
  orgSlug,
  planId,
  anchor,
  direction,
  options = [],
  open,
  onClose,
}: {
  orgSlug: string;
  planId: string;
  anchor?: ActivitySummary;
  direction: LinkDirection;
  options?: ActivitySummary[];
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateDependency(orgSlug);
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<DependencyFormValues>({
    resolver: zodResolver(dependencyFormSchema),
    defaultValues: { otherActivityId: '', type: 'FS', lagDays: 0, lagCalendar: 'PROJECT_DEFAULT' },
  });

  // The lag unit tracks the chosen calendar (elapsed vs working days); subscribe to just
  // that field so the numeric label restays honest as the selection changes.
  const lagCalendar = useWatch({ control, name: 'lagCalendar' });

  useEffect(() => {
    if (open) {
      reset({ otherActivityId: '', type: 'FS', lagDays: 0, lagCalendar: 'PROJECT_DEFAULT' });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open/direction change
  }, [open, direction, anchor?.id]);

  const onSubmit = handleSubmit((values) => {
    if (!anchor) return;
    // The anchor is the successor when adding a predecessor, else the predecessor.
    const predecessorId = direction === 'predecessor' ? values.otherActivityId : anchor.id;
    const successorId = direction === 'predecessor' ? anchor.id : values.otherActivityId;
    create.mutate(
      {
        planId,
        predecessorId,
        successorId,
        type: values.type,
        lagDays: values.lagDays,
        lagCalendar: values.lagCalendar,
      },
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
        anchor
          ? direction === 'predecessor'
            ? `Choose an activity that must come before “${anchor.name}”.`
            : `Choose an activity that “${anchor.name}” drives.`
          : ''
      }
    >
      {options.length === 0 ? (
        <div className="flex flex-col gap-4">
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            This plan has no other activities to link to yet. Add another activity to the plan
            first, then come back to connect them.
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          <FormErrorSummary errors={errors} />
          {create.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {create.error.message}
            </p>
          ) : null}
          <FieldGridContainer className="flex flex-col gap-5">
            <FormSection title="The link">
              <SelectField
                label={otherLabel}
                id="dependency-other"
                error={errors.otherActivityId?.message}
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
              </SelectField>
              <SelectField label="Type" id="dependency-type" {...register('type')}>
                {DEPENDENCY_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {DEPENDENCY_TYPE_LABELS[value]}
                  </option>
                ))}
              </SelectField>
            </FormSection>

            {/* The lag and the calendar it is counted in are one decision — a "5" means a different
                date depending on the row above it, which stacking them concealed. */}
            <FormSection
              title="Lag"
              description="How much time separates the two, and which calendar counts it."
            >
              <FieldGrid columns="lead">
                <SelectField
                  label="Lag calendar"
                  id="dependency-lag-calendar"
                  hint={LAG_CALENDAR_HINT}
                  {...register('lagCalendar')}
                >
                  {LAG_CALENDAR_DISPLAY_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {LAG_CALENDAR_LABELS[value]}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label={lagFieldLabel(lagCalendar)}
                  type="number"
                  error={errors.lagDays?.message}
                  {...register('lagDays', { valueAsNumber: true })}
                />
              </FieldGrid>
            </FormSection>
          </FieldGridContainer>
          <div className="border-border flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
              {create.isPending ? 'Saving…' : 'Add dependency'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
