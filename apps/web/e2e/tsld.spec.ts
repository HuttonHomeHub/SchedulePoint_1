import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { awaitComputedSchedule, showActivities } from './workspace';

/**
 * The Time-Scaled Logic Diagram journey (M8, read-only — ADR-0026): a Planner schedules a
 * plan, then sees the Logic diagram section render the computed activities on the Canvas 2D
 * surface. Because the canvas is `aria-hidden`, the journey exercises the **parallel
 * focusable listbox** an AT/keyboard user relies on — tabbing in, arrowing through
 * activities, selecting one — and runs an accessibility check on the result. Requires the
 * API (with a database) reachable via the dev proxy.
 */
async function onboard(page: Page, stamp: number): Promise<string> {
  const email = `tsld-${stamp}@example.com`;
  const orgSlug = `tsld-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('TSLD Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`TSLD Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

async function openNewPlan(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
}

async function addActivity(page: Page, name: string): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

test('a planner sees the computed schedule in the logic diagram, keyboard-operable (accessible)', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });

  // Before scheduling there is nothing to plot: the diagram prompts a recalculation.
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');
  // **The pre-recalculation assertion is deliberately gone, and the reason is a real behaviour
  // change rather than a moved control.**
  //
  // This asserted TsldPanel's hint line, "Recalculate the schedule to plot…". Two things retired
  // it. The workspace renders that panel **chromeless** — the toolbar hosts its controls — so the
  // hint row is absent by design. And the obvious replacement, "the parallel listbox is empty
  // until the schedule computes", is simply false here: measured, it already holds both
  // activities. `CANVAS_AUTHORING_ENABLED` is DERIVED from the flag being retired
  // (`config/env.ts`), so turning the workspace on turns authoring on too — and an authoring
  // canvas is live from the first activity rather than after the first recalculation (ADR-0032:
  // render when a timeline anchor exists). There is no longer a "nothing is plotted yet" state to
  // assert, so nothing is asserted instead of asserting something weaker.
  //
  // The post-recalculation checks below are unchanged and carry the weight.

  // Recalculate → the canvas renders and the parallel listbox mirrors the activities.
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await awaitComputedSchedule(page, orgSlug);
  const listbox = diagram.getByRole('listbox', { name: 'Activities in the diagram' });
  await expect(listbox).toBeAttached();
  await expect(diagram.getByRole('option')).toHaveCount(2);

  // The diagram is fully keyboard-operable: focus the listbox and arrow through it; the
  // canvas selection follows the AT focus (no capability is pointer-only — WCAG 2.2).
  await listbox.focus();
  await expect(diagram.getByRole('option', { selected: true })).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(diagram.getByRole('option', { name: /Pour slab/, selected: true })).toHaveCount(1);

  // The M5 keyboard model runs end-to-end in a real browser (the driving-neighbour *selection*
  // for [ / ] is covered by the component test; here we prove the keys are wired + announced).
  const announcer = page.getByTestId('announcer');
  await page.keyboard.press('Home'); // → Excavate (no logic ties yet)
  // `i` — not Space. ADR-0080 gave Space its APG meaning (toggle this row's membership of the
  // selection) and moved the tier-2 logic summary to `i`; pressing Space here toggles the only
  // selected row out and announces "Selection cleared.", which is what this journey caught.
  await page.keyboard.press('i'); // Tier-2 detail on demand
  await expect(announcer).toHaveText('0 predecessors, 0 successors');
  await page.keyboard.press(']'); // no successor to trace
  await expect(announcer).toHaveText('No successors.');
  await page.keyboard.press('['); // no predecessor to trace
  await expect(announcer).toHaveText('No predecessors.');

  // `?` opens the in-app keyboard-shortcuts help; Escape closes it (native dialog).
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Diagram keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Diagram keyboard shortcuts' })).toBeHidden();

  // The "Fit to plan" control re-frames the diagram without error.
  //
  // It is on the command surface now, not inside the diagram region — the workspace renders
  // `TsldPanel` chromeless and the toolbar owns the viewport commands (ADR-0091 M7 folded them
  // into `Zoom ▾`). Located by `[data-toolbar-item]` rather than by copy, because at narrower
  // bands this item is icon-only by design (`showLabel: { atLeast: 'comfortable' }`) and its
  // visible text is not something a journey may assume.
  await expect(
    page.getByRole('toolbar', { name: 'View and navigate' }).locator('[data-toolbar-item="fit"]'),
  ).toBeVisible();

  // The plan view with the rendered logic diagram is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
