import { expect, test, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttGrid,
  ganttRow,
  onboard,
  seedActivities,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';

/**
 * **M5 — the chart comes back the way it was left, and can be restructured.**
 *
 * The journey ADR-0095's plan named for this milestone, and it lands late: M5-T1/T4/T6 shipped in
 * three commits without one, which is exactly the gap ADR-0081 exists about — a milestone claiming
 * user-facing capability names its entry point and the flag-on journey lands WITH it, because unit
 * tests validate the code and not the reachability of the thing the code is for.
 *
 * **What only a browser can prove here.**
 *
 * `docs/TECH_DEBT.md` #96: TanStack Router JSON-parses every search param, so a URL value arrives
 * as a number, a boolean or an array rather than a string. `gantt-view-state.test.ts` covers the
 * parsers by handing them those shapes directly — but nothing in jsdom crosses the router itself,
 * because every screen test mocks `useSearch`. ADR-0074 M5 shipped a live defect through that
 * exact hole. A reload here goes through the real parser, the real URL and the real component.
 *
 * The structure edits are the other half: Indent writes through the ADR-0063 M4b reparent batch,
 * which carries each row's `version` — so a stale one rejects with a 409 rather than half-moving a
 * tree. A mocked fetch accepts any version, which is why the write is asserted at the API.
 */

/** A plan with three seeded activities, opened in the Gantt with the pen held. */
async function ganttPlan(page: Page): Promise<string> {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await showGantt(page);
  await expect(ganttGrid(page)).toBeVisible();
  return orgSlug;
}

test.describe.configure({ mode: 'serial' });

test('a sort survives a reload, through the real router', async ({ page }) => {
  test.setTimeout(180_000);
  await ganttPlan(page);

  // Sort by Activity — the header's own control, not a URL typed by the test, so this proves the
  // control writes the param as well as the param being read.
  await page.getByRole('columnheader', { name: 'Activity' }).getByRole('button').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('gsort')).toBe('name:asc');

  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  // `aria-sort` is the assertion rather than row order: it is what a screen-reader user is told,
  // and row order alone would pass on a plan whose default order happens to match.
  await expect(page.getByRole('columnheader', { name: 'Activity' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
});

test('a hand-edited URL lands on a working chart rather than an error boundary', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ganttPlan(page);

  // The #96 shape, typed by hand: the router parses this as the NUMBER 1, not the string "1".
  // Every reader is total, so the chart degrades to its default sort and still draws.
  await page.goto(`${page.url().split('?')[0]}?view=gantt&gsort=1&ghide=notAColumn`);
  await expect(ganttGrid(page)).toBeVisible();
  await expect(ganttRow(page, 'Seeded 0')).toBeVisible();
});

test('a column choice survives a reload, and Activity can never be hidden', async ({ page }) => {
  test.setTimeout(180_000);
  await ganttPlan(page);

  // Predecessors is hidden by default — a chart does not grow a column overnight.
  await expect(page.getByRole('columnheader', { name: 'Predecessors' })).toHaveCount(0);

  // `checkbox`, not `menuitemcheckbox`, and the trigger name is prefixed — both read from
  // `tsld-toolbar-columns.test.tsx` rather than assumed, because a locator invented from the shape
  // a menu "ought" to have is how a journey fails for a reason that is not its subject.
  await page.getByRole('button', { name: /^View/ }).click();
  await page.getByRole('checkbox', { name: 'Predecessors' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('columnheader', { name: 'Predecessors' })).toBeVisible();

  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Predecessors' })).toBeVisible();

  // The one column the chooser must never offer: it identifies the row, carries the inline editor
  // and is what a screen-reader user hears on landing.
  await page.getByRole('button', { name: /^View/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Activity' })).toHaveCount(0);
});

test('Indent files a row under the summary above it, and the write reaches the API', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const orgSlug = await ganttPlan(page);

  // Indent needs a SUMMARY above the row: ADR-0038 makes "only a WBS_SUMMARY may be a parent" a
  // service invariant, and ADR-0095 M5-T4 deliberately does NOT convert a task into one — the
  // borrowed P6 gesture would silently strip every link on the row above.
  const planId = /\/plans\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
  const summaryId = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Phase A', type: 'WBS_SUMMARY', laneIndex: 0 }),
      });
      if (!response.ok) throw new Error(`create summary: ${response.status}`);
      return ((await response.json()) as { data: { id: string } }).data.id;
    },
    { org: orgSlug, id: planId },
  );
  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();

  const row = ganttRow(page, 'Seeded 0');
  await row.getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Indent' }).click();

  // Asserted at the API, never off the DOM: the reparent batch carries each row's `version`, and a
  // grid that redrew without the write landing would pass a DOM assertion and be wrong in the only
  // way that matters.
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ({ org, id }: { org: string; id: string }) => {
            const response = await fetch(
              `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
              { credentials: 'include' },
            );
            const body = (await response.json()) as {
              data: { name: string; parentId: string | null }[];
            };
            return body.data.find((a) => a.name === 'Seeded 0')?.parentId ?? null;
          },
          { org: orgSlug, id: planId },
        ),
      { timeout: 20_000 },
    )
    .toBe(summaryId);
});

test('Outdent refuses at the top level, with a reason rather than silence', async ({ page }) => {
  test.setTimeout(180_000);
  await ganttPlan(page);

  const row = ganttRow(page, 'Seeded 0');
  await row.getByRole('button', { name: /^Actions for/ }).click();

  // Shaded with a reason, never missing and never a silent no-op (ADR-0082). A control that does
  // nothing and says nothing is the lit-but-inert shape this register keeps recording.
  const outdent = page.getByRole('menuitem', { name: 'Outdent' });
  await expect(outdent).toBeVisible();
  await expect(outdent).toHaveAttribute('aria-disabled', 'true');
  await expect(outdent).toHaveAttribute('aria-describedby', /.+/);
});

test('Insert activity below opens the create dialog', async ({ page }) => {
  test.setTimeout(180_000);
  await ganttPlan(page);

  const row = ganttRow(page, 'Seeded 0');
  await row.getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Insert activity below' }).click();

  // The entry point M5-T5 claims (ADR-0081): the dialog opens from the row menu, in this view.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel(/^Name/)).toBeVisible();
});
