import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../e2e-support/test';
import { pickAddKind, planCommands } from '../e2e-support/toolbar';

import {
  ACTIVITIES,
  SWIMLANE_NAMES,
  calculateSeededPlan,
  cursorTo,
  diagramList,
  ensurePen,
  expectFocusKept,
  expectFocused,
  gutterLabels,
  lensCheckbox,
  manageButton,
  openManageFromView,
  openPlainPlan,
  openSeededPlan,
  openStructure,
  option,
  optionSentences,
  plainLane,
  seedSwimlanes,
  selectPair,
  setLens,
  storedActivities,
  swimlanePlace,
  viewTrigger,
} from './support';

/**
 * **Swimlanes by hand, on the diagram** (`docs/specs/swimlanes/`, M2-T11, ADR-0081): the milestone's
 * entry point and the journey that is its gate. It drives `View ▾ ▸ Structure` to the dialog, the
 * selection bar to Move to swimlane…, the grouped listbox to the lane the product speaks, and the
 * lens off and on against the lanes the API stored (SC-1).
 *
 * The plan is the catalogue's `plan:capability-swimlanes`, which is already `MANUAL` with three
 * swimlanes, so the lens is on from first paint and the lens's button reads **Swimlanes…** rather than
 * **Set up swimlanes…** (that label is for a plan with none). The journey asks for the button by
 * either name, because which one it is is the plan's state and not the claim.
 *
 * The focus cases below are statements about `document.activeElement` after a dialog closes, a row is
 * deleted or a list is re-ordered. They are here because jsdom has no focus ring to lose (ADR-0111):
 * each asserts the exact element, never "not the body".
 */

test.describe('swimlanes by hand', () => {
  test('a planner sets up, assigns, moves and turns the lens off and on without losing anything', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await openSeededPlan(page, Date.now());
    const list = diagramList(page);

    // The stored lanes before anything is touched: the lens-off view must reproduce these exactly.
    const before = await storedActivities(page, orgSlug);
    expect(Object.keys(before)).toHaveLength(ACTIVITIES.length);

    await test.step('1. take the pen and calculate the plan, so every bar is drawn', async () => {
      await calculateSeededPlan(page);
    });

    await test.step('2–3. View ▾ ▸ Structure ▸ the lens button opens the dialog, and Mechanical is created', async () => {
      const panel = await openStructure(page);
      await expect(lensCheckbox(panel)).toBeChecked();
      await manageButton(panel).click();
      const dialog = page.getByRole('dialog', { name: 'Swimlanes', exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('New swimlane').fill('Mechanical');
      await dialog.getByRole('button', { name: 'Add swimlane' }).click();
      await expect(
        dialog.getByRole('list', { name: 'Swimlanes' }).getByText('Mechanical', { exact: true }),
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
      // The dialog returns to the control that opened it: View ▾ closed first, so it is the trigger.
      await expectFocused(page, viewTrigger(page));
      await expect(
        gutterLabels(page).getByRole('button', { name: /^Mechanical, swimlane \d+ of \d+/ }),
      ).toHaveCount(1);
    });

    await test.step('4. select two bars and Move to swimlane… ▸ Mechanical ▸ Move', async () => {
      await selectPair(page, 'Pile caps', 'Ground-bearing slab pour');
      const bar = page.getByTestId('bulk-selection-bar');
      const trigger = bar.getByRole('button', { name: 'Move to swimlane…' });
      await trigger.click();
      const popover = page.getByRole('dialog', { name: 'Move to swimlane…' });
      await expect(popover).toBeVisible();
      await popover.getByLabel('Move to', { exact: true }).selectOption({ label: 'Mechanical' });
      await popover.getByRole('button', { name: 'Move', exact: true }).click();
      await expect(popover).toBeHidden();
      // After the move, focus is back on the trigger that opened the panel (carry-forward: T9/T10).
      await expectFocused(page, trigger);
    });

    await test.step('5. both are in the "Mechanical" listbox group', async () => {
      const mechanical = list.getByRole('group', { name: 'Mechanical', exact: true });
      await expect(mechanical.getByRole('option')).toHaveCount(2);
      for (const name of ['Pile caps', 'Ground-bearing slab pour']) {
        await expect(mechanical.getByRole('option').filter({ hasText: name })).toHaveCount(1);
      }
      // Their dates were not touched by the move; both sit in the swimlane's first lane (they do
      // not overlap in time, so neither needed pushing down).
      await expect(option(page, 'Pile caps')).toContainText(/in Mechanical, lane 1 of 1/);
    });

    await test.step('6. Alt+↓ moves one bar down a lane inside Mechanical', async () => {
      await list.focus();
      await list.press('Escape');
      await cursorTo(page, 'Pile caps');
      await list.press('Alt+ArrowDown');
      await expect(option(page, 'Pile caps')).toContainText(/in Mechanical, lane 2 of 2/);
      // The live region says it in the swimlane's terms, never a bare "lane 2" (the C9 form).
      await expect(page.getByTestId('announcer')).toContainText(
        /Moved “Pile caps”.*Mechanical, lane 2 of 2/,
      );
    });

    const inSwimlanes = await optionSentences(page);
    const placed = new Map([...inSwimlanes].map(([name, text]) => [name, swimlanePlace(text)]));

    await test.step('7. the lens off: every option’s lane is its stored laneIndex, read from the API (SC-1)', async () => {
      await setLens(page, false);
      await expect(page.getByTestId('tsld-swimlane-gutter')).toBeHidden();
      const sentences = await optionSentences(page);
      for (const { name } of ACTIVITIES) {
        expect(plainLane(sentences.get(name)!), `${name}’s lane with swimlanes off`).toBe(
          before[name]!.laneIndex + 1,
        );
      }
      // The API agrees that nothing wrote a lane: turning the lens off is not a migration.
      const after = await storedActivities(page, orgSlug);
      for (const { name } of ACTIVITIES) {
        expect(after[name]!.laneIndex, `${name}’s stored laneIndex`).toBe(before[name]!.laneIndex);
      }
    });

    await test.step('8. the lens on again: the same lanes inside the swimlanes', async () => {
      await setLens(page, true);
      await expect(page.getByTestId('tsld-swimlane-gutter')).toBeVisible();
      await expect(option(page, 'Pile caps')).toContainText(/in Mechanical, lane 2 of 2/);
      const sentences = await optionSentences(page);
      for (const { name } of ACTIVITIES) {
        expect(swimlanePlace(sentences.get(name)!), `${name}’s place`).toBe(placed.get(name));
      }
    });

    await test.step('9. Undo twice reverses the nudge and the assignment', async () => {
      const undo = planCommands(page).getByRole('button', { name: /^Undo\b/ });
      await undo.click();
      await expect(option(page, 'Pile caps')).toContainText(/in Mechanical, lane 1 of 1/);
      await undo.click();
      const mechanical = list.getByRole('group', { name: 'Mechanical', exact: true });
      await expect(mechanical.getByRole('option')).toHaveCount(0);
      const substructure = list.getByRole('group', { name: SWIMLANE_NAMES[0], exact: true });
      await expect(substructure.getByRole('option')).toHaveCount(2);
      // At the API, not only on the screen: both are filed where they started.
      const after = await storedActivities(page, orgSlug);
      for (const name of ['Pile caps', 'Ground-bearing slab pour']) {
        expect(after[name]!.swimlaneId, `${name}’s stored swimlane`).toBe(before[name]!.swimlaneId);
      }
    });

    await test.step('10. the create popover opens at the click point, with the gutter expanded', async () => {
      const gutter = page.getByTestId('tsld-swimlane-gutter');
      const gutterBox = (await gutter.boundingBox())!;
      // 176 px is the expanded gutter and 44 the collapsed strip (`swimlane-gutter.ts`).
      expect(gutterBox.width, 'the gutter is expanded').toBeGreaterThan(100);
      await expect(page.getByRole('button', { name: 'Swimlane names' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      // A click inside the "No swimlane" band, well right of the bars, so it lands on empty ground.
      const noSwimlane = gutterLabels(page).getByRole('button', { name: /^No swimlane/ });
      const bandBox = (await noSwimlane.boundingBox())!;
      const region = (await page
        .locator('section[aria-label="Time-scaled logic diagram"]')
        .boundingBox())!;
      const sceneLeft = gutterBox.x + gutterBox.width;
      const x = sceneLeft + (region.x + region.width - sceneLeft) * 0.7;
      const y = bandBox.y + Math.min(12, bandBox.height / 2);

      await pickAddKind(page, 'Task');
      await page.mouse.click(x, y);
      const form = page.getByRole('form', { name: 'Name the new activity' });
      await expect(form).toBeVisible();
      const formBox = (await form.boundingBox())!;
      expect(
        Math.abs(formBox.x - x),
        `popover left ${formBox.x} vs click ${x}`,
      ).toBeLessThanOrEqual(12);
      expect(Math.abs(formBox.y - y), `popover top ${formBox.y} vs click ${y}`).toBeLessThanOrEqual(
        12,
      );
      await page.keyboard.press('Escape');
      await expect(form).toBeHidden();
    });

    await test.step('11. axe finds nothing with swimlanes on', async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  });

  test('closing the dialog View ▾ opened returns focus to the View trigger, by button or by Escape', async ({
    page,
  }) => {
    await openSeededPlan(page, Date.now() + 1);
    await ensurePen(page);

    const dialog = await openManageFromView(page);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectFocused(page, viewTrigger(page));

    await openManageFromView(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expectFocused(page, viewTrigger(page));
  });

  test('deleting from the gutter menu lands focus on the neighbouring label, then somewhere in the product', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSeededPlan(page, Date.now() + 2);
    await ensurePen(page);
    const labels = gutterLabels(page);
    const confirm = page.getByRole('button', { name: 'Delete swimlane', exact: true });

    const deleteViaMenu = async (label: RegExp): Promise<void> => {
      await labels.getByRole('button', { name: label }).click();
      await page.getByRole('menuitem', { name: 'Delete…' }).click();
      await confirm.click();
      await expect(confirm).toBeHidden();
    };

    // The middle swimlane goes: focus lands on the one after it, never on <body>.
    await deleteViaMenu(/^Électricité/);
    await expectFocused(page, labels.getByRole('button', { name: /^Mechanical, plumbing/ }));

    // Then the rest, down to the last named swimlane: the plan then reads as not set up and the gutter
    // can go with it, taking "No swimlane" too, so focus lands on the View ▾ trigger or the listbox.
    await deleteViaMenu(/^Mechanical, plumbing/);
    await deleteViaMenu(/^Substructure/);
    await expectFocusKept(page);
  });

  test('deleting in Manage lands focus on the next row’s Rename, and the New swimlane field when none is left', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSeededPlan(page, Date.now() + 3);
    await ensurePen(page);
    const dialog = await openManageFromView(page);

    const deleteRow = async (prefix: string): Promise<void> => {
      await dialog.getByRole('button', { name: new RegExp(`^Delete ${prefix}`) }).click();
      await page.getByRole('button', { name: 'Delete swimlane', exact: true }).click();
    };

    await deleteRow('Substructure');
    await expectFocused(page, dialog.getByRole('button', { name: /^Rename Électricité/ }));

    await deleteRow('Électricité');
    await expectFocused(page, dialog.getByRole('button', { name: /^Rename Mechanical, plumbing/ }));

    // The last row: there is no neighbour, so the field that adds one takes focus.
    await deleteRow('Mechanical, plumbing');
    await expectFocused(page, dialog.getByLabel('New swimlane'));
  });

  test('Rename opens with the caret in the Name field, from Manage and from the gutter menu', async ({
    page,
  }) => {
    await openSeededPlan(page, Date.now() + 4);
    await ensurePen(page);

    const expectNameFieldHoldsFocus = async (): Promise<void> => {
      const rename = page.getByRole('dialog', { name: 'Rename swimlane' });
      await expect(rename).toBeVisible();
      const field = rename.getByLabel('Name', { exact: true });
      await expectFocused(page, field);
      // The whole name is selected, so typing replaces it: the caret is in the field, not on Close.
      const selection = await field.evaluate((el: HTMLInputElement) => ({
        length: el.value.length,
        start: el.selectionStart,
        end: el.selectionEnd,
      }));
      expect(selection.start).toBe(0);
      expect(selection.end).toBe(selection.length);
      await page.keyboard.press('Escape');
      await expect(rename).toBeHidden();
    };

    const manage = await openManageFromView(page);
    await manage.getByRole('button', { name: /^Rename Substructure/ }).click();
    await expectNameFieldHoldsFocus();
    await manage.getByRole('button', { name: 'Close', exact: true }).click();

    await gutterLabels(page)
      .getByRole('button', { name: /^Électricité/ })
      .click();
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    await expectNameFieldHoldsFocus();
  });

  test('Move up and Move down keep focus on the control that asked, in Manage and in the gutter menu', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSeededPlan(page, Date.now() + 5);
    await ensurePen(page);

    const manage = await openManageFromView(page);
    const down = manage.getByRole('button', { name: /^Move Substructure.* down$/ });
    const up = manage.getByRole('button', { name: /^Move Substructure.* up$/ });
    await down.click();
    // The row it sat in has moved; the control for the same swimlane takes focus back.
    await expectFocused(page, down);
    await up.click();
    await expectFocused(page, up);
    await manage.getByRole('button', { name: 'Close', exact: true }).click();

    // From the gutter: the label that opened the menu is the label focus returns to after the move.
    const label = gutterLabels(page).getByRole('button', { name: /^Substructure/ });
    await label.click();
    await page.getByRole('menuitem', { name: 'Move down' }).click();
    await expectFocused(page, label);
  });

  test('Escape on a Rename stacked over Manage closes only the Rename, and returns to its row', async ({
    page,
  }) => {
    await openSeededPlan(page, Date.now() + 6);
    await ensurePen(page);
    const manage = await openManageFromView(page);

    const rename = manage.getByRole('button', { name: /^Rename Électricité/ });
    await rename.click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename swimlane' });
    await expect(renameDialog).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(renameDialog).toBeHidden();
    await expect(manage, 'Manage is still open').toBeVisible();
    await expectFocused(page, rename);

    // The second Escape closes Manage, which View ▾ opened.
    await page.keyboard.press('Escape');
    await expect(manage).toBeHidden();
    await expectFocused(page, viewTrigger(page));
  });

  test('ArrowRight and Shift+F10 open a label’s menu, and Escape returns to the label', async ({
    page,
  }) => {
    await openSeededPlan(page, Date.now() + 7);
    await ensurePen(page);
    const label = gutterLabels(page).getByRole('button', { name: /^Substructure/ });
    const menu = page.getByRole('menu', { name: /^Actions for / });

    await label.focus();
    await page.keyboard.press('ArrowRight');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expectFocused(page, label);

    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expectFocused(page, label);
  });

  test('a label panned out of view is parked, and taking focus brings it in and un-parks it', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const orgSlug = await openSeededPlan(page, Date.now() + 8);
    await ensurePen(page);
    // Enough swimlanes that the last ones are below the fold of the diagram.
    await seedSwimlanes(page, orgSlug, 30);
    await page.reload();
    await expect(page.getByTestId('tsld-swimlane-gutter')).toBeVisible({ timeout: 15_000 });

    const labels = gutterLabels(page).locator('button[data-swimlane]');
    const parked = gutterLabels(page).locator('button[data-swimlane][data-parked="true"]');
    await expect
      .poll(async () => parked.count(), { message: 'some label is parked' })
      .toBeGreaterThan(0);

    const key = await parked.last().getAttribute('data-swimlane');
    expect(key).not.toBeNull();
    const same = gutterLabels(page).locator(`button[data-swimlane="${key!}"]`);

    // Arrive the way the roving stop allows: the first label, then End.
    await labels.first().focus();
    await page.keyboard.press('End');
    await expectFocused(page, same);
    await expect(same).not.toHaveAttribute('data-parked', 'true');
    await expect(same).toBeInViewport();

    // Tab leaves the gutter and Shift+Tab comes back to the same stop, still un-parked.
    await page.keyboard.press('Tab');
    await expect(same).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expectFocused(page, same);
    await expect(same).not.toHaveAttribute('data-parked', 'true');
  });

  test('Set up swimlanes… on a plan with none: focus returns to View ▾ after Cancel, Escape and a successful setup', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openPlainPlan(page, Date.now() + 12);
    await ensurePen(page);
    const dialog = page.getByRole('dialog', { name: 'Set up swimlanes', exact: true });
    const names = dialog.getByLabel('Swimlane names, one per line');

    const openSetup = async (): Promise<void> => {
      const panel = await openStructure(page);
      await panel.getByRole('button', { name: 'Set up swimlanes…', exact: true }).click();
      await expect(dialog).toBeVisible();
    };

    await test.step('before setup the lens is shut and says why', async () => {
      const panel = await openStructure(page);
      const lens = lensCheckbox(panel);
      await expect(lens).toHaveAttribute('aria-disabled', 'true');
      await expect(lens).toHaveAccessibleDescription(/No swimlanes have been set up/);
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    });

    await test.step('Cancel returns focus to View ▾', async () => {
      await openSetup();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expectFocused(page, viewTrigger(page));
    });

    await test.step('Escape returns focus to View ▾', async () => {
      await openSetup();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expectFocused(page, viewTrigger(page));
    });

    await test.step('submitting nothing names the problem and puts the caret in the field', async () => {
      await openSetup();
      await dialog.getByRole('button', { name: 'Set up swimlanes', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Enter at least one swimlane name.');
      await expectFocused(page, names);
    });

    await test.step('a name per line sets the plan up, returns focus to View ▾ and makes the lens usable', async () => {
      await names.fill('Civil\nMechanical');
      await dialog.getByRole('button', { name: 'Set up swimlanes', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expectFocused(page, viewTrigger(page));
      await expect(page.getByTestId('tsld-swimlane-gutter')).toBeVisible({ timeout: 15_000 });
      await expect(
        gutterLabels(page).getByRole('button', { name: /^Civil, swimlane 1 of 2/ }),
      ).toHaveCount(1);
      const panel = await openStructure(page);
      const lens = lensCheckbox(panel);
      await expect(lens).toBeChecked();
      await expect(lens).not.toHaveAttribute('aria-disabled', 'true');
      await expect(manageButton(panel)).toHaveText('Swimlanes…');
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    });

    await test.step('deleting the last named swimlane never drops focus to the page', async () => {
      const labels = gutterLabels(page);
      const confirm = page.getByRole('button', { name: 'Delete swimlane', exact: true });
      for (const name of [/^Civil/, /^Mechanical/]) {
        await labels.getByRole('button', { name }).click();
        await page.getByRole('menuitem', { name: 'Delete…' }).click();
        await confirm.click();
        await expect(confirm).toBeHidden();
      }
      await expectFocusKept(page);
    });
  });

  test('the single-activity Move to swimlane… popover keeps its arrows, closes on Escape and hands focus back', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openSeededPlan(page, Date.now() + 14);
    await calculateSeededPlan(page);
    const list = diagramList(page);
    await list.focus();
    await list.press('Escape');
    await cursorTo(page, 'Pile caps');

    const bar = page.getByRole('toolbar', { name: 'Actions for Pile caps' });
    const trigger = bar.getByRole('button', { name: 'Move to swimlane…' });
    const popover = page.getByRole('dialog', { name: 'Move to swimlane…' });
    const select = popover.getByLabel('Move to', { exact: true });

    await test.step('opening puts focus on the select', async () => {
      await trigger.click();
      await expect(popover).toBeVisible();
      await expectFocused(page, select);
    });

    await test.step('the arrows stay in the select, and do not rove the toolbar', async () => {
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
        await page.keyboard.press(key);
        await expectFocused(page, select);
      }
    });

    await test.step('Escape closes the popover and returns focus to its trigger', async () => {
      await page.keyboard.press('Escape');
      await expect(popover).toBeHidden();
      await expectFocused(page, trigger);
    });

    await test.step('Move lands, and focus is on the trigger afterwards', async () => {
      await trigger.click();
      await select.selectOption({ label: 'No swimlane' });
      await popover.getByRole('button', { name: 'Move', exact: true }).click();
      await expect(popover).toBeHidden();
      await expectFocused(page, trigger);
      await expect(
        list.getByRole('group', { name: 'No swimlane', exact: true }).getByRole('option').filter({
          hasText: 'Pile caps',
        }),
      ).toHaveCount(1);
    });
  });

  test('the selection bar shades Move to swimlane… with the way out while swimlanes are off', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSeededPlan(page, Date.now() + 15);
    await ensurePen(page);
    await setLens(page, false);
    const list = diagramList(page);
    await list.focus();
    await list.press('Escape');
    await cursorTo(page, 'Pile caps');
    const trigger = page
      .getByRole('toolbar', { name: 'Actions for Pile caps' })
      .getByRole('button', { name: 'Move to swimlane…' });
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await expect(trigger).toHaveAccessibleDescription(
      'Turn on Swimlanes in View to move activities between them.',
    );
  });

  test('the minimap’s readout names the swimlanes in view, never bare lane numbers', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSeededPlan(page, Date.now() + 16);
    await calculateSeededPlan(page);
    const toggle = page
      .getByRole('toolbar', { name: 'Diagram viewport' })
      .getByRole('button', { name: 'Minimap' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    const minimap = page.getByTestId('tsld-minimap');
    await expect(minimap).toBeVisible();
    await minimap.focus();
    await page.keyboard.press('Home');
    const announcer = page.getByTestId('announcer');
    await expect(announcer).toContainText(/Viewing .+, .*swimlane/);
    await expect(announcer).not.toContainText(/, lanes \d+–\d+\./);
  });
});

/**
 * **The floor** (1024 × 600, ADR-0179): what `View ▾` costs with the lens lit and Structure expanded,
 * and whether the gutter has room to stay expanded. Neither is a unit-testable fact — they are about
 * a real layout.
 */
test.describe('the 1024 × 600 floor', () => {
  test('View ▾ with the lens lit holds the house bar folded, and every swimlane control is reachable unfolded', async ({
    page,
  }) => {
    await openSeededPlan(page, Date.now() + 9);
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.waitForTimeout(500);
    // The pen is NOT held: the lens's button then carries its reason line, which is the tallest it gets.
    await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();

    // SC-13 (`assertViewPanelFitsTheFloor`): at most 420 px and no inner scroll in the default, folded
    // state. An unfolded section may scroll inside the panel, provided every control can be reached.
    await viewTrigger(page).click();
    const panel = page.getByRole('dialog', { name: /^View/ });
    await expect(panel).toBeVisible();
    const folded = await panel.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      scrollable: el.scrollHeight - el.clientHeight,
      viewport: window.innerHeight,
    }));
    test.info().annotations.push({
      type: 'view-panel-folded',
      description: `${String(folded.height)} px of ${String(folded.viewport)}, inner scroll ${String(folded.scrollable)} px`,
    });
    expect(
      folded.height,
      `View ▾ is ${String(folded.height)} px of ${String(folded.viewport)} at the floor`,
    ).toBeLessThanOrEqual(420);
    expect(
      folded.scrollable,
      'View ▾ scrolls inside itself in its default state',
    ).toBeLessThanOrEqual(1);

    const structure = panel.getByRole('button', { name: /^Structure/ });
    await structure.click();
    await expect(structure).toHaveAttribute('aria-expanded', 'true');
    for (const control of [lensCheckbox(panel), manageButton(panel)]) {
      await control.scrollIntoViewIfNeeded();
      const hit = await control.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          ok:
            top !== null &&
            (top === el || el.contains(top) || top.closest('label')?.contains(el) === true),
          found:
            top === null
              ? 'nothing'
              : `${top.tagName.toLowerCase()} ${top.textContent ?? ''}`.slice(0, 60),
          box: `${String(Math.round(box.top))}-${String(Math.round(box.bottom))} of ${String(window.innerHeight)}`,
        };
      });
      expect(
        hit.ok,
        `a swimlane control cannot be reached by a pointer: ${hit.found} at ${hit.box}`,
      ).toBe(true);
    }
  });

  test('the diagram’s width at the floor, rail open and closed, decides whether the gutter is forced shut', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openSeededPlan(page, Date.now() + 10);
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.waitForTimeout(500);

    // `GUTTER_MIN_CONTAINER_PX` (`swimlane-gutter.ts`): 176 px gutter + 600 px of stage.
    const THRESHOLD = 776;
    const region = page.locator('section[aria-label="Time-scaled logic diagram"]');
    const gutter = page.getByTestId('tsld-swimlane-gutter');
    const toggle = page.getByRole('button', { name: 'Swimlane names' });

    const read = async (railState: string): Promise<{ width: number; forced: boolean }> => {
      const width = (await region.boundingBox())!.width;
      const gutterWidth = (await gutter.boundingBox())!.width;
      const collapsed = gutterWidth < 100;
      const shut = (await toggle.getAttribute('aria-disabled')) === 'true';
      test.info().annotations.push({
        type: `floor-${railState}`,
        description: `diagram ${String(width)} px wide; gutter ${String(gutterWidth)} px (${collapsed ? 'collapsed' : 'expanded'}); expand control ${shut ? 'shaded' : 'live'}`,
      });
      // The preference is "expanded" on a fresh profile, so a collapsed gutter here was forced; the
      // control says so by being shaded with the no-room reason.
      expect(shut, `shaded exactly when collapsed at ${String(width)} px (${railState})`).toBe(
        collapsed,
      );
      return { width, forced: collapsed };
    };

    const open = await read('rail-open');
    await page.getByRole('button', { name: 'Hide Project Explorer' }).click();
    await page.waitForTimeout(500);
    const closed = await read('rail-closed');

    // The rule, asserted where it is not on the knife-edge: a diagram narrower than the threshold has
    // its gutter forced shut and one wider keeps it open.
    for (const reading of [open, closed]) {
      if (Math.abs(reading.width - THRESHOLD) > 8) {
        expect(reading.forced, `forced collapse at ${String(reading.width)} px`).toBe(
          reading.width < THRESHOLD,
        );
      }
    }
    expect(closed.width).toBeGreaterThan(open.width);
  });

  test('a window too narrow for the names collapses the gutter and says so', async ({ page }) => {
    test.setTimeout(120_000);
    await openSeededPlan(page, Date.now() + 13);
    // Far enough below the floor that the diagram is narrower than the gutter's 776 px threshold
    // whatever the rail is doing.
    await page.setViewportSize({ width: 700, height: 600 });
    await expect(page.getByTestId('announcer')).toContainText(
      'Swimlane names collapsed: there is not enough room to show them.',
    );
    const toggle = page.getByRole('button', { name: 'Swimlane names' });
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect((await page.getByTestId('tsld-swimlane-gutter').boundingBox())!.width).toBeLessThan(100);
  });
});

test.describe('the lens is a View ▾ row only', () => {
  test('the Swimlanes lens has no button of its own on the command deck', async ({ page }) => {
    await openSeededPlan(page, Date.now() + 11);
    await expect(planCommands(page).locator('[data-toolbar-item="swimlanes"]')).toHaveCount(0);
    const panel = await openStructure(page);
    await expect(lensCheckbox(panel)).toBeVisible();
  });
});
