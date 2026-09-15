import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAnnounce } from '@/components/ui/announcer';

/** What the last copy did. `idle` is also "nothing has been pressed yet". */
export type ClipboardCopyState = 'idle' | 'copied' | 'failed';

export interface UseClipboardCopyOptions {
  /** Announced, and returned as `state: 'copied'`, when the write resolves. */
  copiedMessage: string;
  /**
   * Announced, and returned as `state: 'failed'`, when the write is refused **or the Clipboard API
   * is absent**.
   *
   * **Required, with no default, for the reason the estate demonstrates.** Of the five call sites
   * this hook replaced, three answered a rejection by setting their `copied` flag back to `false` —
   * which is byte-identical to never having pressed the button: no visible change, nothing
   * announced, on a browser that refuses clipboard access, which is an ordinary configuration
   * rather than an edge case (WCAG 4.1.3). A fourth said nothing in either direction. The fifth got
   * it right, and its own comment records the M4 accessibility review finding the defect and fixing
   * it — in that one file, while three siblings kept it. One correct pattern applied to a control
   * and not its neighbours, recorded in the fixed copy.
   *
   * A default would let the next caller reach that state by omission, which is how these four
   * arrived. The same shape as `Alert`'s `purpose` and `useTooltip`'s.
   */
  failedMessage: string;
  /**
   * Return to `idle` after this many milliseconds.
   *
   * Omitted, the state stands until the next copy — which is what three of the five sites did and is
   * right for a control whose label does not change. `ShareLinksDialog` reverts after 2 s because its
   * button's LABEL is the signal ("Copy link" → "Copied"), and a button permanently reading "Copied"
   * stops being a control you can tell is pressable. That is a real behaviour, not an inconsistency
   * to flatten, so it survives as an option.
   */
  revertAfterMs?: number;
}

export interface ClipboardCopy {
  state: ClipboardCopyState;
  /** Write `text`, announce the outcome, and move `state`. Safe to call when the API is absent. */
  copy: (text: string) => void;
  /** Return to `idle` without copying — for a caller whose subject has just been replaced. */
  reset: () => void;
}

/**
 * Copy text to the clipboard, and say what happened.
 *
 * **The announcement is the point.** A Copy button changes nothing on screen, so without a live
 * region it is completely silent to a screen-reader user in both outcomes; and the failure branch is
 * the one that matters most, because the reader has to know to select the text by hand instead.
 *
 * The `navigator.clipboard` guard is here because exactly one of the five call sites had it: the
 * property is undefined in an insecure context, so `navigator.clipboard.writeText(…)` throws
 * **synchronously** and the `.then(onError)` the other four relied on never runs. Their failure
 * branch could not fire at all in the one configuration it was written for.
 *
 * **It announces through the app's shared polite region** (`useAnnounce`). That context has a no-op
 * default, so a caller mounted outside `AnnouncerProvider` announces into nothing, silently — which
 * was true of the entire staff console until this landed (`/staff` is a sibling of the authenticated
 * shell and had no provider of its own). Three of this hook's call sites live there, so mounting one
 * is part of the change rather than an extra: a mechanism that looks right and does nothing is worse
 * than the defect it replaces.
 */
export function useClipboardCopy({
  copiedMessage,
  failedMessage,
  revertAfterMs,
}: UseClipboardCopyOptions): ClipboardCopy {
  const announce = useAnnounce();
  const [state, setState] = useState<ClipboardCopyState>('idle');
  const timer = useRef<number | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  // Cleared on unmount, and cleared before each new copy below: a timer left running from the
  // previous press would revert the state of the current one partway through its own window.
  useEffect(() => clearTimer, [clearTimer]);

  const settle = useCallback(
    (next: ClipboardCopyState, message: string) => {
      setState(next);
      announce(message);
      clearTimer();
      if (revertAfterMs !== undefined) {
        timer.current = window.setTimeout(() => setState('idle'), revertAfterMs);
      }
    },
    [announce, clearTimer, revertAfterMs],
  );

  const copy = useCallback(
    (text: string) => {
      const clipboard = navigator.clipboard;
      if (!clipboard) {
        settle('failed', failedMessage);
        return;
      }
      void clipboard.writeText(text).then(
        () => settle('copied', copiedMessage),
        () => settle('failed', failedMessage),
      );
    },
    [copiedMessage, failedMessage, settle],
  );

  const reset = useCallback(() => {
    clearTimer();
    setState('idle');
  }, [clearTimer]);

  /**
   * **Memoised, so a caller can put it in a dependency array honestly** (ADR-0133 D6).
   *
   * A fresh object every render is what makes a `useCallback` that depends on it re-create every
   * render — silently, with nothing failing and the code reading correctly. `copy` and `reset` are
   * stable, so this identity changes only when `state` does, which is exactly when a consumer's
   * render output depends on it.
   */
  return useMemo(() => ({ state, copy, reset }), [state, copy, reset]);
}
