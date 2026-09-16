import { fireEvent, screen, within } from '@testing-library/react';

import { rowActionsLabel } from '@/components/ui/row-actions-menu';

/**
 * **Reach a row's secondary action, which now lives behind the `⋯`.**
 *
 * Page-consistency M4 gave every list one row-action shape (ADR-0097 Landing F1's, decided on the
 * calendars table): the primary action stays visible and the rest move behind a menu. So a test
 * that used to click `Delete Northgate` directly now opens `Actions for Northgate` first.
 *
 * It is a helper rather than two lines copied into a dozen tests because the **name format** is the
 * thing that would drift — and it did, one milestone in: the format grew an optional list qualifier
 * when a journey found the clients table's `⋯` colliding with the Project Explorer's. The helper
 * calls `rowActionsLabel`, the product's own builder, so a test names a control the way the screen
 * does rather than restating a format that has already changed once.
 */
export function openRowActions(subject: string, context?: string): HTMLElement {
  const name = rowActionsLabel(subject, context);
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('menu', { name });
}

/**
 * Open the row's menu and select the item named `item`, **waiting for the row to exist first**.
 *
 * The wait is not incidental. Before M4 these call sites read
 * `fireEvent.click(await screen.findByRole('button', { name: 'Archive Crew A' }))`, and the `find`
 * was doing two jobs: locating the control and waiting for the query to settle. Converting them
 * mechanically dropped the second, and two tests failed looking for a trigger on a row that had not
 * rendered yet — a failure that reads exactly like the feature being broken.
 */
export async function clickRowAction(
  subject: string,
  item: string | RegExp,
  context?: string,
): Promise<void> {
  await screen.findByRole('button', { name: rowActionsLabel(subject, context) });
  const menu = openRowActions(subject, context);
  fireEvent.click(within(menu).getByRole('menuitem', { name: item }));
}
