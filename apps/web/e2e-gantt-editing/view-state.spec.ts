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
  syncClient,
} from '../e2e-gantt/support';
import { recalculate } from '../e2e-support/toolbar';

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
  await recalculate(page);
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
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Predecessors' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('columnheader', { name: 'Predecessors' })).toBeVisible();

  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Predecessors' })).toBeVisible();

  // The one column the chooser must never offer: it identifies the row, carries the inline editor
  // and is what a screen-reader user hears on landing.
  await page.getByRole('button', { name: 'View', exact: true }).click();
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
  // `syncClient` = reload + `ensurePen`, and the second half is what this case learnt the hard way:
  // the reload DROPS THE PEN LEASE, so every structure action shades with the pen's refusal rather
  // than its own — which read as "Indent is refused" when the summary above it was perfectly valid.
  // `ensurePen`, not `startEditing`: a reload may leave the lease already held, and clicking a
  // button that is not there would hang. Four files had a copy of this before it had a name
  // (`docs/TECH_DEBT.md` #183).
  await syncClient(page);
  await expect(ganttGrid(page)).toBeVisible();

  // Sort by Activity, so "Phase A" is deterministically ABOVE "Seeded 0". Indent reads the display
  // order — deliberately, since it is a gesture about the picture in front of the planner — and the
  // seeded rows take their `laneIndex` from the API, so the default `wbs` order does not place the
  // summary reliably. The first run of this case proved the point by being correctly REFUSED:
  // `aria-disabled`, with the reason that there is no summary above the row.
  await page.getByRole('columnheader', { name: 'Activity' }).getByRole('button').click();
  await expect(page.getByRole('columnheader', { name: 'Activity' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );

  const row = ganttRow(page, 'Seeded 0');
  await row.getByRole('button', { name: /^Actions for/ }).click();
  const indent = page.getByRole('menuitem', { name: 'Indent' });
  await expect(indent).toBeEnabled();
  await indent.click();

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

test('the row menu opens from the KEYBOARD, and Indent driven that way reaches the API', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const orgSlug = await ganttPlan(page);

  /**
   * **WCAG 2.1.1, and the only place it can honestly be checked.**
   *
   * Indent, Outdent and Insert live ONLY in the row menu — the docked bar cannot honour them — and
   * that menu's `⋯` trigger is `tabIndex={-1}`, correctly, because the grid is one roving tab stop.
   * The comment paying for that said keyboard users reach the same actions through the row's
   * selection, which was **true when M5-T3 shipped** and was made false by T4/T5. The milestone's
   * headline capability was therefore mouse-only, behind a justification that had been accurate.
   *
   * jsdom can prove the handler is bound (`GanttPanel.row-menu-keyboard.test.tsx` does). Only a
   * browser proves the key reaches it through the real focus model — that the row takes focus at
   * all, that the keydown is not swallowed by the cell, and that the menu it opens is the focused
   * row's rather than some other row's.
   */
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
  await syncClient(page); // reload + re-pen — see the case above
  await expect(ganttGrid(page)).toBeVisible();

  await page.getByRole('columnheader', { name: 'Activity' }).getByRole('button').click();
  await expect(page.getByRole('columnheader', { name: 'Activity' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );

  // Reach the row WITHOUT touching the trigger: click the row to focus it, then drive keys only.
  // A click on the `⋯` here would test the mouse path this case exists to be independent of.
  const row = ganttRow(page, 'Seeded 0');
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  // The three gestures that exist nowhere else. Their presence here IS the accessibility claim.
  const indent = menu.getByRole('menuitem', { name: 'Indent' });
  await expect(indent).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Outdent' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Insert activity below' })).toBeVisible();

  // Drive the menu itself by keyboard too — an APG menu takes arrow keys and Enter, and a menu that
  // opens but cannot be walked is the same dead end one step further in.
  await expect(indent).toBeEnabled();
  await indent.press('Enter');
  // The menu closes on activation, which is also the proof Enter REACHED the button: the row's own
  // handler used to `preventDefault()` this keystroke out of existence (React events follow the
  // React tree, and the menu is a portal), so before the fix this stayed open indefinitely.
  await expect(menu).toBeHidden();

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

  // The write says so. Without this the planner presses Indent, the row moves somewhere off screen
  // in a virtualized grid, and nothing tells them it worked — and on a 409 nothing tells them it
  // did not, which is the failure this announcement was added for.
  // The app's live region is `aria-live="polite"` with a testid — NOT `role="status"`, which in this
  // view belongs to the two cap banners. Asserted here rather than trusted: the first version of
  // this line looked for a status role and could never have matched, which would have made the
  // announcement look covered while nothing checked it.
  await expect
    .poll(async () => page.getByTestId('announcer').textContent(), { timeout: 20_000 })
    .toContain('Seeded 0');
});
