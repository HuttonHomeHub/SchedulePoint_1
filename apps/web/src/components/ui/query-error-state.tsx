import { Button } from '@/components/ui/button';

export interface QueryErrorStateProps {
  /** What could not be read, as a sentence. "Could not read mail health." */
  label: string;
  /** Re-run the query. Rendered as *Try again*. */
  onRetry: () => void;
}

/**
 * One failure shape: what could not be read, and a way to try again.
 *
 * **This is the half of "one vocabulary" that is a provable no-op extraction.** Five call sites —
 * `data-table.tsx` and four staff panels — were **character-identical modulo the label and the
 * callback**, down to the `gap-3` and the button's variant and size. That is the
 * `docs/COMPONENT_LIBRARY.md` extraction threshold met exactly, and it is the only shape on this
 * page where it was met: the LOADING half deliberately stays a rule rather than a component, since
 * `DataTable` shows a content-shaped skeleton and a stat-grid panel has no table shape to skeleton
 * (see `docs/specs/staff-console-design/feature-spec.md` §8.8).
 *
 * **`DataTable` consumes this, and that condition is load-bearing rather than tidy.** The approved
 * plan proposed a shared component that `DataTable` would *not* use — *"it composes nothing of
 * `DataTable`; both simply render the same shapes, asserted by one unit test over both"* — which is
 * two implementations of one shape held together by a test. That is precisely the ADR-0065 /
 * ADR-0121 rule the same plan invokes twice elsewhere: they drift, and the drift is invisible,
 * because each looks right alone and only somebody comparing a failed table against a failed panel
 * would ever see one is a version behind. The extraction is worth taking only on the condition that
 * there is one implementation.
 *
 * `role="alert"` is right here and is NOT the ADR-0132 question: a query that has just failed **is**
 * an event, and this element is mounted by the failure rather than sitting on the page describing a
 * standing condition.
 *
 * The retry is an ordinary enabled `Button` and must stay one. ADR-0083's rule about
 * `aria-disabled` bites where a control flips under the reader; this one does not flip, it
 * unmounts when the retry succeeds.
 */
export function QueryErrorState({ label, onRetry }: QueryErrorStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-destructive-text text-sm">
        {label}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
