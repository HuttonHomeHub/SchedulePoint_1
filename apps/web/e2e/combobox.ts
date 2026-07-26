import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Playwright drivers for the shared APG **`Combobox`** (`src/components/ui/combobox.tsx`).
 *
 * With `VITE_LIBRARY_SCOPING` on (ADR-0053 §4, default-on) the four library pickers — plan
 * calendar, activity calendar, resource calendar, assignment resource — are comboboxes rather
 * than native `<select>`s, so `selectOption()` no longer applies: the field is a text input that
 * reveals a `role="listbox"` sibling.
 *
 * Two traps these helpers exist to close:
 *
 * 1. **`getByLabel` is ambiguous.** The toggle button and the listbox both carry the widget's
 *    "Show calendars"/"Show resources" name, which a substring label match selects alongside the
 *    input — a strict-mode violation. The field is therefore always addressed by its combobox
 *    role and its exact `<Label>` text.
 * 2. **Clicking the input does not open the list.** Only the toggle button (pointer) and `↓`
 *    (keyboard) do, per the APG pattern — so these helpers press `ArrowDown`.
 */

/** The combobox text input labelled `name` — the consumer's `<Label htmlFor>` target. */
export function comboboxField(scope: Page | Locator, name: string): Locator {
  return scope.getByRole('combobox', { name, exact: true });
}

/**
 * Open the combobox labelled `name` within `scope` and choose the option whose accessible name is
 * `optionName`, then assert the field settled on it. Options are matched exactly: an option's
 * accessible name carries its badge (`"Standard, Archived"`), so a substring match would make
 * an archived row indistinguishable from a live one.
 */
export async function chooseComboboxOption(
  scope: Page | Locator,
  name: string,
  optionName: string,
): Promise<void> {
  const field = comboboxField(scope, name);
  await field.press('ArrowDown');
  // Look the option up inside THIS combobox's own listbox, resolved through `aria-controls`. A
  // wider `getByRole('option')` would also see the canvas's parallel activity listbox on the plan
  // workspace, and an attribute selector (rather than `#id`) keeps it safe for any `useId` shape.
  const listboxId = await field.getAttribute('aria-controls');
  const listbox = scope.locator(`[id="${listboxId ?? ''}"]`);
  await expect(listbox).toBeVisible();
  const option = listbox.getByRole('option', { name: optionName, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  // The input shows the SELECTED option's label once the popup closes (`displayValue`), so this
  // both waits out the close and proves the commit landed.
  await expect(field).toHaveValue(optionName);
}
