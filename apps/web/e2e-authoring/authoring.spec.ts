import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../e2e-support/test';

import { canvas, drawActivity, onboard, openNewPlan, startEditing } from './support';

/**
 * **Canvas-first plan authoring** journey (ADR-0032) — the layer
 * above ADR-0031's toolbar workspace. Proves the whole authoring loop runs in a real browser:
 *
 * 1. A brand-new plan opens on a **draw-ready blank canvas** (anchored to today) — the diagram region
 *    is present with zero activities, not the "recalculate first" empty state (M1).
 * 2. Drawing the **first activity** silently sets the plan start and the schedule **auto-recalcs** —
 *    the bar plots without anyone pressing Recalculate (M1 + M3).
 * 3. The **Add split-button** places a **milestone** directly on the canvas (M4).
 * 4. The **Link split-button** (mirroring Add) picks the FS/SS/FF kind and arms link-mode in one
 *    gesture — the authoring path for dependencies, with the edge-drag affordance gone (M5).
 *
 * Serial + wide viewport (the suite mutates one shared plan); Chromium only (TECH_DEBT #25a).
 */
test('a planner authors a plan directly on the canvas', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // M1 — the plan opens draw-ready: the diagram region is mounted even with no activities (the canvas
  // anchors to today), so there is no "recalculate/set a start first" detour before the first draw.
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();
  await expect(page.getByText(/No activities to diagram yet/i)).toBeHidden();
  await expect(diagram.getByRole('option')).toHaveCount(0);

  // Take the pen — the Row 2 · Do authoring cluster (Add split-button, Link tool) lights up. (The
  // data date lives off the toolbar now — set silently on first draw, changed via Edit plan.)
  await startEditing(page);
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  // Match the Add split-button ("Add" / "Adding <kind>") exactly. The regex was written to avoid
  // colliding with an inline "Add note" that shared this row; that item moved to the object bar
  // (`docs/specs/object-bar-defects/` M2), so the collision is gone and the anchors are kept
  // because Playwright name matching is substring and "Add" alone would still be loose.
  await expect(toolbar.getByRole('button', { name: /^Add(ing .+)?$/ })).toBeVisible();

  // M1 + M3 — draw the first task; the first draw silently sets the plan start to today and the
  // schedule auto-recalcs, so the bar plots on its own (no Recalculate click).
  await drawActivity(page, 'Task', 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });

  // M4 — place a finish milestone straight on the canvas via the Add split-button's type menu.
  await drawActivity(page, 'Finish milestone', 'Handover', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // M5 — the Link split-button: the primary region arms the tool, and the caret opens the FS/SS/FF
  // type menu, from which picking a kind also arms (ADR-0064 T2 — before that the primary region
  // opened the menu and armed nothing, so "click Link, click two bars" drew two activities). The
  // click-pick-click creation itself is covered by the gesture-machine unit tests and, end to end,
  // by `e2e-authoring-flow/`; here we prove both regions are wired into the live toolbar.
  const linkTool = toolbar.getByRole('button', { name: 'Link', exact: true });
  await expect(linkTool).toBeVisible();
  await linkTool.click();
  await expect(toolbar.getByRole('button', { name: /Linking · FS/ })).toBeVisible();
  await toolbar.getByRole('button', { name: /^Link type:/ }).click();
  await page.getByRole('menuitemradio', { name: /Start → Start/ }).click();
  // Picking a kind sets the type and keeps link-mode armed, relabelling the button (Linking · SS).
  await expect(toolbar.getByRole('button', { name: /Linking · SS/ })).toBeVisible();

  // The canvas-first authoring workspace is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

/**
 * **The Add caret closes the menu it opened** (`docs/TECH_DEBT.md` #229, Menu half; spec
 * `docs/specs/menu-opener-press/spec.md`). The caret is the `tabIndex={-1}` half of a split button and
 * the opener, while focus must return to the main half, so the two refs `Menu` takes differ exactly
 * here. Pressing the caret again must close the menu, leave it closed, and put focus on the main half
 * and never on the caret; pressing the main half instead closes it and still runs its command.
 *
 * Lives in this suite because it needs the authoring split-button. Outcomes are asserted after a settle, not event order.
 *
 * **Verified red** against the pre-fix `Menu`: the second press left the menu open.
 */
test('the Add caret closes the menu it opened, and focus lands on the main half', async ({
  page,
}) => {
  await onboard(page, Date.now() + 31);
  await openNewPlan(page);
  await startEditing(page);

  const caret = page.getByRole('button', { name: /^Activity type:/ });
  // The main half is the caret's previous sibling inside the split button.
  const main = caret.locator('xpath=preceding-sibling::button[1]');
  await caret.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(caret).toHaveAttribute('aria-expanded', 'true');
  await caret.click();
  await page.waitForTimeout(400);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(caret).toHaveAttribute('aria-expanded', 'false');
  await expect(caret).not.toBeFocused();
  await expect(main).toBeFocused();

  await caret.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await main.click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(main).toHaveAttribute('aria-pressed', 'true');
});

/**
 * **The Link tool picks a milestone** (`docs/TECH_DEBT.md` #578). A milestone's rect is 14 px wide (and a
 * one-day bar is under 16 px), so `classifyHit` calls every point of it an end handle, never a body;
 * the two-click tool read only `body`, dropped the pick and announced "Link pick dropped". Before the
 * fix this case never reached "Linked": the first click was dropped and no dependency existed.
 *
 * Bar positions are measured, not assumed: the canvas snaps a drawn activity to the day grid, so the
 * point is found by sweeping the activity's row in select mode and reading which option the diagram's
 * own listbox reports as active.
 */
test('the Link tool picks a milestone and a one-day bar', async ({ page }) => {
  const stamp = Date.now() + 47;
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });

  await drawActivity(page, 'Task', 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawActivity(page, 'Finish milestone', 'Handover', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // Leave the Add tool (it is sticky), then sweep each row for the activity's own point.
  await canvas(page).press('Escape');
  await canvas(page).press('Escape');
  const listbox = page.getByRole('listbox', { name: 'Activities in the diagram' });
  const find = async (name: string, rowY: number): Promise<{ x: number; y: number }> => {
    for (let x = 100; x <= 700; x += 4) {
      await canvas(page).click({ position: { x, y: rowY } });
      const active = await listbox.getAttribute('aria-activedescendant');
      if (active !== null && (await page.locator(`[id="${active}"]`).innerText()).includes(name)) {
        return { x, y: rowY };
      }
    }
    throw new Error(`no point on the canvas selects ${name}`);
  };
  const task = await find('Excavate', 120);
  const milestone = await find('Handover', 180);

  await canvas(page).press('Escape');
  await toolbar.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(toolbar.getByRole('button', { name: /Linking · FS/ })).toBeVisible();
  await canvas(page).click({ position: task });
  await expect(page.getByTestId('canvas-mode-band')).toContainText('Linking FS from “Excavate”');
  await canvas(page).click({ position: milestone });
  await expect(page.getByTestId('canvas-mode-band')).toContainText(
    'Linked “Excavate” → “Handover” (FS).',
  );

  const planId = /\/plans\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  const count = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/dependencies`, {
        credentials: 'include',
      });
      return ((await response.json()) as { data: unknown[] }).data.length;
    },
    { org: orgSlug, id: planId ?? '' },
  );
  expect(count).toBe(1);
});
