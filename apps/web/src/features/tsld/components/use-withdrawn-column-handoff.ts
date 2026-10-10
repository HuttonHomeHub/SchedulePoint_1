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
 *
 * **The target can refuse.** A stage squeezed to a sliver is `inert` (TECH_DEBT #480), and the
 * diagram's list inside it cannot take focus — measured in Chromium at 1024 × 500 with a conflict
 * selected, where the first version of this hook left focus on `<body>` and said nothing. So there is
 * a second destination, a selector for a control outside the stage, tried when the first does not take.
 */
export function useWithdrawnColumnHandoff({
  columnRef,
  withdrawn,
  target,
  fallbackSelector,
  message,
}: {
  columnRef: React.RefObject<HTMLElement | null>;
  /** True while the column is hidden. The hand-off fires on the change to true only. */
  withdrawn: boolean;
  /** Where focus goes first; absent means the host offers no list, and the fallback is tried alone. */
  target: React.RefObject<HTMLElement | null> | undefined;
  /** A control outside the column's stage, tried when `target` cannot take focus (an inert stage). */
  fallbackSelector: string;
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
    if (!column || !column.contains(document.activeElement)) return;
    for (const destination of [
      target?.current,
      document.querySelector<HTMLElement>(fallbackSelector),
    ]) {
      if (!destination) continue;
      destination.focus();
      if (document.activeElement !== destination) continue;
      announce(message);
      return;
    }
  }, [withdrawn, columnRef, target, fallbackSelector, message, announce]);
}
