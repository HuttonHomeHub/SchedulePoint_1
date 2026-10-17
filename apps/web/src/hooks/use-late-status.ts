import { useEffect, useRef } from 'react';

/**
 * A ref for a `role="status"` element that mounts EMPTY and is given its text after mount.
 *
 * A live region that arrives already containing its sentence is inserted, not changed, and
 * assistive technology commonly announces nothing for it. This is the mechanism `RoutePending`
 * proved (`app/route-pending.tsx`); it is lifted here so `LoadingShape` and `Spinner` share one
 * implementation instead of each hand-writing it. The text is written to the DOM rather than
 * through state: the element has no React children to reconcile, and the write must land after the
 * empty element is already in the document. Re-writing the same text is idempotent, which is what
 * keeps StrictMode's double-invoked effect from announcing twice.
 *
 * The shared `useAnnounce` region is no help on the screens this serves: a guest, an invitee and
 * the staff gate have no shell announcer, and the route-pending screen is shown while the shell
 * that hosts it is itself still loading.
 */
export function useLateStatus<T extends HTMLElement>(text: string): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // A status inside a busy subtree may have its change deferred past its own lifetime (ARIA 1.2).
    // The structural gate reads JSX as written and cannot see a prop that forwards `aria-busy`, so
    // the DOM is asked once the node exists. Dev and test only; production just announces.
    if (import.meta.env.DEV && node.closest('[aria-busy="true"]') !== null) {
      console.error(
        `useLateStatus: the status "${text}" is inside an aria-busy subtree, so assistive technology ` +
          'may defer it until it has unmounted. Move the status outside the busy element.',
      );
    }
    node.textContent = text;
  }, [text]);
  return ref;
}
