import { useLayoutEffect } from 'react';

/** The product name every tab title ends with. */
const SUFFIX = 'SchedulePoint';

/**
 * Set the browser tab's title for as long as this component is mounted (ADR-0077 M5-T1).
 *
 * **Every route shared one title.** `index.html` says `SchedulePoint` and nothing anywhere in
 * `apps/web/src` set `document.title` outside the print surfaces — so a reader with the app open in
 * three tabs, or scanning their history for the reset link they opened, had nothing to tell them
 * apart. It is also the first thing a screen-reader announces on navigation.
 *
 * **A layout effect, not an effect**, so the title is in place before the browser paints the new
 * screen rather than a frame later — the gap is small but it is exactly the gap in which a
 * screen-reader user is told the old page's name.
 *
 * It restores the previous title on unmount. Without that, leaving `/reset-password` for the app
 * would leave "Choose a new password · SchedulePoint" in the tab for the rest of the session — the
 * same cleanup mistake `useNoindex` exists to avoid, one attribute along.
 */
export function useDocumentTitle(title: string): void {
  useLayoutEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
