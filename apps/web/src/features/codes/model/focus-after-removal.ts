/**
 * **Where focus goes when the row it was on is removed** (ADR-0135, ADR-0111): by this reader's own
 * delete, or by a refetch that shows a colleague's. The element a delete's confirmation would hand
 * focus back to is the one that was just deleted, and by the time the list refetches it is gone, so
 * focus fell to `<body>` — which inside a modal means the reader is lost.
 *
 * The destination is chosen from the order the list had, and it is the **same action on the
 * neighbouring row**: the next row's, else the previous row's, else the Add value field. It looks the
 * elements up in the document because the dialog's table is windowed and its rows are not held as
 * refs; the markers it reads (`data-row-action`, `data-new-code-value`) are the ones they already carry.
 */
export interface RemovedRow {
  /** The removed row's id. */
  id: string;
  /** Row ids in display order as they were BEFORE the removal. */
  order: readonly string[];
  /** The action that held focus (`edit`, `up`, `down`, `delete`): the neighbour's same one is sought first. */
  verb: string;
}

/** The elements focus should go to, in preference order; the first that exists AND takes focus wins. */
export function focusTargetsAfterRemoval(
  removed: RemovedRow,
  root: ParentNode = document,
): HTMLElement[] {
  const at = removed.order.indexOf(removed.id);
  const neighbours = [removed.order[at + 1], at > 0 ? removed.order[at - 1] : undefined].filter(
    (id): id is string => id !== undefined,
  );
  const find = (selector: string): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>(selector),
  ];
  return [
    ...neighbours.flatMap((id) => find(`[data-row-action="${id}:${removed.verb}"]`)),
    ...find('[data-new-code-value]'),
  ];
}

/** Move focus to the first target that takes it. Returns whether any did. */
export function focusAfterRemoval(removed: RemovedRow, root: ParentNode = document): boolean {
  for (const element of focusTargetsAfterRemoval(removed, root)) {
    element.focus();
    if (document.activeElement === element) return true;
  }
  return false;
}

/**
 * The type to select when the selected one is removed: the next in order, else the previous, else
 * none. Pure, so the delete's choice and a colleague-delete's agree.
 */
export function neighbourOf(order: readonly string[], id: string): string | undefined {
  const at = order.indexOf(id);
  return order[at + 1] ?? (at > 0 ? order[at - 1] : undefined);
}
