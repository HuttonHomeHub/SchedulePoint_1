import type { JSX } from 'react';

import type { GroupProps } from './group-props';

import { TextField, TextareaField } from '@/components/ui/form';
import { FieldGrid, FieldGridFull, FormSection } from '@/components/ui/form-layout';
import type { ActivityGeneralValues } from '@/features/activities/schemas/activity-scope-schemas';

/**
 * The fields naming an activity, in the order the reader meets them.
 *
 * **A specification, not a declaration** (ADR-0089 D2). The tuple is checked against
 * `ActivityGeneralValues` by the compiler, which catches a misspelling; the suite's `it.each` loops
 * it and asserts a rendered control per name **and that this order is render order**, which is what
 * catches a name declared here and never registered — a hole the tuple alone would open, and one
 * that would drop a field on BOTH hosts at once rather than on one visibly.
 *
 * It is also the create host's ordered focus walk (`SUBMIT_FIELD_ORDER`), so reordering it moves
 * where a failed submit sends the reader.
 */
export const IDENTITY_FIELDS = [
  'name',
  'code',
  'description',
] as const satisfies readonly (keyof ActivityGeneralValues)[];

/**
 * Identity — what this activity is called.
 *
 * Owns its `FormSection` (ADR-0089 D5): a section heading describes a group of fields, so the group
 * that renders those fields is the only thing that can keep the two in step.
 *
 * The gate is deliberately NOT here. `ActivityEditorDialog` wraps its General tab in a
 * `FieldGateProvider`, and create does not need one — creating is one act with one permission
 * (ADR-0089 D3) — so a group that carried its own provider would have to know which host it was in,
 * which is the thing this extraction exists to remove.
 */
export function ActivityIdentityFields({ form }: GroupProps<ActivityGeneralValues>): JSX.Element {
  const { errors } = form.formState;

  return (
    <FormSection title="Identity">
      <FieldGrid columns="lead">
        <TextField
          label="Name"
          // Off on both hosts since M2-T1: a control registered as `name` is the classic autofill
          // trigger, and a browser offering the reader's own name for "Pour slab" is not a help.
          autoComplete="off"
          error={errors.name?.message}
          {...form.register('name')}
        />
        <TextField
          label="Code"
          autoComplete="off"
          error={errors.code?.message}
          {...form.register('code')}
        />
        <FieldGridFull>
          <TextareaField
            label="Description"
            error={errors.description?.message}
            {...form.register('description')}
          />
        </FieldGridFull>
      </FieldGrid>
    </FormSection>
  );
}
