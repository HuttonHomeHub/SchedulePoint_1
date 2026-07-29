import { useId } from 'react';

import type { ScopeGate } from '../lib/activity-editor-gating';

import { Button } from '@/components/ui/button';

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
 * that was written thirty-three times before someone extracted it. One component, seven callers —
 * which is also why the two accessibility fixes below are one change rather than seven.
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
}: {
  gate: ScopeGate;
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
}): React.ReactElement {
  const reasonId = useId();
  const blocked = !gate.writable || !dirty || pending;
  const reason = gate.writable
    ? dirty
      ? 'Unsaved changes in this section.'
      : saved
        ? 'Saved.'
        : null
    : gate.reason;

  return (
    <div className="border-border flex items-center justify-between gap-4 border-t pt-4">
      <p id={reasonId} className="text-muted-foreground text-sm">
        {reason}
      </p>
      <Button
        type="submit"
        aria-disabled={blocked}
        aria-busy={pending}
        {...(reason ? { 'aria-describedby': reasonId } : {})}
        // `pointer-events-none` covers the mouse; this covers the keyboard, where Enter on a focused
        // button dispatches a click that would otherwise submit the form.
        onClick={(event) => {
          if (blocked) event.preventDefault();
        }}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
      >
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  );
}
