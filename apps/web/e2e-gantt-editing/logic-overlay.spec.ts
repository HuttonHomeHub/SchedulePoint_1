import { expect, test, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttRow,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';
import { clickToolbarCommand } from '../e2e-support/toolbar';

/**
 * **M4 — the logic overlay, driven against a real plan with real dependencies.**
 *
 * What no unit test here can show: that the toggle in `View ▾` reaches the panel, that the SVG
 * lands in the scroll container at a size the rows actually occupy, and that a link between two
 * rows *neither of which is selected* appears only once the toggle is on. Each of those is a wiring
 * question, and ADR-0080 shipped a bar wired into one host and not the layout its flag selected
 * with every unit test passing.
 *
 * The textual equivalent is asserted here too rather than only in jsdom, because it is the half a
 * planner using a screen reader depends on and the arrows are `aria-hidden` — if the sentence were
 * lost in the real render there would be nothing at all.
 */

async function planWithLink(page: Page): Promise<string> {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);

  const planId = openPlanId(page);
  const failure = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const read = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities?limit=100`, {
        credentials: 'include',
      });
      const body = (await read.json()) as { data: { id: string; name: string }[] };
      const find = (name: string) => body.data.find((a) => a.name === name);
      const first = find('Seeded 0');
      const second = find('Seeded 1');
      const third = find('Seeded 2');
      if (!first || !second || !third) return 'seeded activities missing';

      // Two links: one touching Seeded 0 (the selection case) and one between the other two, which
      // is the case the TOGGLE exists for — nothing selected can reveal it.
      for (const [from, to] of [
        [first.id, second.id],
        [second.id, third.id],
      ]) {
        const created = await fetch(`/api/v1/organizations/${org}/plans/${id}/dependencies`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ predecessorId: from, successorId: to, type: 'FS' }),
        });
        if (!created.ok) return `link create: ${created.status} ${await created.text()}`;
      }
      return null;
    },
    { org: orgSlug, id: planId },
  );
  if (failure !== null) throw new Error(failure);

  await clickToolbarCommand(page, 'recalculate');
  return orgSlug;
}

const arrows = (page: Page) => page.locator('[data-testid="gantt-scroll"] svg path');

test.describe.configure({ mode: 'serial' });

test('the off-state draws nothing until a row is selected', async ({ page }) => {
  test.setTimeout(180_000);
  await planWithLink(page);
  await showGantt(page);

  // Default off (the product owner's Q1 answer): logic on a dense programme is a thicket.
  await expect(arrows(page)).toHaveCount(0);

  // Selecting answers "why is this bar here?" without turning anything on — the toggle's off-state
  // rather than an exception to it.
  await ganttRow(page, 'Seeded 0').click();
  await expect(arrows(page)).toHaveCount(1);
});

test('the toggle reveals a link between two rows neither of which is selected', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await planWithLink(page);
  await showGantt(page);

  // Seeded 1 → Seeded 2 touches nothing selected, so it is unreachable by the selection path. This
  // is the capability the toggle buys, and asserting it against a link that DOES touch the
  // selection would pass with the toggle doing nothing.
  // A `View ▾` toggle is a native `<input type="checkbox">` inside a `<label>`, so its role is
  // `checkbox` — not `menuitemcheckbox`, which is what I reached for first and what a menu-shaped
  // popover invites you to assume. Established by reading `ViewTogglesPanel` rather than by
  // guessing again.
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Logic links' }).check();
  await page.keyboard.press('Escape');

  await expect(arrows(page)).toHaveCount(2);
});

test('the arrows are hidden from assistive technology and said in words', async ({ page }) => {
  test.setTimeout(180_000);
  await planWithLink(page);
  await showGantt(page);
  await ganttRow(page, 'Seeded 0').click();

  const svg = page.locator('[data-testid="gantt-scroll"] svg').first();
  await expect(svg).toHaveAttribute('aria-hidden', 'true');

  // The equivalent (spec GV-3). Without it the overlay is a graphical-only carrier — the WCAG 1.4.1
  // defect ADR-0055 exists about, and the one this surface already avoids for dates and float.
  await expect(page.getByText('Follows Seeded 0.')).toBeAttached();
});

test('an arrow does not steal the pointer from the bar underneath it', async ({ page }) => {
  test.setTimeout(180_000);
  await planWithLink(page);
  await showGantt(page);
  await ganttRow(page, 'Seeded 0').click();
  await expect(arrows(page)).toHaveCount(1);

  // The overlay sits above the bars. Without `pointer-events: none` the resize handle under a
  // passing link stops responding — silently, and only on plans dense enough for a link to cross
  // it, which is why this is a browser assertion rather than a class-name one.
  const svg = page.locator('[data-testid="gantt-scroll"] svg').first();
  await expect(svg).toHaveCSS('pointer-events', 'none');
});
