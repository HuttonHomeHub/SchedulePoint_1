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
 * **A second opening starts from the row, never from the last one's abandoned draft.**
 *
 * `useScopeForm` seeds on `[open, activity?.id]` (`useScopeForm.ts:48-57`), and the narrow
 * dependency list is deliberate — widening it to the activity *object* would wipe one tab's unsaved
 * edits whenever a sibling tab's save refetched the row, which the hook's docblock calls its trap 2.
 * What the docblock does not say, and what nothing asserted, is the other half: with the list that
 * narrow, **`open` is the only thing that can re-seed a host whose target never changes**.
 *
 * That is exactly the shape of a create host, where `activity` is always `undefined` and `activity?.id`
 * is therefore always the same. It works today because `CreateActivityButton` keeps the dialog
 * mounted and toggles `open` — a fact about a host, three files away, holding up a rule in a hook.
 * A host that stopped toggling would carry one draft into the next create with nothing failing, so
 * the behaviour is pinned here rather than left resting on that arrangement.
 *
 * It also *checks* the claim the plan made about the alternative host shape rather than repeating
 * it: a host that mounts the dialog per opening re-seeds too, through `defaultValues`. Both shapes
 * are asserted, so a future host can be chosen against evidence.
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
function openScope(activity: ActivitySummary | undefined) {
  return renderHook(
    ({ open }: { open: boolean }) =>
      useScopeForm<ActivityGeneralValues>(
        activityGeneralSchema,
        (a) => seedGeneral(a),
        activity,
        open,
      ),
    { initialProps: { open: false } },
  );
}

describe('useScopeForm — re-seeding across openings', () => {
  it('gives a create host a clean form on its second opening', () => {
    const { result, rerender } = openScope(undefined);
    rerender({ open: true });
    expect(result.current.form.getValues('name')).toBe('');

    // A draft the planner abandons by closing the dialog.
    act(() => result.current.form.setValue('name', 'Abandoned draft', { shouldDirty: true }));
    expect(result.current.isDirty).toBe(true);

    rerender({ open: false });
    rerender({ open: true });

    expect(result.current.form.getValues('name')).toBe('');
    // The tab's unsaved marker goes with it — a fresh form that still reads as dirty would put an
    // edit marker on a form nobody has edited.
    expect(result.current.isDirty).toBe(false);
  });

  it('re-reads the row when the same activity is opened twice', () => {
    const { result, rerender } = openScope(ROW);
    rerender({ open: true });

    act(() => result.current.form.setValue('name', 'Half-typed rename', { shouldDirty: true }));
    rerender({ open: false });
    rerender({ open: true });

    // Not 'Half-typed rename': the second visit describes the activity as it is stored, which is
    // the only value the reader can act on. `activity?.id` is unchanged across both openings, so
    // `open` is the whole of what makes this true.
    expect(result.current.form.getValues('name')).toBe('Pour slab');
    expect(result.current.isDirty).toBe(false);
  });

  it('seeds a host that mounts the dialog per opening, without any toggle at all', () => {
    // The alternative host shape, asserted rather than assumed: `defaultValues` seeds at mount, so
    // an `{open && <Dialog/>}` host is not the silent-failure case it might look like. What such a
    // host loses is the RE-seed above — which is why both are stated here.
    const { result } = renderHook(() =>
      useScopeForm<ActivityGeneralValues>(activityGeneralSchema, (a) => seedGeneral(a), ROW, true),
    );
    expect(result.current.form.getValues('name')).toBe('Pour slab');
  });
});
