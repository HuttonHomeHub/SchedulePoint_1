import { useEffect } from 'react';
import type { FieldValues, UseFormWatch } from 'react-hook-form';

/**
 * Drop a settled server error the moment the reader edits the form (ADR-0077 §9).
 *
 * **The defect this closes is two alerts about two different events.** Nothing used to clear a
 * mutation's error state, so a failed submit left its alert on screen indefinitely. Edit a field
 * until client validation fails and a second `role="alert"` region appeared beside it — one
 * describing the attempt that just failed, one describing the attempt not yet made — and a screen
 * reader announced both, assertively, in the same tick. It was reachable on every public form
 * (`SignInForm`, `SignUpForm`, `RequestPasswordResetForm`, `ResetPasswordForm`,
 * `ChangePasswordForm`), most easily at `/sign-in`: get the password wrong, then clear the email.
 *
 * **It subscribes only while an error is showing.** `watch(callback)` fires on every keystroke, and
 * a subscription that lived for the form's whole life would run a comparison per character for the
 * benefit of a state that is usually absent. The effect's `isError` dependency means the listener
 * is attached when the error appears and torn down by the `reset()` that clears it.
 *
 * `reset` is React Query's, which is stable across renders, so it is an honest dependency rather
 * than one smuggled into a ref.
 */
export function useClearOnEdit<TValues extends FieldValues>(
  watch: UseFormWatch<TValues>,
  mutation: { isError: boolean; reset: () => void },
): void {
  const { isError, reset } = mutation;

  useEffect(() => {
    if (!isError) return;
    const subscription = watch(() => {
      reset();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [watch, isError, reset]);
}
