import { useEffect, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';

/**
 * Announce the Late-start overlay switching on/off (WCAG 4.1.3, `docs/TECH_DEBT.md` #402/#417).
 *
 * The overlay redraws the bars at late dates and greys out editing, but nothing spoke the change.
 * It lives on the host that owns the toggle rather than on `TsldPanel`, because the panel is only
 * mounted in the diagram view and the Gantt draws on the same date source: one polite live region
 * serves both views. Skips the first render (a plan opened with the overlay already on is not a
 * change). It deliberately does NOT say "read-only": for a member who can edit, the toolbar's own
 * `role="status"` banner already says editing is paused, on the same toggle, and two polite
 * messages would queue or cut each other off (accessibility review, 2026-09-29).
 */
export function useLateOverlayAnnouncement(lateOverlayActive: boolean): void {
  const announce = useAnnounce();
  const shownRef = useRef(lateOverlayActive);
  useEffect(() => {
    if (lateOverlayActive === shownRef.current) return;
    shownRef.current = lateOverlayActive;
    announce(lateOverlayActive ? 'Late dates shown.' : 'Placed dates shown.');
  }, [lateOverlayActive, announce]);
}
