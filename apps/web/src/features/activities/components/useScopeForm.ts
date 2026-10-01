import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary } from '@repo/types';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

/**
 * One write scope's form inside the tabbed activity editor (ADR-0060 §4).
 *
 * Each scope owns an independent RHF form, so saving one tab never runs — or reports — another
 * tab's cross-field rules, and a validation error on Scheduling cannot block a Cost save.
 *
 * **A form's subject is fixed for its lifetime, so there is no seed effect.** `useForm` takes
 * `seed(activity)` as `defaultValues` at mount and nothing re-seeds it. The host builds the form
 * per opening (`ActivityEditorSession`, `ActivityCreateForm`), so a second opening starts from the
 * row by being a different form, not by being reset. That is also what removes the typed-input
 * window: a form that is *reset* inside a passive effect discards text typed before the re-render,
 * and one born with its values has no such moment (`docs/specs/activity-editor-seeding`, M0).
 *
 * **Two traps this hook exists to close**, both named in the plan as the epic's most likely defects:
 *
 * 1. **`version` must be read at submit time, from the live row.** Each scope save bumps the
 *    activity's version, so a scope holding a version captured when the editor opened would 409 on
 *    every save after the first. The hook therefore never stores `version` at all; the caller reads
 *    it from the live `activity` prop inside its submit handler.
 * 2. **A sibling's save must not re-seed this form.** Re-seeding on the activity *object* wiped
 *    another tab's unsaved edits whenever a scope's save refetched the row. It is now structural:
 *    there is no seed path for a refetch to trigger. A host that needs a deliberate re-seed (a
 *    conflict recovery, a late-arriving factor) calls `form.reset` itself, from an event.
 */
export interface ScopeForm<TValues extends FieldValues> {
  form: UseFormReturn<TValues>;
  /** The user has edited this scope since it was last seeded or saved. Drives the tab's marker. */
  isDirty: boolean;
  /** How many fields currently fail validation — the tab's error marker count. */
  errorCount: number;
}

/** Per-scope form options. Every member is optional and defaults to RHF's own default, so a host
 * that passes nothing is byte-identical to one that cannot pass anything. */
export interface ScopeFormOptions {
  /**
   * Whether **this form's** `handleSubmit` focuses its own first invalid control on a failed
   * submit. RHF's default is `true` (`react-hook-form@7.84.0`, `dist/index.esm.mjs:3148-3150` —
   * `_focusError` is gated on it), and that is right for a host with ONE form.
   *
   * A host that validates several scope forms in one submit passes `false` on all of them: four
   * forms each focusing their own first problem is four competing focus calls whose winner is
   * whichever promise settles last, which drags the reader past the problems it skipped. Such a
   * host owns the single ordered focus decision itself.
   */
  shouldFocusError?: boolean;
}

export function useScopeForm<TValues extends FieldValues>(
  schema: z.ZodType,
  seed: (activity: ActivitySummary | undefined) => TValues,
  activity: ActivitySummary | undefined,
  options: ScopeFormOptions = {},
): ScopeForm<TValues> {
  const form = useForm<TValues>({
    // The scope schemas are plain Zod objects (Scheduling behind three refinements); the resolver's
    // generic plumbing cannot see through `z.ZodType` to the value type, so it is asserted once
    // here rather than at four call sites.
    resolver: zodResolver(schema as never) as never,
    defaultValues: seed(activity) as never,
    // `?? true` restates RHF's own default rather than widening behaviour: a caller that omits the
    // option gets exactly what it got before this parameter existed.
    shouldFocusError: options.shouldFocusError ?? true,
  });

  return {
    form,
    isDirty: form.formState.isDirty,
    errorCount: Object.keys(form.formState.errors).length,
  };
}
