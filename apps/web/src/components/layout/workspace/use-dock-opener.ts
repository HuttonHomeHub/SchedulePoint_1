import { useMemo, useRef } from 'react';

/**
 * **Remembers the control a docked panel was opened from, so closing it can hand focus back.**
 *
 * Float paths opened from a Gantt row menu with nothing selected has no bar control to return to,
 * and a close that focuses nothing leaves `<body>` holding focus (WCAG 2.4.3) — which also switches
 * off every workspace accelerator, because they are handlers on the workspace root.
 *
 * A menu item is the active element when the panel opens, and it unmounts with its menu, which
 * restores focus to the row's `⋯` trigger a frame later. So an opener found inside a `role="menu"`
 * is read again after that frame; anything else is kept as it was found.
 *
 * Its own hook, and not a `useRef` in the workspace: the workspace passes `toggle` into a context
 * builder during render, and the refs rule rightly refuses a function that closes over a ref being
 * handed to one. Here the ref is private to this module.
 */
export function useDockOpener(): {
  remember: () => void;
  /** The remembered control if it is still in the document, else null; forgets it either way. */
  take: () => HTMLElement | null;
} {
  const openerRef = useRef<HTMLElement | null>(null);
  return useMemo(
    () => ({
      remember: () => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || active === document.body) {
          openerRef.current = null;
          return;
        }
        openerRef.current = active;
        if (!active.closest('[role="menu"]')) return;
        requestAnimationFrame(() => {
          const restored = document.activeElement;
          openerRef.current =
            restored instanceof HTMLElement && restored !== document.body ? restored : null;
        });
      },
      take: () => {
        const opener = openerRef.current;
        openerRef.current = null;
        return opener?.isConnected ? opener : null;
      },
    }),
    [],
  );
}
