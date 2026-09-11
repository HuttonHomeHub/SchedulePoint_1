import { useLayoutEffect } from 'react';

/** The product name every tab title ends with. */
const SUFFIX = 'SchedulePoint';

/**
 * Set the browser tab's title for as long as this component is mounted (ADR-0077 M5-T1).
 *
 * **Every route shared one title.** `index.html` says `SchedulePoint` and nothing anywhere in
 * `apps/web/src` set `document.title` outside the print surfaces — so a reader with the app open in
 * three tabs, or scanning their history for the reset link they opened, had nothing to tell them
 * apart.
 *
 * **It is NOT reliably "the first thing a screen reader announces on navigation", and this used to
 * say that it was** (`docs/TECH_DEBT.md` #102(6)). That holds for a full page load; on a
 * **client-side** route change a title change alone is not dependably announced, and none of the
 * routes using this hook moves focus on navigation — so the announcement it was credited with
 * depends on a focus move the application does not make. That is an app-wide SPA gap rather than
 * anything this hook introduced, and the hook is correct and worth having on its own terms: a
 * distinguishable tab title, restored on unmount. Only the claim was too strong, which is the
 * ADR-0076 Class 3 failure applied to an artefact of the epic that filed that rule.
 *
 * **A layout effect, not an effect**, so the title is in place before the browser paints the new
 * screen rather than a frame later. That ordering is worth keeping on its own — it is the gap in
 * which the old page's name is still current — without resting on the overstated claim above.
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
