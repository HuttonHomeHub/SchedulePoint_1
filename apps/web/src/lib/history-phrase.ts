/**
 * **One phrasing for an undo/redo step** (undo-redo M1-T1). The toolbar tooltip, the control's
 * accessible name, the dock strip and the live-region announcement all say a step the same way, so
 * they are built here and nowhere else — the tooltip used to lowercase the WHOLE label while the
 * announcement lowercased only its first letter, so one step read "Undo edit “excavate”" in one
 * place and "Undid edit “Excavate”" in another.
 *
 * Only the first character goes lower-case: the rest of a label is an activity name, and an
 * activity's own capitalisation is not ours to change.
 */
export function historyPhrase(verb: string, label: string | null | undefined): string {
  if (!label) return verb;
  return `${verb} ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}
