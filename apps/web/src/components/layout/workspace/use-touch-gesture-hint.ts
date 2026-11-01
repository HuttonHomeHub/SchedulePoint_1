import { useEffect, useState } from 'react';

import { useFirstUseHint } from '@/features/tsld/toolbar/use-first-use-hint';

export interface UseTouchGestureHint {
  /** A finger has pressed the workspace and the reader has not yet dismissed the tip. */
  due: boolean;
  /** Mark the tip seen for good on this device. */
  dismiss: () => void;
}

/**
 * **The first finger press in a plan makes the tip due** (`docs/specs/long-press-hint/`, M2).
 *
 * Keyed on the event's `pointerType` and never on a media query, for ADR-0177 D1's reason: a
 * cover-attached Surface reports `pointer: fine` and still sends a finger. One capture listener on
 * the document, attached only while the tip is unseen and not yet due, and removed on the first
 * touch — so a device that has dismissed it, or a session that never touches, pays nothing.
 *
 * The listener only observes. It never calls `preventDefault` or `stopPropagation`, so the press
 * that summons the tip still does whatever it was going to do.
 *
 * Seen is stored on dismissal, not on appearance: the owner's answer was that the tip stays until
 * it is dismissed, so it is never marked seen merely for having been shown.
 */
export function useTouchGestureHint(): UseTouchGestureHint {
  const { unseen, markSeen } = useFirstUseHint('touch-gestures');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!unseen || touched) return undefined;
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') setTouched(true);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [unseen, touched]);

  return { due: unseen && touched, dismiss: markSeen };
}
