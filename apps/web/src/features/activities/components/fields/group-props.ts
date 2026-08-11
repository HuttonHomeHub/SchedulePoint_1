import type { FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * The shape every activity **field group** takes: exactly one concrete scope form (ADR-0089 D2).
 *
 * A group over `ActivityGeneralValues` cannot `register('constraintType')` — the compiler refuses
 * it, because RHF's generics are invariant and `FieldPath<ActivityGeneralValues>` has no such
 * member. That is the real gate, and it is the only one here that cannot be talked around.
 *
 * **This type is not itself a hard gate, and saying so is the point.** `GroupProps<T> & { other:
 * UseFormReturn<U> }` still compiles, so nothing stops a future group taking a second form. What
 * this buys is that the one-form shape is the default and a deviation is visible in a props
 * declaration at review time. Two earlier drafts of this decision claimed mechanisms that did not
 * hold — the `FieldGateProvider` (which hands seven scopes ONE shared gate object by identity, so
 * it can distinguish nothing) and a Vitest structural test (which cannot read a TypeScript type) —
 * and both are recorded in ADR-0089 rather than quietly replaced, because a mechanism stated
 * without its blind spot gets overclaimed again.
 *
 * A cross-scope fact does not justify a second form: it is resolved by the host and passed down as
 * a plain prop (ADR-0089 D2b — the duration field's `hoursPerDay` is the worked example).
 */
export interface GroupProps<T extends FieldValues> {
  form: UseFormReturn<T>;
}
