import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CreateActivityPopoverProps {
  /** Container-relative screen position (px) to anchor the popover at the dropped ghost. */
  x: number;
  y: number;
  saving: boolean;
  error: string | null;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/**
 * The inline name-capture popover for create-by-drag (M2 Slice 2.1, OQ1). It appears at the
 * dropped ghost so no unnamed junk row is ever persisted: `Enter` (submit) commits the name
 * and fires the create + recalc, `Esc` cancels with no write. While saving it echoes "Saving…";
 * a server error shows inline, is linked to the field via `aria-describedby`, and moves focus back
 * to the input so it can be corrected without hunting for it.
 *
 * Three things it does deliberately (ADR-0064 T8), each of which it previously did not:
 *
 * - **A visible `Name` label**, not an `aria-label` alone. The field had an accessible name, so an
 *   axe run was clean and the gap was invisible to the tools — but a sighted user met a bare box
 *   whose only clue was a placeholder that vanishes the moment they type (WCAG 3.3.2).
 * - **A submit called "Add to plan"**, because the toolbar's Add split-button is on screen at the
 *   same time and was also called "Add". Two controls sharing an accessible name is ambiguous by
 *   voice and in a screen reader's controls list, and it made every test locator guess. The obvious
 *   rename — "Add activity" — collides with the *flag-off* legacy toolbar's button of that name,
 *   which is why the wording names the destination rather than the object.
 * - **`aria-disabled`, not the native attribute** (the `ScopeSaveBar` precedent). This submit flips
 *   on every commit and again on the first keystroke; a natively disabled button under focus is
 *   blurred to `<body>`, which is SC 2.4.3 on the happy path. The reason is `aria-describedby`-linked
 *   rather than merely adjacent — proximity is not association.
 */
export function CreateActivityPopover({
  x,
  y,
  saving,
  error,
  onCommit,
  onCancel,
}: CreateActivityPopoverProps): React.ReactElement {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const errorId = useId();
  const reasonId = useId();
  const trimmed = name.trim();
  const blocked = saving || !trimmed;
  // Why the submit cannot be used, or null when it can. An unexplained inert control is the dead
  // end this epic exists to remove, so the empty-name case says so rather than just greying.
  const reason = saving ? 'Saving…' : trimmed ? null : 'Enter a name to add this activity.';

  // The popover opens on an explicit drop gesture; focus its sole input so typing the name is
  // immediate (done via a ref effect rather than autoFocus, per the a11y lint rule).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // On a submit failure, bring focus back to the field that needs correcting (WCAG 3.3.1).
  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  return (
    <form
      aria-label="Name the new activity"
      style={{ left: x, top: y }}
      className="border-border bg-card absolute z-10 flex w-56 flex-col gap-2 rounded-lg border p-2 shadow-md"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onCommit(trimmed);
      }}
    >
      <Label htmlFor={nameId}>Name</Label>
      <Input
        ref={inputRef}
        id={nameId}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="e.g. Excavate footings"
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        // `readOnly`, not `disabled`, for the same reason as the submit below: a disabled input is
        // removed from the tab order mid-save, taking the user's focus with it.
        readOnly={saving}
        className="h-9"
      />
      {error ? (
        <p id={errorId} role="alert" className="text-destructive-text text-xs">
          {error}
        </p>
      ) : null}
      {reason ? (
        <p id={reasonId} className="text-muted-foreground text-xs">
          {reason}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} aria-disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          aria-disabled={blocked}
          aria-busy={saving}
          {...(reason ? { 'aria-describedby': reasonId } : {})}
          // `pointer-events-none` covers the mouse; this covers the keyboard, where Enter on a
          // focused button dispatches a click that would otherwise submit the form.
          onClick={(event) => {
            if (blocked) event.preventDefault();
          }}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Add to plan'}
        </Button>
      </div>
    </form>
  );
}
