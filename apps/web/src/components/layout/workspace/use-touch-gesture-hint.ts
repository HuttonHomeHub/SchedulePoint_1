import { useEffect, useState } from 'react';

import { useFirstUseHint } from '@/features/tsld/toolbar/use-first-use-hint';

export interface UseTouchGestureHint {
  /** A finger has pressed and lifted in the workspace and the reader has not yet dismissed the tip. */
  due: boolean;
  /** Mark the tip seen for good on this device. */
  dismiss: () => void;
}

/**
 * **The first finger touch in a plan makes the tip due once it has finished** (`docs/specs/
 * long-press-hint/`, M2).
 *
 * Keyed on the event's `pointerType` and never on a media query, for ADR-0177 D1's reason: a
 * cover-attached Surface reports `pointer: fine` and still sends a finger. One capture listener on
 * the document, attached only while the tip is unseen and not yet due, and removed on the first
 * touch — so a device that has dismissed it, or a session that never touches, pays nothing.
 *
 * **It waits for `pointerup`, then one animation frame**, so the strip never changes the layout
 * under the very press that summons it: a bar being dragged or a button being held has its
 * geometry under the finger until the finger lifts. The listener only observes; it never calls
 * `preventDefault` or `stopPropagation`.
 *
 * Seen is stored on dismissal, not on appearance: the owner's answer was that the tip stays until
 * it is dismissed, so it is never marked seen merely for having been shown.
 */
export function useTouchGestureHint(): UseTouchGestureHint {
  const { unseen, markSeen } = useFirstUseHint('touch-gestures');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!unseen || touched) return undefined;
    let frame = 0;
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTouched(true));
    };
    document.addEventListener('pointerup', onUp, true);
    return () => {
      document.removeEventListener('pointerup', onUp, true);
      cancelAnimationFrame(frame);
    };
  }, [unseen, touched]);

  return { due: unseen && touched, dismiss: markSeen };
}
