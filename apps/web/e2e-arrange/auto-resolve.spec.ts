import { expect, test, type Page } from '@playwright/test';

import {
  createPlan,
  ensurePen,
  lanesByName,
  onboard,
  openProject,
  placeRelativeTo,
  recalculate,
  seedActivities,
} from './support';

/**
 * **An edit moves only the bar that caused it** (NetPoint-layout M3, ADR-0153), end to end.
 *
 * The product owner's report was two bars drawn on top of each other after an edit. The rule's
 * unit suites prove which bar it picks; only this can prove the whole loop — a real keyboard edit,
 * a real recalculation settling, a real batch write through the pen-enforced API, and the undo
 * step it records. Every lane is read back from the API, never from the canvas, which is
 * `aria-hidden` and could only say what was painted.
 */

function diagram(page: Page) {
  return page.getByRole('region', { name: 'Time-scaled logic diagram' });
}

/** Focus the diagram's listbox and walk it until `name` is the selected option. */
async function select(page: Page, name: string): Promise<void> {
  const listbox = diagram(page).getByRole('listbox', { name: 'Activities in the diagram' });
  await listbox.focus();
  for (let i = 0; i < 10; i += 1) {
    const selected = diagram(page).getByRole('option', { selected: true });
    if (((await selected.textContent()) ?? '').includes(name)) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`could not select ${name}`);
}

test('stretching a bar into its neighbour moves the stretched bar, once, and Undo puts it back', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Stretch');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Clad', laneIndex: 0, durationDays: 5 },
    { name: 'Dress', laneIndex: 0, durationDays: 5 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  // Dress starts the Monday after Clad finishes: same lane, touching nothing.
  await placeRelativeTo(page, orgSlug, 'Dress', 'Clad', 7);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect.poll(async () => lanesByName(page, orgSlug)).toEqual({ Clad: 0, Dress: 0 });

  // (1) One day longer: Clad now finishes on the day Dress starts, and inclusive spans overlap.
  await select(page, 'Clad');
  await page.keyboard.press('Shift+ArrowRight');

  // (2) Exactly ONE lane changed, and it is the bar the planner stretched (rule 1) — asserted at
  //     the database. Dress, which nobody touched, stays where it was.
  await expect
    .poll(async () => lanesByName(page, orgSlug), { timeout: 20_000 })
    .toEqual({ Clad: 1, Dress: 0 });

  // (3) Said in both channels, in one sentence.
  const sentence = 'Moved “Clad” to lane 2 so it no longer overlaps another activity.';
  const notice = page.getByTestId('canvas-layout-resolved');
  await expect(notice).toContainText(sentence);
  await expect(page.getByTestId('announcer')).toContainText(sentence);

  // (4) The notice's Undo reverses the MOVE, not the stretch — its own undo step (CQ-2) — and
  //     leaves focus on the diagram, not <body>: the strip unmounts under the pressed button.
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => lanesByName(page, orgSlug), { timeout: 15_000 })
    .toEqual({ Clad: 0, Dress: 0 });
  await expect(notice).toBeHidden();
  await expect(
    diagram(page).getByRole('listbox', { name: 'Activities in the diagram' }),
  ).toBeFocused();

  // (5) And an undo is never resolved against: the overlap it restores stays restored.
  await page.waitForTimeout(2_000);
  expect(await lanesByName(page, orgSlug)).toEqual({ Clad: 0, Dress: 0 });
});

test('a bar dropped onto an occupied lane goes on to the next free one, in one write', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Drop');
  await ensurePen(page);
  // Both start at the data date, so they overlap in time; only their lanes keep them apart.
  await seedActivities(page, orgSlug, [
    { name: 'Alpha', laneIndex: 0, durationDays: 5 },
    { name: 'Bravo', laneIndex: 1, durationDays: 5 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  await select(page, 'Alpha');
  await page.keyboard.press('Alt+ArrowDown');

  // Lane 1 is Bravo's: the drop goes on DOWN to lane 2, never back to the lane it left.
  await expect
    .poll(async () => lanesByName(page, orgSlug), { timeout: 15_000 })
    .toEqual({ Alpha: 2, Bravo: 1 });
  await expect(page.getByTestId('announcer')).toContainText(
    'Moved “Alpha” to lane 3, the next free lane.',
  );
});
