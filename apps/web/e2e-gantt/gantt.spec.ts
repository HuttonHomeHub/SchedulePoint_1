import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  diagramActivityList,
  ensurePen,
  ganttGrid,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  syncClient,
} from './support';

/**
 * Flag-ON **Gantt view** journey (`VITE_GANTT_VIEW`, ADR-0059). It proves the claims the epic rests
 * on, end to end against a real API and database — the ones a unit test can only assert against a
 * mock:
 *
 * 1. **The two views are the same schedule.** The activities the *diagram* says it contains are the
 *    rows the *Gantt* shows, carrying the dates the engine actually computed. That is what "a peer
 *    view of one model" has to mean.
 * 2. **The view choice is in the URL.** `?view=gantt` survives a reload and is shareable — proven by
 *    a real reload rather than by a router mock.
 * 3. **The grid is readable without sight of it.** The bars are decoration; the dates live in cells.
 *    A real axe pass over the rendered treegrid is the only way to know that survived.
 *
 * **No canvas drawing.** Claim 1 is asserted against the diagram's own parallel listbox (the
 * accessible representation ADR-0026 built by hand) rather than by authoring bars with the mouse.
 * That is both a stronger statement — two views agreeing on the model, not on a click — and free of
 * a dependency on canvas authoring, which is the TSLD's contract to test, not the Gantt's.
 *
 * Serial (one org and plan mutate throughout); Chromium only (TECH_DEBT #25a).
 */
test('the Gantt is a peer view of the same schedule, deep-linkable and readable as a grid', async ({
  page,
}) => {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Substructure');

  // Three activities, so arrow-key movement has somewhere to go. Writes are pen-gated (ADR-0028).
  await ensurePen(page);
  await seedActivities(page, orgSlug, 3);
  await page.reload();

  // ------------------------------------------------------------------ 1. The diagram is default
  const ganttButton = page.getByRole('button', { name: 'Gantt', exact: true });
  await expect(page.getByRole('button', { name: 'Diagram', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(ganttButton).toHaveAttribute('aria-pressed', 'false');
  await expect(ganttGrid(page)).toBeHidden();

  // What the diagram says it contains — its own accessible account of the model.
  const diagramNames = await diagramActivityList(page).getByRole('option').allInnerTexts();
  expect(diagramNames.join(' ')).toContain('Seeded 0');

  // ------------------------------------------------------------------ 2. Switch to the Gantt
  await showGantt(page);
  const grid = ganttGrid(page);

  // One view at a time — the diagram's canvas region is gone, not merely covered.
  await expect(page.locator('section[aria-label="Time-scaled logic diagram"]')).toBeHidden();

  // Every activity the diagram listed is a Gantt row, and the dates are TEXT in cells — not encoded
  // only in a bar. The plan starts 2026-01-05, so the computed start is a January date.
  for (const name of ['Seeded 0', 'Seeded 1', 'Seeded 2']) {
    await expect(grid.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  }
  await expect(grid.getByRole('row', { name: /Seeded 0/ })).toContainText(/Jan 2026/);

  // ------------------------------------------------------------------ 3. The URL carries the view
  await expect(page).toHaveURL(/[?&]view=gantt/);
  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gantt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // ------------------------------------------------------------------ 4. Keyboard + a11y
  // The grid carries a roving tab stop: arrows move between rows. A bar chart that can only be read
  // with a mouse is not a view of the schedule for everyone.
  await ganttGrid(page).getByRole('row').nth(1).focus();
  const before = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-rowindex') ?? '',
  );
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex') ?? ''))
    .not.toBe(before);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // -------------------------------------------------- 5. The splitter, and where the chart begins
  // `grid-width.structural.test.ts` pins the arithmetic — the columns fill the pane exactly and
  // `name` absorbs the difference — and until now nothing drove the divider in a BROWSER
  // (`docs/TECH_DEBT.md` #151). That gap mattered more than a missing structural test usually does,
  // because the defect this arithmetic exists to prevent is a *picture* one: ADR-0095 shipped a
  // `GRID_WIDTH` literal that disagreed with its own columns and painted Float on top of the chart,
  // and the first version of this splitter reproduced it at a guessed 180 px floor. Both were found
  // by looking at a browser; neither would have failed a test of the sums.
  //
  // The `role="separator"` carries `aria-valuemin`/`max`, so the bounds are read off the control
  // rather than restated here — a copied constant is how a gate comes to agree with the wrong
  // number.
  const chartMeetsGrid = async (where: string): Promise<void> => {
    // Only meaningful at `scrollLeft: 0`. The pinned block is `position: sticky; left: 0`, so once
    // the scroller moves the chart header slides UNDER it and the two edges legitimately overlap —
    // an assertion taken mid-scroll would report the defect it is looking for.
    await grid.evaluate((el) => {
      let node = el.parentElement;
      while (node && node.scrollWidth <= node.clientWidth) node = node.parentElement;
      if (node) node.scrollLeft = 0;
    });
    const heads = await grid.getByRole('columnheader').evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        return { name: (el.textContent ?? '').trim(), left: box.left, right: box.right };
      }),
    );
    const timeline = heads.find((h) => h.name === 'Timeline');
    // `Actions` is `sr-only`, so it takes no layout and its rect says nothing about the pane.
    const pinned = heads.filter((h) => h.name !== 'Timeline' && h.name !== 'Actions');
    expect(timeline, `${where}: no Timeline column header`).toBeDefined();
    expect(pinned.length, `${where}: no pinned column headers`).toBeGreaterThan(0);
    // ONE equality catches both ways the arithmetic can be wrong: a column overflowing onto the
    // chart reads as `>`, a gap between the two as `<`.
    expect(
      Math.round(Math.max(...pinned.map((h) => h.right))),
      `${where}: the pinned columns do not end where the chart begins — ${JSON.stringify(heads)}`,
    ).toBe(Math.round(timeline?.left ?? -1));
  };

  const splitter = page.getByRole('separator', { name: 'Grid width' });
  await chartMeetsGrid('at the seeded width');

  // Home is the floor: the width at which `name` stops absorbing and every column is at its
  // tightest, which is where a sum that is wrong by a column shows first.
  const floor = await splitter.getAttribute('aria-valuemin');
  await splitter.focus();
  await page.keyboard.press('Home');
  await expect(splitter).toHaveAttribute('aria-valuenow', floor ?? '');
  await chartMeetsGrid('at the floor');

  // And a step off the floor, so the pass is not a property of one width. ArrowRight grows a
  // vertical divider (`PanelResizer`'s start-anchored default).
  await page.keyboard.press('ArrowRight');
  await expect(splitter).not.toHaveAttribute('aria-valuenow', floor ?? '');
  await chartMeetsGrid('one step above the floor');

  /**
   * And with a **baseline active**, which adds a `vs baseline` column to the pinned block.
   *
   * This is the state the arithmetic is least likely to hold in, and it was not in #151's brief:
   * the variance column is rendered inside the pinned block with its own width, and it is NOT one
   * of `COLUMNS` — so `ganttFixedWidth` cannot see it and `resolveColumnWidth` never accounts for
   * it. Whether that overflows the pane is a question about a real layout, which is exactly the
   * kind of question a structural test cannot ask and the reason this row was filed at all.
   *
   * Captured through the API: the plan's FIRST baseline auto-activates (`baselines.service.ts`),
   * so no separate activate call is needed, and `syncClient` is what makes the open page aware of
   * a write that bypassed it (`docs/TECH_DEBT.md` #183).
   */
  const planId = openPlanId(page);
  const captured = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/baselines`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Splitter check' }),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId },
  );
  expect(captured.ok, `capturing a baseline failed: ${captured.status} ${captured.body}`).toBe(
    true,
  );
  await syncClient(page);
  await showGantt(page);

  // The pinned positive: without it the two assertions below would pass equally on a Gantt that
  // never rendered the column, which is the state they exist to test.
  await expect(
    ganttGrid(page).getByRole('columnheader', { name: 'vs baseline' }),
    'no variance column — the baseline did not reach the grid, so nothing below is being tested',
  ).toBeVisible();
  await chartMeetsGrid('with a baseline, at the seeded width');

  await page.getByRole('separator', { name: 'Grid width' }).focus();
  await page.keyboard.press('Home');
  await chartMeetsGrid('with a baseline, at the floor');

  // ------------------------------------------------------------------ 6. Back to the diagram
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  await expect(page.locator('section[aria-label="Time-scaled logic diagram"]')).toBeVisible();
  await expect(ganttGrid(page)).toBeHidden();
  // Back on the diagram the parameter is GONE, not `view=tsld`. The default is deliberately not
  // serialised (`use-plan-view-mode.ts`), so an untouched plan keeps a clean URL and a shared link
  // never pins a choice the sharer did not make. Asserting `view=tsld` here would have pinned the
  // opposite contract into a test.
  await expect(page).not.toHaveURL(/[?&]view=/);
});
