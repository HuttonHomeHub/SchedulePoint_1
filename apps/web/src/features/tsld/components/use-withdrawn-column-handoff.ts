import { useLayoutEffect, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';

/**
 * **A column that is withdrawn under focus hands focus on, and says so** (ADR-0135, WCAG 2.4.3).
 *
 * The diagram's corner column is not unmounted when the stage becomes too short to hold it — it is
 * made `visibility: hidden`, which takes its buttons out of the Tab order and the accessibility tree
 * with the picture. A reader standing on Zoom in or the Minimap toggle at that moment would find focus
 * dropped on `<body>`, which on this workspace also silently disables every keyboard accelerator (they
 * are a React `onKeyDown` on the workspace root). `useContainerUnmountHandoff` cannot serve: its
 * subject goes away, this one stays mounted and is merely hidden, so the hand-off is a layout effect
 * on the flag rather than a cleanup.
 *
 * It runs in the commit that applies the class, **before** the browser's own focus fix-up, so
 * `activeElement` still names the control and the answer to "was focus inside" is read, not recorded.
 * Focus first, then announce, and only if the focus landed (`use-focus-handoff.ts`: the announcer
 * defers its write by a frame). A reader who was elsewhere is never pulled in.
 */
export function useWithdrawnColumnHandoff({
  columnRef,
  withdrawn,
  target,
  message,
}: {
  columnRef: React.RefObject<HTMLElement | null>;
  /** True while the column is hidden. The hand-off fires on the change to true only. */
  withdrawn: boolean;
  /** Where focus goes; absent means the host has nowhere stable to offer, so nothing moves. */
  target: React.RefObject<HTMLElement | null> | undefined;
  /** Said through the polite region once focus has landed. */
  message: string;
}): void {
  const announce = useAnnounce();
  const was = useRef(withdrawn);
  useLayoutEffect(() => {
    const changed = withdrawn && !was.current;
    was.current = withdrawn;
    if (!changed) return;
    const column = columnRef.current;
    const destination = target?.current;
    if (!column || !destination || !column.contains(document.activeElement)) return;
    destination.focus();
    if (document.activeElement !== destination) return;
    announce(message);
  }, [withdrawn, columnRef, target, message, announce]);
}
