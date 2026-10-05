import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { NoticeStrip } from '@/components/ui/notice-strip';

/**
 * How long a success stays up when nobody is looking at it. The sentence is also announced once
 * through the live region and the step stays one `Ctrl+Z` / toolbar press away, so the strip is a
 * convenience for sighted planners rather than the only copy of the information — but it is still a
 * time limit set by the page (WCAG 2.2.1), which is why it pauses while the pointer or keyboard
 * focus is inside it and why `Dismiss` is always there. Generous on purpose: the message holds a
 * button, and reading it takes longer than a toast.
 */
export const HISTORY_RESULT_TIMEOUT_MS = 15_000;

export interface HistoryResultStripProps {
  /** `success` is a plain status line; `failure` is an assertive alert that stays until dismissed. */
  kind: 'success' | 'failure';
  message: string;
  /** The one follow-up — Redo after an undo, Undo after a redo, Try again after a failure. */
  action?: { label: string; onClick: () => void } | undefined;
  onDismiss: () => void;
  /**
   * Hand focus somewhere stable BEFORE the strip goes. Every button here removes the strip that
   * holds it, so without a destination focus falls to `<body>` — WCAG 2.4.3, and on this workspace
   * it also silently disables every accelerator, which are a React `onKeyDown` on the workspace
   * root (ADR-0135, ADR-0149 D8).
   */
  restoreFocus: () => void;
}

/**
 * What an undo or redo just did, in the canvas dock (undo-redo M1, both hosts).
 *
 * **One utterance per event** (ADR-0132). A success carries **no role**: the workspace announced the
 * same sentence through the app's single polite region at the moment it happened, and a second live
 * region here would say it twice. A failure carries `role="alert"` and the workspace does **not**
 * announce it — a strip that mounts with its content is the unreliable case for a polite region,
 * but a mounted alert is spoken, so the alert is the one voice.
 */
export function HistoryResultStrip({
  kind,
  message,
  action,
  onDismiss,
  restoreFocus,
}: HistoryResultStripProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Whether keyboard focus is inside the strip, for the two ways it can be taken away without one of
  // our own buttons being pressed (see below). A ref: it is read in cleanup, never rendered from.
  const focusInside = useRef(false);
  const restoreFocusRef = useRef(restoreFocus);
  const hasAction = action !== undefined;
  useEffect(() => {
    restoreFocusRef.current = restoreFocus;
  }, [restoreFocus]);
  // **Focus must not fall to `<body>` when the strip goes without its own buttons being pressed**
  // (WCAG 2.4.3, ADR-0135): the workspace's `Ctrl+Z` still fires with focus on `Redo`, and the press
  // replaces or withdraws the strip (a new result re-keys it). Unmount while focus is inside, or the
  // follow-up button vanishing under focus, hands focus to the plan surface.
  useLayoutEffect(
    () => () => {
      if (focusInside.current) restoreFocusRef.current();
    },
    [],
  );
  useLayoutEffect(() => {
    if (!hasAction && focusInside.current && document.activeElement === document.body) {
      restoreFocusRef.current();
    }
  }, [hasAction]);
  const expires = kind === 'success' && !hovered && !focused;

  useEffect(() => {
    if (!expires) return;
    const timer = window.setTimeout(onDismiss, HISTORY_RESULT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [expires, onDismiss]);

  const failure = kind === 'failure';
  return (
    <NoticeStrip
      data-testid="canvas-history-result"
      {...(failure ? { role: 'alert' as const } : {})}
      tone={failure ? 'warning' : 'muted'}
      density={failure ? 'comfortable' : 'compact'}
      messageFit={failure ? 'grow' : 'truncate'}
      message={message}
      title={failure ? undefined : message}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => {
        focusInside.current = true;
        setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focusInside.current = false;
          setFocused(false);
        }
      }}
    >
      {action ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            restoreFocus();
            action.onClick();
          }}
        >
          {action.label}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          restoreFocus();
          onDismiss();
        }}
      >
        Dismiss
      </Button>
    </NoticeStrip>
  );
}
