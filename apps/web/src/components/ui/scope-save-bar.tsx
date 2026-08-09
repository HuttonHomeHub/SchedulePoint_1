import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { useFieldGate } from '@/components/ui/field-gate';

/**
 * One write scope's Save, with its reason when it cannot be used (ADR-0060 §6).
 *
 * **Never a bare disabled button.** The house rule is shade-with-a-reason, and a Save whose disabled
 * state is unexplained is exactly the lit-but-inert dead end this epic set out to remove.
 *
 * Extracted because the editor's four definition tabs and the Progress tab's three panels want the
 * identical bar, and the first draft shipped it twice — in two files, already diverging in how they
 * typed `gate` (one narrowed it to an inline `{writable, reason}` and dropped `readable`). That is
 * the `SelectField` history repeating on day one: the repo has a hand-assembled label+control block
 * that was written thirty-three times before someone extracted it. One component, eight callers —
 * which is also why the two accessibility fixes below are one change rather than eight.
 *
 * It lives in `components/ui/` rather than in the activities feature because the eighth caller is
 * the Logic panel's **Add a link** section, in another feature: leaving it where it was would have
 * had two feature barrels importing each other. `gate` is typed structurally (`writable` +
 * `reason`), so an editor `ScopeGate` still satisfies it and no existing caller changed.
 *
 * **`aria-disabled`, not the native attribute** (the `RecalculateButton` precedent). A natively
 * disabled button is blurred to `<body>` the instant it flips — and this one flips on *every* save,
 * twice: once when `pending` goes true under the user's own focus, and again when the save lands and
 * `dirty` goes false. That is SC 2.4.3, on the happy path, every time. The `pointer-events-none`
 * rule stops the mouse and the click guard stops the keyboard, so the control is inert without ever
 * leaving the tab order.
 *
 * **The reason is `aria-describedby`-linked, not merely adjacent.** The first draft placed the
 * sentence next to the button and the docblock claimed "a reason that lives next to the boolean
 * cannot drift from it" — true of the code, false of the accessibility tree, where proximity is not
 * association. A screen-reader user met a Save they could not use and no explanation at all: the
 * precise defect this epic exists to remove, reproduced by the fix for it.
 */
export function ScopeSaveBar({
  gate,
  dirty,
  pending,
  saved = false,
  label,
  pendingLabel = 'Saving…',
  dirtyMessage = 'Unsaved changes in this section.',
  savedMessage = 'Saved.',
}: {
  /**
   * May the caller write, and — when not — why. Typed structurally so both the editor's `ScopeGate`
   * and a one-off `{ writable, reason }` satisfy it without either side importing the other.
   */
  gate: { writable: boolean; reason: string | null };
  /** The scope has unsaved edits. A clean scope's Save is inert with no reason — nothing to say. */
  dirty: boolean;
  pending: boolean;
  /**
   * This scope saved and has not been edited since.
   *
   * Without it, a successful save leaves a sighted user with *nothing*: the helper text goes from
   * "Unsaved changes in this section." to blank and the button greys — pixel-identical to a tab
   * nobody has ever touched. The rest of the app pairs its screen-reader announcement with a visible
   * signal by closing the dialog; this editor deliberately stays open (a multi-scope session is the
   * point), so it has to say so itself. This was the epic's own named muscle-memory risk.
   */
  saved?: boolean;
  /** The button's text, e.g. "Save progress". Scope-specific so three Saves are tellable apart. */
  label: string;
  /**
   * What the button says while the write is in flight. Defaults to the editor's "Saving…"; a form
   * whose verb is not "save" overrides it, so the busy state names the same action the idle label
   * promised ("Add link" → "Adding…", not "Saving…").
   */
  pendingLabel?: string;
  /**
   * What to say while there are unsaved edits. Defaults to the editor's sentence; a **create** form
   * overrides it — "Unsaved changes in this section" describes an edit to something that already
   * exists, and a half-filled new-link form is not that. `null` says nothing at all, for a surface
   * where the result is its own feedback (a new row appearing in the list above the form).
   */
  dirtyMessage?: string | null;
  /** What to say after a successful write. Overridden for the same reason as {@link dirtyMessage}. */
  savedMessage?: string | null;
}): React.ReactElement {
  const reasonId = useId();
  const blocked = !gate.writable || !dirty || pending;
  // A `FieldGateProvider` above this bar has ALREADY rendered this scope's reason, above the fields
  // (ADR-0083 D4 — one node, N references). Printing it again beside Save is the same sentence
  // twice on one screen, which is exactly what ADR-0077 §9 removed from the auth forms; the unit
  // suite caught it here the first time the two landed together. So: point at that node instead.
  // The dirty/saved messages are untouched — they are this bar's own, and no provider renders them.
  const inherited = useFieldGate();
  const groupReasonId = gate.writable ? undefined : inherited?.reasonId;
  const reason = gate.writable
    ? dirty
      ? dirtyMessage
      : saved
        ? savedMessage
        : null
    : groupReasonId
      ? null
      : gate.reason;
  const describedBy = groupReasonId ?? (reason ? reasonId : undefined);

  return (
    <div className="border-border flex items-center justify-between gap-4 border-t pt-4">
      <p id={reasonId} className="text-muted-foreground text-sm">
        {reason}
      </p>
      <Button
        type="submit"
        aria-disabled={blocked}
        aria-busy={pending}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        // `pointer-events-none` covers the mouse; this covers the keyboard, where Enter on a focused
        // button dispatches a click that would otherwise submit the form.
        onClick={(event) => {
          if (blocked) event.preventDefault();
        }}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
      >
        {pending ? pendingLabel : label}
      </Button>
    </div>
  );
}
