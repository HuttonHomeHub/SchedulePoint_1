import { useEffect, useId, useRef } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useFieldGate } from '@/components/ui/field-gate';

/** A save's refusal and, optionally, the control that recovers from it (ADR-0217 D2). */
export interface ScopeSaveError {
  message: string;
  action?: React.ReactNode;
}

export interface ScopeSaveBarProps {
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
  /**
   * The refusal of the last save, or `null`. Shown in the bar, described-by on Save, scrolled into
   * view and never focused (ADR-0217 D2). `action` is the way out — "Refresh this section" — rendered
   * under the sentence and deliberately **outside** the live region and the description.
   */
  error?: ScopeSaveError | null;
}

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
 * `dirty` goes false. That is SC 2.4.3, on the happy path, every time. The click guard stops the
 * pointer and the keyboard alike (Enter in a field reaches the form through this button's click), so
 * the control is inert without ever leaving the tab order.
 *
 * **Pointer-inert only while saving.** `blocked` is also true at rest — a clean scope, a read-only
 * one — and `pointer-events: none` there hands the click to whatever is behind the button and hides
 * the reason from a hover (`docs/TECH_DEBT.md` #460). So `aria-busy:pointer-events-none` covers the
 * in-flight part and the guard covers the rest.
 *
 * **The reason is `aria-describedby`-linked, not merely adjacent.** The first draft placed the
 * sentence next to the button and the docblock claimed "a reason that lives next to the boolean
 * cannot drift from it" — true of the code, false of the accessibility tree, where proximity is not
 * association. A screen-reader user met a Save they could not use and no explanation at all: the
 * precise defect this epic exists to remove, reproduced by the fix for it.
 *
 * **A refusal belongs in the bar, beside the Save that was pressed** (ADR-0217 D2). Every caller used
 * to print its own at the top of its scope. At the 1024 × 600 design floor a scope is scrolled until
 * its fields fill the pane, so a refusal at the top sat above the fold, beside nothing the reader was
 * looking at: Save seemed to do nothing. The `error` slot is the one place for it, and it keeps the
 * three promises a refusal owes a reader who is still on Save:
 *
 * - **It describes Save** (`aria-describedby`), so a screen-reader user who presses Save and hears
 *   nothing more finds the reason on the control they are on. The `role="alert"` Alert announces it
 *   once, as it appears; its **action** sits outside that Alert, so the description is the sentence
 *   alone and "Refresh this section" is not read out a second time as part of it.
 * - **It scrolls into view** (`block: 'nearest'`, once per new refusal) — the whole bar, so the
 *   refusal and the Save the reader will press again arrive together. Absent in jsdom, hence guarded.
 * - **It never takes focus.** The reader's cursor is on Save; the `ServerError` rule (it unmounts
 *   nothing, so nothing is displaced) holds here for the same reason.
 *
 * While a refusal shows it replaces the "Unsaved changes" / "Saved." sentence — a bar cannot honestly
 * say both "saved" and "refused" — but never a gate reason, which explains why Save is inert and is
 * still true.
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
  error = null,
}: ScopeSaveBarProps): React.ReactElement {
  const reasonId = useId();
  const errorId = useId();
  const barRef = useRef<HTMLDivElement>(null);
  const message = error?.message ?? null;
  // Keyed on the sentence, not the object: a caller rebuilding `{ message }` on every render must not
  // re-scroll, and a refusal that clears and returns with the same words (a second failed attempt)
  // still has to come back into view. `scrollIntoView` is absent in jsdom.
  useEffect(() => {
    if (message !== null) barRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [message]);
  const blocked = !gate.writable || !dirty || pending;
  // A `FieldGateProvider` above this bar has ALREADY rendered this scope's reason, above the fields
  // (ADR-0083 D4 — one node, N references). Printing it again beside Save is the same sentence
  // twice on one screen, which is exactly what ADR-0077 §9 removed from the auth forms; the unit
  // suite caught it here the first time the two landed together. So: point at that node instead.
  // The dirty/saved messages are untouched — they are this bar's own, and no provider renders them.
  const inherited = useFieldGate();
  const groupReasonId = gate.writable ? undefined : inherited?.reasonId;
  const reason = gate.writable
    ? message !== null
      ? null
      : dirty
        ? dirtyMessage
        : saved
          ? savedMessage
          : null
    : groupReasonId
      ? null
      : gate.reason;
  const describedBy =
    [groupReasonId ?? (reason ? reasonId : undefined), message !== null ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    // A column so the refusal gets the bar's whole width above the button instead of squeezing it
    // (ADR-0114): a row that cannot shrink is never asked to wrap. Without a refusal the column holds
    // one row and looks exactly as it did.
    <div
      ref={barRef}
      data-scope-save-bar=""
      className="border-border flex flex-col gap-3 border-t pt-4"
    >
      {error ? (
        <div className="flex flex-col items-start gap-2">
          <Alert id={errorId} purpose="event" tone="error" className="w-full">
            {error.message}
          </Alert>
          {error.action}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <p id={reasonId} className="text-muted-foreground text-sm">
          {reason}
        </p>
        <Button
          type="submit"
          aria-disabled={blocked}
          aria-busy={pending}
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
          // Refuses a click while blocked: a pointer press, Enter or Space on this button, and Enter in
          // a field (the browser's implicit submission is a click on the default button) all arrive here.
          onClick={(event) => {
            if (blocked) event.preventDefault();
          }}
          className="aria-busy:pointer-events-none"
        >
          {pending ? pendingLabel : label}
        </Button>
      </div>
    </div>
  );
}
