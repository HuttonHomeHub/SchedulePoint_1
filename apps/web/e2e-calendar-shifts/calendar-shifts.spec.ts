import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Flag-ON **calendar shift editor** journey (`VITE_CALENDAR_SHIFT_EDITOR`, ADR-0067/ADR-0068).
 *
 * It proves the four claims that only a real API and a real database can settle — a mocked fetch
 * accepts any body, echoes back whatever it was handed, and honours any optimistic `version`:
 *
 * 1. **The hours a planner types are the hours that are stored.** A two-shift day survives save →
 *    reload → reopen with both periods, in order, to the minute.
 * 2. **An unrelated edit does not flatten them.** Renaming the calendar and saving must leave the
 *    windows exactly as they were. The pre-epic form sent a weekday mask on every save, so a rename
 *    silently replaced a split shift with two whole days — the defect the epic was opened on.
 * 3. **A calendar with no working week is savable, and stays savable.** The Window-only preset,
 *    saved, reopened, and saved again. It is the shutdown/turnaround shape, and until the M4 gate
 *    it produced a dead end on the second save (a hidden rule with no control to satisfy it).
 * 4. **A dated exception carries real hours.** A half-day is added, reopened, and edited in place —
 *    the per-exception PATCH, gated on the exception's own version.
 *
 * Serial (one org's calendar library mutates throughout); Chromium only (TECH_DEBT #25a).
 */
test('a shift calendar round-trips its hours, survives a rename, and an empty week stays savable', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await navLink(page, 'Calendars').click();

  // ------------------------------------------------------------------ 1. Author a two-shift week
  await page.getByRole('button', { name: 'New calendar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Two shift');

  // A preset writes all seven days at once — the whole point of it being a verb.
  await dialog.getByRole('button', { name: 'Start from a preset' }).click();
  await page.getByRole('menuitem', { name: /^Two shift/ }).click();
  await expect(startOf(dialog, 'Monday', 0)).toHaveValue('06:00');
  await expect(endOf(dialog, 'Monday', 1)).toHaveValue('22:00');

  // Type over one period so the stored value is one no preset would produce — otherwise a round
  // trip could pass by re-deriving the preset rather than by reading what was saved.
  await endOf(dialog, 'Monday', 1).fill('21:30');
  await dialog.getByRole('button', { name: 'Create calendar' }).click();
  await expect(dialog).toBeHidden();

  // Reload, so nothing in this assertion can be served from the client's own cache.
  await page.reload();
  await openCalendar(page, 'Two shift');
  await expect(startOf(dialog, 'Monday', 0)).toHaveValue('06:00');
  await expect(endOf(dialog, 'Monday', 0)).toHaveValue('14:00');
  await expect(startOf(dialog, 'Monday', 1)).toHaveValue('14:00');
  await expect(endOf(dialog, 'Monday', 1)).toHaveValue('21:30');
  // Saturday works nothing, and says so rather than showing an empty area.
  await expect(dialog.getByRole('group', { name: 'Saturday hours' })).toContainText('Not worked.');

  // The standard working day was derived from the week, not left at 24 (ADR-0068).
  await expect(dialog.getByLabel('Hours per day')).not.toHaveValue('24');

  // ----------------------------------------------------- 2. A rename must not flatten the hours
  await dialog.getByLabel('Name').fill('Two shift (renamed)');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await openCalendar(page, 'Two shift (renamed)');
  await expect(startOf(dialog, 'Monday', 0)).toHaveValue('06:00');
  await expect(endOf(dialog, 'Monday', 1)).toHaveValue('21:30');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // ------------------------------------------------- 3. A window-only calendar stays savable
  await page.getByRole('button', { name: 'New calendar' }).click();
  await dialog.getByLabel('Name').fill('Turnaround');
  await dialog.getByRole('button', { name: 'Start from a preset' }).click();
  await page.getByRole('menuitem', { name: /^Window-only/ }).click();
  await expect(dialog.getByRole('group', { name: 'Monday hours' })).toContainText('Not worked.');
  await dialog.getByRole('button', { name: 'Create calendar' }).click();
  await expect(dialog).toBeHidden();

  // The second save is the one that used to be impossible: the form kept a hidden "at least one
  // working day" rule that the shift editor does not render, so Save was refused by a control
  // that was not on screen.
  await page.reload();
  await openCalendar(page, 'Turnaround');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Select at least one working day')).toHaveCount(0);

  // ------------------------------------------------------ 4. A dated exception with real hours
  await openCalendar(page, 'Turnaround');
  await dialog.getByLabel('Date').fill('2026-12-24');
  await dialog.getByLabel('Type').selectOption('hours');
  const addHours = dialog.getByRole('group', { name: 'Exception hours' });
  await addHours.getByRole('button', { name: /^Add hours/ }).click();
  await addHours.getByRole('textbox', { name: /^Start time/ }).fill('08:00');
  await addHours.getByRole('textbox', { name: /^End time/ }).fill('12:00');
  await dialog.getByRole('button', { name: 'Add exception' }).click();

  // The hours are on the row — a "Working day" badge alone would read as a whole worked day.
  await expect(dialog.getByText('08:00–12:00')).toBeVisible();

  // Edit it in place. This is the per-exception PATCH, gated on the exception's own version —
  // the only place that gate is testable at all, since a mock accepts any version.
  await dialog.getByRole('button', { name: /^Edit exception on 24 Dec 2026/ }).click();
  const editHours = dialog.getByRole('group', { name: /^Hours on 24 Dec 2026/ });
  await editHours.getByRole('textbox', { name: /^End time/ }).fill('13:30');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText('08:00–13:30')).toBeVisible();

  await page.reload();
  await openCalendar(page, 'Turnaround');
  await expect(dialog.getByText('08:00–13:30')).toBeVisible();

  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

/** Sign up + create an organisation; returns nothing — the journey stays inside one org. */
async function onboard(page: Page, stamp: number): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Shift Tester');
  await page.getByLabel('Email').fill(`shifts-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Shift Co ${String(stamp)}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/shift-co-${String(stamp)}`));
}

/**
 * A link in the org's own top nav — scoped, because the breadcrumb repeats these names once the
 * journey is deep in the hierarchy (the `e2e-library` rationale).
 */
function navLink(page: Page, name: string): Locator {
  return page.getByLabel('Organisation', { exact: true }).getByRole('link', { name, exact: true });
}

/** Open a calendar's edit dialog from the library table. */
async function openCalendar(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Edit ${name}` }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** The nth start-time field of a weekday's hours group. */
function startOf(dialog: Locator, day: string, index: number): Locator {
  return dialog
    .getByRole('group', { name: `${day} hours` })
    .getByRole('textbox', { name: /^Start time/ })
    .nth(index);
}

/** The nth end-time field of a weekday's hours group. */
function endOf(dialog: Locator, day: string, index: number): Locator {
  return dialog
    .getByRole('group', { name: `${day} hours` })
    .getByRole('textbox', { name: /^End time/ })
    .nth(index);
}
