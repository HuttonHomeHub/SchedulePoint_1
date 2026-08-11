import type { JSX } from 'react';
import { useWatch } from 'react-hook-form';

import type { GroupProps } from './group-props';

import type { FieldGate } from '@/components/ui/field-gate';
import { SelectField, TextField } from '@/components/ui/form';
import { FieldGrid } from '@/components/ui/form-layout';
import { EARNED_VALUE_ENABLED } from '@/config/env';
import {
  PERCENT_COMPLETE_TYPE_LABELS,
  PERCENT_COMPLETE_TYPE_OPTIONS,
} from '@/features/activities/schemas/activity-schemas';
import type { ActivityMeasureValues } from '@/features/activities/schemas/activity-scope-schemas';

/** The chooser and the value it governs, in that order. */
export const MEASURE_FIELDS = [
  'percentCompleteType',
  'physicalPercentComplete',
] as const satisfies readonly (keyof ActivityMeasureValues)[];

/**
 * How value is measured — which %-complete earns value, and the hand-entered physical figure.
 *
 * **This group deliberately owns no `FormSection`**, unlike its siblings. Its two hosts frame it
 * differently and correctly: the editor renders it inside a progress *panel* with a `PanelHeading`
 * naming an effect, create inside an ordinary `FormSection`. The two controls are what is shared;
 * the frame is the host's.
 *
 * The chooser and the value sit side by side (`columns="lead"`) because that pairing is what makes
 * "weighted steps are overriding this" legible at a glance rather than two rows apart.
 *
 * **`physicalPercentComplete` renders whatever the measure is** (ADR-0060 §6): shading implies a
 * value is there, hiding claims there is none, and this field holds a stored value — so withholding
 * it from a reader whose measure is Duration asserts the activity has no physical progress when it
 * may well have some.
 *
 * {@link physicalGate} is a **panel** fact, not a field fact, so it arrives as a prop. "Weighted
 * steps are setting this to 75%" is knowable only where the steps are, which is the panel; the
 * field's job is to render the reason it is given. `undefined` — never `null` — so an enclosing
 * `FieldGateProvider` still applies when steps are not winning; `null` would opt the field out of
 * the pen entirely.
 */
export function ActivityMeasureFields({
  form,
  physicalGate,
}: GroupProps<ActivityMeasureValues> & {
  /** A more specific reason than the enclosing scope's, when one applies (ADR-0083 D4). */
  physicalGate?: FieldGate;
}): JSX.Element | null {
  const measure = useWatch({ control: form.control, name: 'percentCompleteType' });

  if (!EARNED_VALUE_ENABLED) return null;

  return (
    <FieldGrid columns="lead">
      <SelectField
        label="Earn value from"
        hint={PERCENT_COMPLETE_TYPE_LABELS[measure].description}
        {...form.register('percentCompleteType')}
      >
        {PERCENT_COMPLETE_TYPE_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {PERCENT_COMPLETE_TYPE_LABELS[value].label}
          </option>
        ))}
      </SelectField>

      <TextField
        label="Physical % complete"
        type="number"
        min={0}
        max={100}
        step={1}
        inputMode="numeric"
        hint="The hand-entered physical progress that earns value when the measure is Physical. 0–100."
        {...(physicalGate === undefined ? {} : { gate: physicalGate })}
        error={form.formState.errors.physicalPercentComplete?.message}
        {...form.register('physicalPercentComplete', {
          setValueAs: (v: string) => (v === '' || v == null ? undefined : Number(v)),
        })}
      />
    </FieldGrid>
  );
}
