import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

/**
 * One write scope's form inside the tabbed activity editor (ADR-0060 §4).
 *
 * Each scope owns an independent RHF form, so saving one tab never runs — or reports — another
 * tab's cross-field rules, and a validation error on Scheduling cannot block a Cost save.
 *
 * **Two traps this hook exists to close**, both named in the plan as the epic's most likely defects:
 *
 * 1. **`version` must be read at submit time, from the live row.** Each scope save bumps the
 *    activity's version, so a scope holding a version captured when the dialog opened would 409 on
 *    every save after the first. The hook therefore never stores `version` at all; the caller reads
 *    it from the live `activity` prop inside its submit handler.
 * 2. **The seed effect must stay keyed on `open` + `activity.id`.** Widening it to the activity
 *    *object* would re-seed every scope whenever any scope's save refetched the row — wiping
 *    another tab's unsaved edits mid-session. The dependency list below is deliberately narrow and
 *    the suppression comment names the reason, so a future "fix the exhaustive-deps warning" pass
 *    has to read why first.
 */
export interface ScopeForm<TValues extends FieldValues> {
  form: UseFormReturn<TValues>;
  /** The user has edited this scope since it was last seeded or saved. Drives the tab's marker. */
  isDirty: boolean;
  /** How many fields currently fail validation — the tab's error marker count. */
  errorCount: number;
}

export function useScopeForm<TValues extends FieldValues>(
  schema: z.ZodType,
  seed: (activity: ActivitySummary | undefined) => TValues,
  activity: ActivitySummary | undefined,
  open: boolean,
): ScopeForm<TValues> {
  const form = useForm<TValues>({
    // The scope schemas are plain Zod objects (Scheduling behind three refinements); the resolver's
    // generic plumbing cannot see through `z.ZodType` to the value type, so it is asserted once
    // here rather than at four call sites.
    resolver: zodResolver(schema as never) as never,
    defaultValues: seed(activity) as never,
  });

  const { reset } = form;
  useEffect(() => {
    if (open) reset(seed(activity));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed ONLY on open / target change.
    // Adding `activity` (the object) would re-seed — and so discard unsaved edits in every other
    // scope — each time a sibling scope's save refetched the row. See the docblock's trap 2.
  }, [open, activity?.id]);

  return {
    form,
    isDirty: form.formState.isDirty,
    errorCount: Object.keys(form.formState.errors).length,
  };
}
