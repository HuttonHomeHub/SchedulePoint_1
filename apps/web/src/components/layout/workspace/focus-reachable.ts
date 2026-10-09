/**
 * Focus `target` unless it sits inside an `inert` subtree, and otherwise put focus somewhere a reader
 * can use (`docs/specs/retire-single-pane-workspace`, AC-2.4).
 *
 * The diagram column is `inert` while a dock has taken the row or the canvas row is too short to
 * show a bar. `focus()` on a node in an inert subtree does nothing, so a restore that aimed at the
 * diagram or the Gantt grid would leave focus on <body> after the dialog that asked for it closed
 * (WCAG 2.4.3). The fallback is the first control of an open right dock, since that is what has the
 * row, and then the activities panel's own toggle in the foot row, which is never inert.
 */
export function focusOutsideInert(target: HTMLElement | null | undefined): void {
  if (target && target.closest('[inert]') === null) {
    target.focus();
    return;
  }
  const fallback =
    document.querySelector<HTMLElement>('[data-right-dock] button') ??
    document.querySelector<HTMLElement>('[data-activities-bar] button');
  fallback?.focus();
}
