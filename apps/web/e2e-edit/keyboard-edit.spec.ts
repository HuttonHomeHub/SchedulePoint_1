import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { addActivity, onboard, openNewPlan, setPlannedStart, startEditing } from './support';

/**
 * Flag-ON keyboard editing journey (TECH_DEBT #25b, partial #25a). Proves the M5 5.2
 * edit keymap runs end-to-end in a real browser with the editing surface enabled: a
 * Planner holds the pen, focuses the diagram's parallel listbox, and nudges an
 * activity by lane with `Alt+↓` — announced through the live region (no pointer-only
 * capability, WCAG 2.1.1). It also **automates the pre-enablement browser check**
 * (#25a): `Alt+←/→` (the time nudge) must NOT trigger native Back/Forward history
 * navigation — asserted here on Chromium (the cross-browser sweep stays manual).
 */
test('a planner nudges an activity by keyboard; Alt+arrows never navigate history', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);
  await setPlannedStart(page, '2026-01-01');
  await startEditing(page); // take the pen — editing affordances go live

  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');

  // Recalculate so the diagram has computed activities to plot + navigate.
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.getByText('Project finish')).toBeVisible();

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  const listbox = diagram.getByRole('listbox', { name: 'Activities in the diagram' });
  await expect(diagram.getByRole('option')).toHaveCount(2);

  // Focus the listbox — the first activity becomes the selection the edit keys act on.
  await listbox.focus();
  await expect(diagram.getByRole('option', { selected: true })).toHaveCount(1);

  // Alt+↓ nudges the focused activity down one lane; the outcome is announced (coalesced
  // to one net write). This proves the edit keymap is wired flag-on in a real browser.
  const announcer = page.getByTestId('announcer');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(announcer).toContainText(/lane 2/i);

  // #25a automation: Alt+←/→ is the time nudge and is preventDefault-ed so it can't fall
  // through to the browser's Back/Forward history accelerator. After a deep nav
  // (clients → client → project → plan) a real Back WOULD change the URL — assert it doesn't.
  const planUrl = page.url();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page).toHaveURL(planUrl);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page).toHaveURL(planUrl);

  // The flag-on editing surface remains accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
