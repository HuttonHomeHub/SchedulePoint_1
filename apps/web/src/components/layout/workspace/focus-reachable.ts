/**
 * Resolve `target` unless it sits inside an `inert` subtree, and otherwise somewhere a reader can
 * use (`docs/specs/retire-single-pane-workspace`, AC-2.4).
 *
 * The diagram column is `inert` while a dock has taken the row or the canvas row is too short to
 * show a bar. `focus()` on a node in an inert subtree does nothing, so a restore that aimed at the
 * diagram or the Gantt grid would leave focus on <body> after the dialog that asked for it closed
 * (WCAG 2.4.3). The fallback is the first control of an open right dock, since that is what has the
 * row, and then the activities panel's own toggle in the foot row, which is never inert.
 *
 * `reachableTarget` is the resolution and `focusOutsideInert` the focus call on top of it, split so
 * a caller that hands a target to `useContainerUnmountHandoff` can pass the element without
 * focusing it.
 */
export function reachableTarget(target: HTMLElement | null | undefined): HTMLElement | null {
  if (target && target.closest('[inert]') === null) return target;
  return (
    document.querySelector<HTMLElement>('[data-right-dock] button') ??
    document.querySelector<HTMLElement>('[data-activities-bar] button')
  );
}

/** Focus what {@link reachableTarget} resolves, for a caller that acts now rather than handing on. */
export function focusOutsideInert(target: HTMLElement | null | undefined): void {
  reachableTarget(target)?.focus();
}

/**
 * Where focus goes when something that held it leaves the plan workspace: the Gantt's active row,
 * else the canvas listbox, each run through {@link reachableTarget}. Both are queried because
 * neither panel exposes a handle. The Gantt is asked first and the canvas second, but only one of
 * the two is in the document at a time, so the order is a tie-break that never fires rather than a
 * precedence. It returns the element, not a focus call, so `useContainerUnmountHandoff` can resolve
 * it at the moment it needs it.
 */
export function planSurfaceTarget(): HTMLElement | null {
  const grid = document.querySelector<HTMLElement>('[role="treegrid"]');
  if (grid) {
    return reachableTarget(grid.querySelector<HTMLElement>('[role="row"][tabindex="0"]') ?? grid);
  }
  return reachableTarget(document.querySelector<HTMLElement>('[role="listbox"]'));
}
