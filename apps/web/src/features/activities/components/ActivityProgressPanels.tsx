import type { ActivitySummary } from '@repo/types';
import { useWatch } from 'react-hook-form';

import { useUpdateActivityProgress } from '../api/use-activities';
import { useActivitySteps } from '../api/use-activity-steps';
import type { ScopeGate } from '../lib/activity-editor-gating';
import {
  PERCENT_COMPLETE_TYPE_LABELS,
  PERCENT_COMPLETE_TYPE_OPTIONS,
  deriveStatusLabel,
  progressFormSchema,
  type ProgressFormValues,
} from '../schemas/activity-schemas';
import { activityMeasureSchema } from '../schemas/activity-scope-schemas';
import { rollupPhysicalPercent } from '../schemas/step-schemas';

import { seedMeasure } from './activity-editor-seeds';
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
      <PanelSave gate={gate} dirty={isDirty} pending={mutation.isPending} label="Save progress" />
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
}: {
  orgSlug: string;
  activity: ActivitySummary;
  gate: ScopeGate;
  open: boolean;
  onSave: (patch: Record<string, unknown>, reset: () => void) => void;
  onOpenResources?: () => void;
  pending: boolean;
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
        void form.handleSubmit((values) =>
          onSave(
            {
              percentCompleteType: values.percentCompleteType,
              physicalPercentComplete:
                values.physicalPercentComplete === undefined
                  ? null
                  : values.physicalPercentComplete,
            },
            () => form.reset(values),
          ),
        )(event);
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
      <PanelSave gate={gate} dirty={isDirty} pending={pending} label="Save measure" />
    </form>
  );
}

function PanelHeading({ title, effect }: { title: string; effect: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {/* The effect line is the whole point of the co-location: two measures that look alike do
          different things, and the heading says which. */}
      <p className="text-muted-foreground text-sm">{effect}</p>
    </div>
  );
}

function PanelSave({
  gate,
  dirty,
  pending,
  label,
}: {
  gate: ScopeGate;
  dirty: boolean;
  pending: boolean;
  label: string;
}): React.ReactElement {
  return (
    <div className="border-border flex items-center justify-between gap-4 border-t pt-4">
      <p className="text-muted-foreground text-sm">
        {gate.writable ? (dirty ? 'Unsaved changes in this section.' : null) : gate.reason}
      </p>
      <Button type="submit" disabled={!gate.writable || !dirty || pending} aria-busy={pending}>
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  );
}
