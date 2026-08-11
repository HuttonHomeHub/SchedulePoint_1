import { DURATION_TYPES, type ActivityType } from '@repo/types';
import type { JSX } from 'react';
import { useWatch } from 'react-hook-form';

import type { GroupProps } from './group-props';

import { SelectField, TextField } from '@/components/ui/form';
import { FieldGrid, FieldGridFull, FormSection } from '@/components/ui/form-layout';
import { ADVANCED_ACTIVITY_TYPES_ENABLED, DURATION_TYPES_ENABLED } from '@/config/env';
import {
  durationHelp,
  durationInputProps,
  durationLabel,
} from '@/features/activities/model/duration-field';
import {
  ACTIVITY_TYPE_LABELS,
  DURATION_TYPE_LABELS,
  isDurationDerivedType,
  selectableActivityTypes,
} from '@/features/activities/schemas/activity-schemas';
import type { ActivityGeneralValues } from '@/features/activities/schemas/activity-scope-schemas';

/**
 * What kind of activity this is, and how long it takes.
 *
 * Ordered as the reader meets the controls. `duration` and `durationType` are both conditional —
 * a derived type has neither — so the loop that walks this tuple mounts a plain `TASK`, which is
 * the only value for which all three render.
 */
export const WORK_FIELDS = [
  'type',
  'duration',
  'durationType',
] as const satisfies readonly (keyof ActivityGeneralValues)[];

/**
 * Work — the type, the duration, and how the two relate.
 *
 * **Two facts arrive as props rather than being read here, and both are ADR-0089 D2b.**
 * `hoursPerDay` is resolved from the SCHEDULING scope's live calendar selection and feeds this,
 * a general-scope field — a group that reached across for it would need a second form, which is
 * the one erosion path D2 has. `savedType` is the host's stored row, and it is what the type
 * selector's option list is anchored on: the extra option exists only because the row carries a
 * type the selector does not otherwise offer, so anchoring it on the LIVE value made it a one-way
 * door (M2-T2 commit A1 — select anything else and the option keeping the selector honest
 * vanished, with no way back).
 *
 * Visibility still follows the live value, which is a different question with a different right
 * answer: the reader is asking "what am I editing now", not "what is stored".
 *
 * `useDurationSeed` deliberately stays at the host. It reseeds the duration field when the
 * hours-per-day factor resolves, and it needs the open/close lifecycle to know when that is a
 * fresh visit rather than a keystroke (TECH_DEBT #83) — neither of which a field group can see.
 */
export function ActivityWorkFields({
  form,
  hoursPerDay,
  savedType,
}: GroupProps<ActivityGeneralValues> & {
  /** The working-hours factor for the calendar the SCHEDULING scope currently selects (ADR-0070). */
  hoursPerDay: number | undefined;
  /** The stored row's type, or absent when creating. Anchors the option list, never visibility. */
  savedType?: ActivityType;
}): JSX.Element {
  const { errors } = form.formState;
  const type = useWatch({ control: form.control, name: 'type' });
  const derived = isDurationDerivedType(type);

  return (
    <FormSection title="Work" description="What kind of activity this is, and how long it takes.">
      <FieldGrid>
        <SelectField label="Type" error={errors.type?.message} {...form.register('type')}>
          {selectableActivityTypes(ADVANCED_ACTIVITY_TYPES_ENABLED, savedType).map((value) => (
            <option key={value} value={value}>
              {ACTIVITY_TYPE_LABELS[value]}
            </option>
          ))}
        </SelectField>

        {/* A derived type computes its own duration, so both controls disappear together — the pair
          has always been one decision. Where the duration field would have been, the reason it is
          not there: a control vanishing with nothing said is the shape this group exists to fix. */}
        {derived ? (
          type === 'LEVEL_OF_EFFORT' ? (
            <FieldGridFull>
              <p className="text-muted-foreground text-sm">
                A level-of-effort activity’s duration is derived from its span — the start of its
                earliest start-to-start predecessor to the finish of its latest finish-to-finish
                successor. Add those links, then Recalculate.
              </p>
            </FieldGridFull>
          ) : type === 'WBS_SUMMARY' ? (
            <FieldGridFull>
              <p className="text-muted-foreground text-sm">
                A WBS summary’s dates roll up from the activities grouped under it — the earliest
                start to the latest finish of its branch. It carries no logic of its own (no
                dependencies). To fill it, open each activity in the branch and set its WBS summary
                to this one, then Recalculate.
              </p>
            </FieldGridFull>
          ) : null
        ) : (
          <TextField
            label={durationLabel(hoursPerDay)}
            {...durationInputProps(hoursPerDay)}
            {...(durationHelp(hoursPerDay) === undefined
              ? {}
              : { hint: durationHelp(hoursPerDay) })}
            error={errors.duration?.message}
            {...form.register('duration')}
          />
        )}

        {/* A resource-dependent activity keeps its own duration (it behaves exactly like a task for
          logic) — only the CALENDAR it is measured on changes, to its driving resource's
          (ADR-0035 §23 / ADR-0039). Saying so here is the difference between a type that looks
          inert and one whose effect is elsewhere: without an assignment the engine schedules it on
          the ordinary calendar and flags it, which is what the Needs-a-driver badge reports. */}
        {type === 'RESOURCE_DEPENDENT' ? (
          <FieldGridFull>
            <p className="text-muted-foreground text-sm">
              A resource-dependent activity is scheduled on its <strong>driving resource’s</strong>{' '}
              calendar rather than its own, so it follows that crew or plant’s working time. Assign
              a resource and mark it driving, then Recalculate. Until you do, it schedules like an
              ordinary task and is flagged as needing a driver.
            </p>
          </FieldGridFull>
        ) : null}

        {/* Duration type governs the resource-units triad (ADR-0040), so it is meaningless for a
          type with no entered duration/units (a milestone, LOE or WBS summary) — hidden for those,
          mirroring the Duration field. */}
        {DURATION_TYPES_ENABLED && !derived ? (
          <FieldGridFull>
            <SelectField
              label="Duration type"
              hint={
                'Defaults to “Fixed duration & units/time”. Sets how editing one of duration, units or ' +
                'units/time recomputes the others so units = duration × units/time stays true — e.g. a ' +
                'crew installing a fixed quantity takes longer if its rate drops. With “Fixed units” or ' +
                '“Fixed units/time”, the driving resource’s units ÷ rate derive this activity’s duration; ' +
                'with the two fixed-duration types, editing the duration here also updates the driving ' +
                'resource’s units or rate.'
              }
              {...form.register('durationType')}
            >
              {DURATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {DURATION_TYPE_LABELS[value]}
                </option>
              ))}
            </SelectField>
          </FieldGridFull>
        ) : null}
      </FieldGrid>
    </FormSection>
  );
}
