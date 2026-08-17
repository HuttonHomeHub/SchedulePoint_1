import { expect, test } from '@playwright/test';

import {
  addActivity,
  createAndOpenPlan,
  ensurePen,
  onboard,
  openEditor,
  openProject,
  showActivities,
} from './support';

/**
 * **The two surfaces that edit one activity agree** — driven against a real API with the pen
 * enforced (`docs/specs/activity-dialog-unification/`, M2).
 *
 * The create dialog and the tabbed editor rendered the same ~20 definition fields with **no shared
 * code**, and nine features' worth of additions had drifted them apart in ten places. M2 closed four
 * of those and moved identity, work and breakdown into components both hosts render.
 *
 * **This lands with M2 rather than at the end of the epic** (ADR-0081 §2): a milestone claiming a
 * user-facing capability names its entry point and proves it, because working through a task list
 * is evidence the tasks were done and not that a planner can reach the result. The unit suites here
 * mount each host in isolation and can therefore agree with themselves; only a real browser opening
 * **New activity** and then the same row's **Edit** compares what a planner actually sees.
 *
 * The comparison is deliberately made on **labels, hints and options** rather than a DOM snapshot.
 * The two hosts legitimately differ in layout — one is a scrolling form, the other a rail beside a
 * pane — so a structural comparison would fail on a difference that is not a divergence, and would
 * have to be loosened until it asserted nothing.
 */
test.describe('the create dialog and the editor agree', () => {
  test('a WBS summary is explained, and its parent picker named, identically on both', async ({
    page,
  }) => {
    const stamp = Date.now();
    await onboard(page, stamp);
    await openProject(page);
    await createAndOpenPlan(page, 'Convergence');
    await ensurePen(page);

    // A phase to nest under, and an activity to nest. Both are ordinary creates.
    await showActivities(page);
    await page.getByRole('button', { name: 'New activity' }).click();
    const create = page.getByRole('dialog');
    await create.getByLabel('Name').fill('Phase 1');
    await create.getByLabel('Code').fill('W1');

    // **The Work explanations (D5), on the create surface.** Selecting a WBS summary removes the
    // duration field, and before M2 the editor showed that happen with nothing said. Create has
    // always explained it; the assertion here is the reference the editor is held to below.
    await create.getByLabel('Type', { exact: true }).selectOption('WBS_SUMMARY');
    await expect(
      create.getByText('A WBS summary’s dates roll up from the activities grouped under it', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(create.getByLabel(/^Duration( \(working days\))?$/)).toHaveCount(0);

    // **The parent picker's label (D2).** "WBS summary" collides with the Type option of the same
    // name on this very form — which is why the editor disambiguated it, and why create adopted the
    // editor's label rather than the other way round.
    await expect(create.getByLabel('Parent WBS summary', { exact: true })).toBeVisible();
    await expect(create.getByLabel('WBS summary', { exact: true })).toHaveCount(0);

    await create.getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name: 'Phase 1', exact: true })).toBeVisible();

    // The same activity, opened the other way.
    await openEditor(page, 'Phase 1', 'Edit');
    const editor = page.getByRole('dialog');

    await expect(
      editor.getByText('A WBS summary’s dates roll up from the activities grouped under it', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(editor.getByLabel(/^Duration( \(working days\))?$/)).toHaveCount(0);
    await expect(editor.getByLabel('Parent WBS summary', { exact: true })).toBeVisible();
    await expect(editor.getByLabel('WBS summary', { exact: true })).toHaveCount(0);
  });

  test('a summary is offered by code and name wherever it is chosen', async ({ page }) => {
    const stamp = Date.now();
    await onboard(page, stamp);
    await openProject(page);
    await createAndOpenPlan(page, 'Breakdown');
    await ensurePen(page);

    await showActivities(page);
    await page.getByRole('button', { name: 'New activity' }).click();
    const summary = page.getByRole('dialog');
    await summary.getByLabel('Name').fill('Substructure');
    await summary.getByLabel('Code').fill('W1');
    await summary.getByLabel('Type', { exact: true }).selectOption('WBS_SUMMARY');
    await summary.getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name: 'Substructure', exact: true })).toBeVisible();

    // **The option's text (D2).** The editor listed a summary by name alone, so two phases sharing
    // a name were indistinguishable; both now carry the code a planner actually refers to.
    await showActivities(page);
    await page.getByRole('button', { name: 'New activity' }).click();
    const create = page.getByRole('dialog');
    await create.getByLabel('Name').fill('Pour slab');
    await create.getByLabel(/^Duration( \(working days\))?$/).fill('5');
    await expect(
      create
        .getByLabel('Parent WBS summary', { exact: true })
        .getByRole('option', { name: 'W1 · Substructure' }),
    ).toHaveCount(1);
    await create
      .getByLabel('Parent WBS summary', { exact: true })
      .selectOption({ label: 'W1 · Substructure' });
    await create.getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name: 'Pour slab', exact: true })).toBeVisible();

    await openEditor(page, 'Pour slab', 'Edit');
    const editor = page.getByRole('dialog');
    await expect(
      editor
        .getByLabel('Parent WBS summary', { exact: true })
        .getByRole('option', { name: 'W1 · Substructure' }),
    ).toHaveCount(1);
    // The stored parent round-trips: the picker shows the summary it was saved under, not "None".
    await expect(editor.getByLabel('Parent WBS summary', { exact: true })).not.toHaveValue('');
  });

  test('the duration type is explained the same way on both', async ({ page }) => {
    const stamp = Date.now();
    await onboard(page, stamp);
    await openProject(page);
    await createAndOpenPlan(page, 'Duration type');
    await ensurePen(page);
    await addActivity(page, 'Excavate');

    // The hint is reached through `aria-describedby`, which is how a screen-reader user reaches it
    // — comparing the rendered paragraph would pass on two controls that point at neither.
    const hintOf = async (scope: 'create' | 'editor'): Promise<string> => {
      const control = page.getByRole('dialog').getByLabel('Duration type', { exact: true });
      const ids = ((await control.getAttribute('aria-describedby')) ?? '')
        .split(/\s+/)
        .filter(Boolean);
      expect(ids.length, `${scope}: the duration type points at no description`).toBeGreaterThan(0);
      const parts = await Promise.all(ids.map((id) => page.locator(`#${id}`).textContent()));
      return parts.map((part) => part ?? '').join(' ');
    };

    await openEditor(page, 'Excavate', 'Edit');
    const editorHint = await hintOf('editor');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

    await showActivities(page);
    await page.getByRole('button', { name: 'New activity' }).click();
    const createHint = await hintOf('create');

    expect(createHint).toContain('Defaults to “Fixed duration & units/time”.');
    expect(editorHint).toBe(createHint);
  });
});
