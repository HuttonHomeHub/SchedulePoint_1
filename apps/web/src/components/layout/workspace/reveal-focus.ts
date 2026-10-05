/**
 * Whether honouring a reveal request moves keyboard focus into the diagram.
 *
 * A duplicate or paste lands the planner in the diagram (`keepsFocus` false). An undo or redo does not
 * move them off the control they pressed — except when focus has already fallen to `<body>` (a shaded
 * control, a closed dialog), where there is nothing to preserve and leaving it there would drop the
 * keyboard on the floor (ADR-0135).
 */
export function revealTakesFocus(keepsFocus: boolean, active: Element | null): boolean {
  if (!keepsFocus) return true;
  return active === null || active === document.body;
}
