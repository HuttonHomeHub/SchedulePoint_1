import { useEffect, useRef, useState } from 'react';

/** What caused a commit: Enter, a blur that left a draft behind, or an arrow step. */
export type CommitVia = 'enter' | 'blur' | 'step';

/**
 * **The draft-and-commit keyboard contract for a typed field** (ADR-0173, ADR-0188 D2) — one
 * implementation, so a fix to it lands once. `SizeField` is built on it; it exists as a hook rather
 * than a field because the drift worth preventing is in the behaviour, not the layout.
 *
 * - **Keystrokes only change a draft.** Applying as it was typed would clamp the first digit of
 *   `160` to a 48 px minimum and snap the text out from under the cursor.
 * - **Enter commits** (with or without a draft) and is not left to submit an enclosing form. Enter
 *   while an IME is composing is ignored: it confirms the composition, not the field.
 * - **Blur commits only a draft.** A blur with nothing typed is a focus move, not an edit.
 * - **ArrowUp/ArrowDown step and apply**, for `type="number"` with a finite `step` only. The browser's
 *   own step would merely change the draft; a text input does not own the vertical arrows, so taking
 *   them there would fight a host toolbar.
 * - **A shut field commits nothing** (ADR-0083): without the guard the arrow step would write to a
 *   read-only field.
 * - **Escape discards the draft and is heard on `window`, in the capture phase — the only place early
 *   enough.** A container that closes on Escape (`usePopoverPanel`, `Menu`, `Combobox`, `Tooltip`)
 *   listens on `document` in the capture phase and moves focus at once, which blurs the field BEFORE
 *   the event reaches any React handler. A flag set from `onKeyDown` was therefore set after the blur
 *   had already committed: Escape applied what it was meant to throw away. Capture dispatch runs
 *   `window` before `document`, whichever listener registered first. The event is not stopped:
 *   Escape still closes the container, which is what the planner asked for.
 * - **A typed value is never lost silently.** Pressing outside while a draft is typed closes the
 *   container with the field still holding it; the field unmounts without a blur, so nothing was
 *   applied. `onDraftLost` says so (the hook carries no copy). Escape discards on purpose and says
 *   nothing.
 */
export function useCommittedDraft({
  value,
  onCommit,
  step,
  type,
  shut = false,
  onDraftLost,
  inputRef,
}: {
  /** The committed value shown while there is no draft. */
  value: string;
  /** Called with the raw text; parsing, clamping and notices belong to the caller. */
  onCommit: (raw: string, via: CommitVia) => void;
  /** The arrow-key step; the arrows are handled only with `type="number"` and a finite step. */
  step?: number;
  type?: string;
  /** A gated (read-only) field: Enter and the arrows commit nothing. */
  shut?: boolean;
  onDraftLost?: () => void;
  /** The input the Escape listener filters on. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}): {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
} {
  // `null` while the field shows the committed value; a string only between typing and committing.
  const [draft, setDraft] = useState<string | null>(null);
  const discarded = useRef(false);
  // Escape threw the draft away on purpose; unlike `discarded` it outlives the blur that follows.
  const escaped = useRef(false);
  const draftRef = useRef<string | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const lost = useRef(onDraftLost);
  useEffect(() => {
    lost.current = onDraftLost;
  }, [onDraftLost]);
  useEffect(
    () => () => {
      if (draftRef.current !== null && !escaped.current) lost.current?.();
    },
    [],
  );

  useEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.target !== inputRef.current) return;
      // `discarded` makes the blur that closing the container causes skip the commit (it is cleared
      // by the blur itself, or by the next edit if no blur arrives).
      discarded.current = draftRef.current !== null;
      escaped.current = true;
      setDraft(null);
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [inputRef]);

  const commit = (raw: string, via: CommitVia): void => {
    setDraft(null);
    onCommit(raw, via);
  };

  const stepBy = type === 'number' && step !== undefined && Number.isFinite(step) ? step : null;

  return {
    value: draft ?? value,
    onChange: (event) => {
      discarded.current = false;
      escaped.current = false;
      setDraft(event.target.value);
    },
    onBlur: (event) => {
      if (draft !== null && !discarded.current) commit(event.target.value, 'blur');
      discarded.current = false;
    },
    onKeyDown: (event) => {
      if (shut) return;
      if (event.key === 'Enter') {
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        commit(event.currentTarget.value, 'enter');
      } else if (stepBy !== null && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const typed = Number(event.currentTarget.value);
        const from =
          Number.isFinite(typed) && event.currentTarget.value.trim() !== '' ? typed : Number(value);
        commit(String(from + (event.key === 'ArrowUp' ? stepBy : -stepBy)), 'step');
      }
    },
  };
}
