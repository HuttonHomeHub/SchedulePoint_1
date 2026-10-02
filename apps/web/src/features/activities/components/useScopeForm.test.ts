import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  activityGeneralSchema,
  type ActivityGeneralValues,
} from '../schemas/activity-scope-schemas';

import { seedGeneral } from './activity-editor-seeds';
import { useScopeForm } from './useScopeForm';

/**
 * **A form is born with its row and never re-seeded; a second opening is a second form.**
 *
 * `useScopeForm` has no `open` and no effect (docs/specs/activity-editor-seeding, M3b): `useForm`
 * takes the seed as `defaultValues` at mount, and the hosts (`ActivityEditorSession`,
 * `ActivityCreateForm`) are mounted per opening. These cases pin the three halves of that: the seed
 * is there at mount, a sibling's refetch (a new row OBJECT with the same id) does not re-seed — the
 * old effect's "trap 2", now structural — and a fresh mount does not inherit an abandoned draft.
 */

const ROW = {
  id: 'a1',
  name: 'Pour slab',
  code: 'A100',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 5,
  durationMinutes: 7200,
  parentId: null,
  description: null,
} as unknown as ActivitySummary;

/** The editor's real General scope, so this pins the form the product actually runs. */
function scope(activity: ActivitySummary | undefined) {
  return renderHook(
    ({ row }: { row: ActivitySummary | undefined }) =>
      useScopeForm<ActivityGeneralValues>(activityGeneralSchema, (a) => seedGeneral(a), row),
    { initialProps: { row: activity } },
  );
}

describe('useScopeForm — seeded at mount, never re-seeded', () => {
  it('is born with the row, clean', () => {
    const { result } = scope(ROW);
    expect(result.current.form.getValues('name')).toBe('Pour slab');
    expect(result.current.isDirty).toBe(false);
  });

  it('keeps a draft when a refetch hands it a new object for the same row', () => {
    const { result, rerender } = scope(ROW);
    act(() => result.current.form.setValue('name', 'Half-typed rename', { shouldDirty: true }));

    rerender({ row: { ...ROW, version: 2 } });

    expect(result.current.form.getValues('name')).toBe('Half-typed rename');
    expect(result.current.isDirty).toBe(true);
  });

  it('gives a fresh mount a clean form, not the last one’s abandoned draft', () => {
    const first = scope(undefined);
    act(() => first.result.current.form.setValue('name', 'Abandoned draft', { shouldDirty: true }));
    expect(first.result.current.isDirty).toBe(true);
    first.unmount();

    const second = scope(undefined);
    expect(second.result.current.form.getValues('name')).toBe('');
    expect(second.result.current.isDirty).toBe(false);
  });
});
