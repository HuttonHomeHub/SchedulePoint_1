import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';
import { pickAddKind } from '../e2e-support/toolbar';

import {
  WBS_PLAN,
  diagramList,
  ensurePen,
  groupPlaces,
  gutterLabels,
  manageButton,
  openActivityEditor,
  openManageFromView,
  openStructure,
  openWbsPlan,
  storedWbsActivities,
} from './support';

/**
 * **Swimlanes from the WBS, on the diagram** (`docs/specs/swimlanes/`, M3-T2, ADR-0081): the
 * milestone's journey. It drives the setup dialog's second option, the activity editor's Breakdown,
 * the canvas drag and the source switch, against the lanes and parents the API stored.
 *
 * The plan is built through the public API (`openWbsPlan`): two level-1 summaries with two tasks each
 * and one task under neither. Nothing is linked, so every task starts at the data date and any two in
 * one swimlane overlap in time — which is what gives "no overlap" and "a drag stops at the edge" a
 * claim that can fail.
 *
 * What only a browser can say is here: that a pointer drag across a swimlane edge is stopped while it
 * is in progress and nothing is refused by the server (SQ-5), that the label of a swimlane is its
 * summary's name the moment the summary is renamed, and that switching source back and forth writes
 * no activity.
 */

/** Every non-GET request that touches an activity, so "no write" is a fact about the wire. */
function recordActivityWrites(page: Page): { writes: string[]; failed: string[] } {
  const seen = { writes: [] as string[], failed: [] as string[] };
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/activities')) {
      seen.writes.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    const request = response.request();
    if (request.method() !== 'GET' && request.url().includes('/activities') && !response.ok()) {
      seen.failed.push(`${String(response.status())} ${request.method()} ${request.url()}`);
    }
  });
  return seen;
}

/** The text of every option on the diagram's listbox, in a stable order. */
async function allSentences(page: Page): Promise<string[]> {
  return (await diagramList(page).getByRole('option').allTextContents()).sort();
}

/**
 * The page point of a bar, found by clicking down the swimlane band it should be in and reading which
 * option the click made active. A click on empty ground leaves the previous option active, so a hit
 * counts only when the active option CHANGED to the one asked for.
 */
async function findBar(page: Page, name: string): Promise<{ x: number; y: number }> {
  const list = diagramList(page);
  const gutter = (await page.getByTestId('tsld-swimlane-gutter').boundingBox())!;
  const region = (await page
    .locator('section[aria-label="Time-scaled logic diagram"]')
    .boundingBox())!;
  const left = gutter.x + gutter.width;
  const activeText = async (): Promise<string> => {
    const id = await list.getAttribute('aria-activedescendant');
    return id === null ? '' : ((await page.locator(`[id="${id}"]`).textContent()) ?? '');
  };
  let last = await activeText();
  for (let y = region.y + 12; y < region.y + region.height - 4; y += 9) {
    for (const dx of [14, 36, 64, 100, 150]) {
      await page.mouse.click(left + dx, y);
      const now = await activeText();
      if (now !== last && now.startsWith(name)) return { x: left + dx, y };
      last = now;
    }
  }
  throw new Error(`no bar for "${name}" was found under the scene`);
}

test.describe('swimlanes from the WBS', () => {
  test('a planner sets up from the WBS, edits the WBS, and the swimlanes follow', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const orgSlug = await openWbsPlan(page, Date.now());
    await ensurePen(page);
    const list = diagramList(page);
    const labels = gutterLabels(page);
    const wire = recordActivityWrites(page);

    await test.step('1. View ▾ ▸ Structure ▸ Set up swimlanes… ▸ One per WBS group', async () => {
      const panel = await openStructure(page);
      await manageButton(panel).click();
      const dialog = page.getByRole('dialog', { name: 'Set up swimlanes', exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('radio', { name: /One per WBS group/ }).click();
      // The shallowest level with two groups is preselected.
      await expect(dialog.getByLabel('WBS level')).toHaveValue('1');
      await dialog.getByRole('button', { name: 'Set up swimlanes', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId('tsld-swimlane-gutter')).toBeVisible({ timeout: 15_000 });
    });

    await test.step('2. one swimlane per summary, with its tasks in it and the rest in No swimlane', async () => {
      for (const summary of WBS_PLAN.summaries) {
        await expect(
          labels.getByRole('button', { name: new RegExp(`^${summary}, swimlane \\d+ of \\d+`) }),
        ).toHaveCount(1);
      }
      for (const task of WBS_PLAN.tasks) {
        const home = task.parent ?? 'No swimlane';
        const group = list.getByRole('group', { name: home, exact: true });
        await expect(group.getByRole('option').filter({ hasText: task.name })).toHaveCount(1);
      }
      // Setting up from the WBS writes the plan's source and nothing about any activity.
      expect(wire.writes).toEqual([]);
    });

    await test.step('3. renaming a summary renames its swimlane', async () => {
      const editor = await openActivityEditor(page, 'Substructure');
      await editor.getByLabel('Name').fill('Groundworks');
      await editor.getByRole('button', { name: 'Save general' }).click();
      await expect(editor.getByText('Saved.').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(editor).toBeHidden();
      await expect(
        labels.getByRole('button', { name: /^Groundworks, swimlane \d+ of \d+/ }),
      ).toHaveCount(1);
      await expect(
        labels.getByRole('button', { name: /^Substructure, swimlane \d+ of \d+/ }),
      ).toHaveCount(0);
      const group = list.getByRole('group', { name: 'Groundworks', exact: true });
      await expect(group.getByRole('option').filter({ hasText: 'Pile caps' })).toHaveCount(1);
    });

    await test.step('4. changing a task’s Breakdown moves it into the other group, overlapping nothing', async () => {
      const editor = await openActivityEditor(page, 'Pile caps');
      const parent = editor.getByLabel('Parent WBS summary', { exact: true });
      const value = await parent
        .getByRole('option', { name: /Superstructure/ })
        .getAttribute('value');
      expect(value, 'the picker offers the other summary').toBeTruthy();
      await parent.selectOption(value);
      await editor.getByRole('button', { name: 'Save general' }).click();
      await expect(editor.getByText('Saved.').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(editor).toBeHidden();

      const superstructure = list.getByRole('group', { name: 'Superstructure', exact: true });
      await expect(superstructure.getByRole('option').filter({ hasText: 'Pile caps' })).toHaveCount(
        1,
      );
      const groundworks = list.getByRole('group', { name: 'Groundworks', exact: true });
      await expect(groundworks.getByRole('option').filter({ hasText: 'Pile caps' })).toHaveCount(0);

      // Every task starts on the same day, so a lane shared by two of them would be an overlap.
      await expect
        .poll(
          async () => {
            const lanes = (await groupPlaces(superstructure)).map((p) => p.lane);
            return new Set(lanes).size === lanes.length;
          },
          { message: 'no two bars in Superstructure share a lane' },
        )
        .toBe(true);

      const stored = await storedWbsActivities(page, orgSlug);
      expect(stored['Pile caps']!.parentId).toBe(stored['Steel frame']!.parentId);
    });

    await test.step('5. a drag stops at the swimlane edge, and nothing is re-filed or refused', async () => {
      const before = await storedWbsActivities(page, orgSlug);
      const grabbed = await findBar(page, 'Ground slab');
      const region = (await page
        .locator('section[aria-label="Time-scaled logic diagram"]')
        .boundingBox())!;
      const failedBefore = wire.failed.length;

      // Straight down, past Groundworks and Superstructure and into the foot of the scene.
      await page.mouse.move(grabbed.x, grabbed.y);
      await page.mouse.down();
      await page.mouse.move(grabbed.x, (grabbed.y + region.y + region.height) / 2, { steps: 6 });
      await page.mouse.move(grabbed.x, region.y + region.height - 6, { steps: 6 });
      await page.mouse.up();
      await page.waitForLoadState('networkidle');

      const groundworks = list.getByRole('group', { name: 'Groundworks', exact: true });
      await expect(groundworks.getByRole('option').filter({ hasText: 'Ground slab' })).toHaveCount(
        1,
      );
      const after = await storedWbsActivities(page, orgSlug);
      expect(after['Ground slab']!.parentId, 'a drag does not re-file').toBe(
        before['Ground slab']!.parentId,
      );
      // The gesture ends inside the swimlane, so the server is never asked to cross: no write the
      // drag made was refused (before the clamp, the ghost crossed and the positions write was a 422).
      expect(wire.failed.slice(failedBefore), 'no write of the drag was refused').toEqual([]);
    });

    await test.step('6. by hand and back: the swimlanes return unchanged and no activity is written', async () => {
      const sentences = await allSentences(page);
      const stored = await storedWbsActivities(page, orgSlug);
      const writesBefore = wire.writes.length;

      let dialog = await openManageFromView(page);
      await dialog.getByRole('radio', { name: /By hand/ }).click();
      await dialog.getByRole('button', { name: 'Switch', exact: true }).click();
      await expect(page.getByTestId('announcer')).toContainText('Swimlanes are now made by hand.');
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
      // The summaries are no longer swimlanes.
      await expect(list.getByRole('group', { name: 'Groundworks', exact: true })).toHaveCount(0);

      dialog = await openManageFromView(page);
      await dialog.getByRole('radio', { name: /One per WBS group/ }).click();
      await dialog.getByRole('button', { name: 'Switch', exact: true }).click();
      await expect(page.getByTestId('announcer')).toContainText(
        'Swimlanes now follow the WBS at level 1.',
      );
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();

      await expect(list.getByRole('group', { name: 'Groundworks', exact: true })).toBeVisible();
      expect(await allSentences(page)).toEqual(sentences);
      expect(await storedWbsActivities(page, orgSlug)).toEqual(stored);
      expect(wire.writes.slice(writesBefore), 'switching source writes no activity').toEqual([]);
    });

    await test.step('7. axe finds nothing with swimlanes from the WBS on', async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  });

  test('an activity created inside a swimlane is filed under that swimlane’s summary', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await openWbsPlan(page, Date.now() + 1);
    await ensurePen(page);
    const list = diagramList(page);

    const panel = await openStructure(page);
    await manageButton(panel).click();
    const setup = page.getByRole('dialog', { name: 'Set up swimlanes', exact: true });
    await setup.getByRole('radio', { name: /One per WBS group/ }).click();
    await setup.getByRole('button', { name: 'Set up swimlanes', exact: true }).click();
    await expect(setup).toBeHidden();
    await expect(page.getByTestId('tsld-swimlane-gutter')).toBeVisible({ timeout: 15_000 });

    // A click on empty ground inside Superstructure's band, well right of the bars.
    const band = (await gutterLabels(page)
      .getByRole('button', { name: /^Superstructure, swimlane/ })
      .boundingBox())!;
    const gutter = (await page.getByTestId('tsld-swimlane-gutter').boundingBox())!;
    const region = (await page
      .locator('section[aria-label="Time-scaled logic diagram"]')
      .boundingBox())!;
    const left = gutter.x + gutter.width;
    await pickAddKind(page, 'Task');
    await page.mouse.click(left + (region.x + region.width - left) * 0.7, band.y + 10);
    const form = page.getByRole('form', { name: 'Name the new activity' });
    await form.getByLabel('Name').fill('Cladding');
    await form.getByRole('button', { name: 'Add to plan' }).click();
    await expect(form).toBeHidden();

    const superstructure = list.getByRole('group', { name: 'Superstructure', exact: true });
    await expect(superstructure.getByRole('option').filter({ hasText: 'Cladding' })).toHaveCount(1);
    const stored = await storedWbsActivities(page, orgSlug);
    expect(stored['Cladding']!.parentId, 'filed under Superstructure').toBe(
      stored['Steel frame']!.parentId,
    );
    expect(stored['Cladding']!.swimlaneId, 'no hand-made swimlane is named').toBeNull();
    // Its place in the swimlane was stored as a lane row, not left to be derived.
    expect(stored['Cladding']!.swimlaneLanes).not.toEqual([]);
  });
});
