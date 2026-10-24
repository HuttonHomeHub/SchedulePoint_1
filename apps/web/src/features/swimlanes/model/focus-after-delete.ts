/**
 * **Where focus goes when the swimlane it was on is deleted** (swimlanes M2-T9, ADR-0111).
 *
 * A deleted swimlane's label (or its row in Manage) is the element the confirmation dialog would hand
 * focus back to, and by the time the list refetches it is gone — so focus fell to `<body>`, which on
 * the plan workspace also silently disables every keyboard accelerator. The destination is chosen here
 * from the order the list had, and applied by the host once the dialog has closed and the row has left:
 *
 * - **From the gutter:** the next swimlane's label, else the previous one's ("No swimlane" counts as
 *   the one after the last), else the corner cell's command, else the toolbar itself.
 * - **From Manage:** the next row's Rename button, else the previous row's, else the New swimlane field.
 *
 * It looks the elements up in the document because the two surfaces are mounted by different owners
 * (the canvas and a dialog) and neither hands the host a ref; the markers it reads are the ones they
 * already carry (`data-swimlane`, `data-row-action`, `data-new-swimlane`).
 */
export interface FocusAfterDelete {
  /** The deleted swimlane's id. */
  id: string;
  from: 'gutter' | 'manage';
  /** Swimlane ids in display order as they were BEFORE the delete. */
  order: readonly string[];
}

const NO_SWIMLANE_KEY = 'none';

/** The element focus should go to, in preference order; the first that exists AND takes focus wins. */
export function focusTargetsAfterDelete(
  plan: FocusAfterDelete,
  root: ParentNode = document,
): HTMLElement[] {
  const at = plan.order.indexOf(plan.id);
  const find = (selector: string): HTMLElement[] => [
    ...root.querySelectorAll<HTMLElement>(selector),
  ];
  if (plan.from === 'gutter') {
    const keys = [...plan.order, NO_SWIMLANE_KEY];
    const neighbours = [keys[at + 1], at > 0 ? keys[at - 1] : undefined].filter(
      (key): key is string => key !== undefined,
    );
    return [
      ...neighbours.flatMap((key) =>
        find(`[data-testid="tsld-swimlane-gutter-labels"] [data-swimlane="${key}"]`),
      ),
      ...find('[data-testid="tsld-swimlane-gutter-corner"] button'),
      ...find('[data-testid="tsld-swimlane-gutter-labels"]'),
    ];
  }
  const neighbours = [plan.order[at + 1], at > 0 ? plan.order[at - 1] : undefined].filter(
    (id): id is string => id !== undefined,
  );
  return [
    ...neighbours.flatMap((id) => find(`[data-row-action="${id}:rename"]`)),
    ...find('[data-new-swimlane]'),
  ];
}

/** Move focus to the first target that takes it. Returns whether any did. */
export function focusAfterDelete(plan: FocusAfterDelete, root: ParentNode = document): boolean {
  for (const element of focusTargetsAfterDelete(plan, root)) {
    element.focus();
    if (document.activeElement === element) return true;
  }
  return false;
}
