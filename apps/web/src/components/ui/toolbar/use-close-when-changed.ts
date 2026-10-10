import { useLayoutEffect, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';

/**
 * **Close an open menu or panel when `key` changes, without stranding the reader** (toolbar-redesign
 * M5, spec §4.11 E-1). A promotion stage change can move the row a reader is standing on out of a
 * portalled menu, and nothing inside the menu can see it, so the host closes the menu. Closing alone
 * drops focus on `<body>` (the menu's own Escape and pick paths restore it; this path is neither), so
 * when focus is inside the menu as it closes, it goes to `restoreTo` — the control that opened it —
 * and the move is announced.
 *
 * If focus is already on `<body>` the row was removed under the reader; that case belongs to
 * `usePromotionFocusFollow`, which finds the command's new button, so this leaves it alone. A key
 * that did not change, or a menu that is shut, costs nothing.
 */
export function useCloseWhenChanged(
  key: unknown,
  open: boolean,
  close: () => void,
  restoreTo: React.RefObject<HTMLElement | null>,
): void {
  const announce = useAnnounce();
  const seen = useRef(key);
  useLayoutEffect(() => {
    if (Object.is(seen.current, key)) return;
    seen.current = key;
    if (!open) return;
    const active = document.activeElement;
    const inside =
      active instanceof HTMLElement &&
      active !== restoreTo.current &&
      active.closest('[role="menu"], [role="dialog"]') !== null;
    close();
    if (!inside) return;
    restoreTo.current?.focus();
    announce('Menu closed because the toolbar changed.');
  });
}
