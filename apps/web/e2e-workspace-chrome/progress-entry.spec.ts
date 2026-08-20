import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  findBar,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from './support';

/**
 * **Report progress lives on the object, and only there** (ADR-0093).
 *
 * `Report progress` was the only action in the plan workspace that existed twice — the command
 * surface's `update-progress` and the canvas dock's `progress` — with the same permission, the same
 * precondition and the same dialog. This journey pins the surface that survived, the surface that
 * did not, and the two facts the removal is only safe because of.
 *
 * **Why a journey and not a unit test**, since `selection-duplication.structural.test.ts` already
 * asserts the registry shape: that test proves the item is absent from a data structure. It cannot
 * prove a planner can still reach the dialog, which is the only claim that matters to a
 * Contributor — and ADR-0081 was written because a whole milestone once shipped with unit tests
 * validating code that had no entry point at all. The removal's risk is exactly that shape.
 *
 * Controls are located by `[data-toolbar-item]` rather than by their copy — the standing rule from
 * ADR-0091's retrospective, where three journeys broke on a label change.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 1500;

/** The command surface's Row 2, by its accessible name. */
function buildRow(page: Page) {
  return page.getByRole('toolbar', { name: 'Plan commands' });
}

test.describe('Progress entry', () => {
  test('lives on the canvas dock, is gone from the command surface, and survives in the Gantt', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Progress entry');
    await ensurePen(page);

    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0 },
      { name: 'Steel frame', laneIndex: 1 },
      { name: 'Cladding', laneIndex: 2 },
    ]);
    const [dig] = seeded;
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // ── The command surface does not offer it, at any selection state. ────────────────────────
    const commandCopy = buildRow(page).locator('[data-toolbar-item="update-progress"]');
    await expect(
      commandCopy,
      'the command surface carries plan- and view-level actions; this one acts on the selection',
    ).toHaveCount(0);

    // ── The dock offers it for a single selection, and it opens the dialog. ───────────────────
    await findBar(page, dig.id);
    const dock = page.getByRole('toolbar', { name: /^Actions for / });
    await expect(dock).toBeVisible();
    await expect(commandCopy, 'still absent with something selected').toHaveCount(0);

    await dock.getByRole('button', { name: 'Report progress' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog,
      'the dock route must reach the progress editor for the activity that was selected',
    ).toContainText(dig.name);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // ── A plural selection offers it nowhere. ─────────────────────────────────────────────────
    //
    // Before the removal this was the one inconsistency the change resolves for free: the ADR-0092
    // guard suppresses the singular dock bar at two or more selected, while the command-surface
    // item stayed enabled and acted on the primary. Both halves are asserted, because "the dock is
    // gone" alone would pass against a build that still offered the toolbar copy.
    //
    // `Ctrl+A` on the parallel listbox, NOT ctrl+click on the canvas: a Ctrl pointerdown also
    // starts a marquee (`TsldCanvas.tsx:1716`), so a ctrl-click is a toggle and a zero-size sweep
    // at once and the net selection stays at one. Established by watching it fail, not by reading.
    await page.getByRole('listbox').first().focus();
    await page.keyboard.press('ControlOrMeta+a');
    await expect(page.getByTestId('bulk-selection-bar')).toBeVisible();
    await expect(
      dock,
      'the plural bar replaces the singular one rather than joining it',
    ).toHaveCount(0);
    await expect(
      commandCopy,
      'nothing may offer a single-activity progress edit while several activities are selected',
    ).toHaveCount(0);

    // ── The Gantt keeps a route, which is what makes the removal safe there. ──────────────────
    //
    // The dock was canvas-only by construction, so removing the command copy left the Gantt with no
    // selection-driven action at all. The product owner accepted that on 2026-08-13 **on the stated
    // basis that the activities-table row menu reaches progress in that view**, with the proper
    // Gantt affordance inherited by the Gantt-editing epic (`docs/BACKLOG.md`). This assertion is
    // that basis. If it fails, the decision goes back to them rather than being patched here.
    //
    // **That inheritance has since landed (ADR-0095): the Gantt has its own docked bar and its own
    // row menu.** This assertion still holds, and now for a sharper reason — the selection above is
    // PLURAL, and no view may offer single-activity actions while several are selected (ADR-0093).
    // It caught the Gantt bar doing exactly that, because its host asserted `selectionCount: 1`
    // while the workspace selection survived the view switch. The singular case — a Gantt selection
    // DOES get the bar — is `e2e-gantt-editing/object-actions.spec.ts`, so it is not restated here.
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: /^Actions for / })).toHaveCount(0);

    // Scoped to the **activities table**, which is the route this section is about. Unscoped it now
    // matches the Gantt's own row menu too (ADR-0095 M5-T3) and fails strict mode — an ambiguity
    // created by the affordance this comment predicted, not by anything being wrong.
    await page.getByRole('button', { name: 'Expand activities panel' }).click();
    await page
      .getByRole('table', { name: 'Activities' })
      .getByRole('button', { name: `Actions for ${dig.name}` })
      .click();
    await expect(
      page.getByRole('menuitem', { name: 'Report progress' }),
      'the activities-table row menu is the Gantt route, and Q1 was answered on it working',
    ).toBeVisible();
  });
});
