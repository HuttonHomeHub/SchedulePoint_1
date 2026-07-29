import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary, DependencySummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateDependency } from '../api/use-dependencies';
import {
  DEPENDENCY_TYPES,
  DEPENDENCY_TYPE_LABELS,
  LAG_CALENDAR_DISPLAY_ORDER,
  LAG_CALENDAR_HINT,
  LAG_CALENDAR_LABELS,
  LINK_DIRECTIONS,
  LINK_DIRECTION_LABELS,
  dependencyFormSchema,
  lagFieldLabel,
  type DependencyFormValues,
} from '../schemas/dependency-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { FormErrorSummary, SelectField, TextField } from '@/components/ui/form';
import { FieldGrid, FieldGridFull, FormSection } from '@/components/ui/form-layout';
import { ScopeSaveBar } from '@/components/ui/scope-save-bar';

const DEFAULTS: DependencyFormValues = {
  direction: 'predecessor',
  otherActivityId: '',
  type: 'FS',
  lagDays: 0,
  lagCalendar: 'PROJECT_DEFAULT',
};

/**
 * Add a link to this activity, **inline** below the two tables — the list/manage archetype
 * `docs/DESIGN_SYSTEM.md` prescribes and `ActivityResourcesPanel` already follows.
 *
 * It replaces `AddDependencyDialog`, a modal opened from inside another modal. Adding a link is the
 * Logic panel's whole reason to exist, and it read as a detour; the new row appearing in the table
 * above the form is also better feedback than a dialog closing over one.
 *
 * **Direction is a field**, because it was carried by *which button you pressed*. Its options say
 * what each choice means in the same words as the empty states above ("comes before this activity" /
 * "this activity drives it") rather than assuming the reader translates predecessor and successor.
 *
 * Cycle, duplicate and self rejections come back from the API and are shown inline — the server owns
 * the acyclic guarantee (ADR-0021).
 */
export function AddLinkSection({
  orgSlug,
  planId,
  anchor,
  options,
  gate,
  onAdded,
}: {
  orgSlug: string;
  planId: string;
  /** The activity being linked. Absent ⇒ nothing to submit, so the form does not render. */
  anchor?: ActivitySummary;
  /** The plan's other activities (self already excluded). */
  options: ActivitySummary[];
  /** May this member add links, and — when not — why (the shade-with-a-reason rule, ADR-0060 §6). */
  gate: { writable: boolean; reason: string | null };
  /**
   * Called with the created edge after a successful add (ADR-0048 M2) — the mirror of the panel's
   * `onRemoved`. Without it the undo stack was asymmetric: a link removed here could be undone, a
   * link added here could not.
   */
  onAdded?: (dependency: DependencySummary) => void;
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
    defaultValues: DEFAULTS,
  });

  // The lag unit tracks the chosen calendar (elapsed vs working days); subscribe to just
  // that field so the numeric label stays honest as the selection changes.
  const lagCalendar = useWatch({ control, name: 'lagCalendar' });
  const direction = useWatch({ control, name: 'direction' });

  // The dialog reset on open; the inline form resets when the subject changes, which is the same
  // guarantee — a half-typed link never carries over to a different activity.
  useEffect(() => {
    reset(DEFAULTS);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on target change
  }, [anchor?.id]);

  const onSubmit = handleSubmit((values) => {
    if (!anchor) return;
    // The anchor is the successor when adding a predecessor, else the predecessor.
    const predecessorId = values.direction === 'predecessor' ? values.otherActivityId : anchor.id;
    const successorId = values.direction === 'predecessor' ? anchor.id : values.otherActivityId;
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
        onSuccess: (created) => {
          onAdded?.(created);
          announce(`Dependency added to “${anchor.name}”.`);
          // Keep the direction the planner chose — linking up a chain means adding several
          // predecessors in a row, and re-picking "predecessor" each time is friction.
          reset({ ...DEFAULTS, direction: values.direction });
        },
      },
    );
  });

  const otherLabel = direction === 'predecessor' ? 'Predecessor activity' : 'Successor activity';

  return (
    <FormSection title="Add a link" description="Connect this activity to another one in the plan.">
      {options.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          This plan has no other activities to link to yet. Add another activity to the plan first,
          then come back to connect them.
        </div>
      ) : (
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          <FormErrorSummary errors={errors} />
          {create.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {create.error.message}
            </p>
          ) : null}
          <FieldGrid>
            {/* Activity names are long, so the picker takes the full width; the two fields that
                describe the SHAPE of the link pair up underneath it. */}
            <FieldGridFull>
              <SelectField
                label={otherLabel}
                id="dependency-other"
                error={errors.otherActivityId?.message}
                {...register('otherActivityId')}
              >
                <option value="" disabled>
                  Choose an activity…
                </option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code ? `${option.code} — ${option.name}` : option.name}
                  </option>
                ))}
              </SelectField>
            </FieldGridFull>
            <SelectField label="Link it as" id="dependency-direction" {...register('direction')}>
              {LINK_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {LINK_DIRECTION_LABELS[value]}
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
          </FieldGrid>
          {/* The lag and the calendar it is counted in are one decision — a "5" means a different
              date depending on the field beside it, which stacking them concealed. */}
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
          <ScopeSaveBar
            gate={gate}
            // A create form is always submittable: what is missing is the validation messages' job
            // to say, field by field, rather than a shaded button's. The feedback for a successful
            // add is the new row appearing in the table above — so neither message has anything to
            // add here, and both are silenced.
            dirty
            dirtyMessage={null}
            savedMessage={null}
            pending={create.isPending}
            label="Add link"
          />
        </form>
      )}
    </FormSection>
  );
}
