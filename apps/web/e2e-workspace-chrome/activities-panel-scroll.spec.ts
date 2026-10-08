import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  openPlanId,
  recalculate,
  seedActivities,
} from './support';

/**
 * The activities panel is one scroller, and its header stays pinned and pointer-reachable
 * (`docs/specs/activities-panel-scale/`, TECH_DEBT #334, M1).
 *
 * **This journey has not been run.** The session that wrote it was instructed not to run
 * Playwright — see `docs/specs/activities-panel-scale/m1-premise.md` for what that means for the
 * `scroll-padding-top` value this asserts against and for the browser check M1-T1 still owes. What
 * follows is the red-run recipe rather than a result:
 *
 *   1. `git stash` (or a throwaway branch) reverting `src/features/activities/components/
 *      ActivitiesTable.tsx` and `src/components/layout/workspace/activity-bottom-panel.tsx` to the
 *      commit before this file, leaving `scroll="contained"` unused and the outer panel div
 *      `overflow-y-auto` again — the pre-M1 two-scroller shape.
 *   2. `pnpm --filter @repo/web exec playwright test --config playwright.workspace-chrome.config.ts
 *      activities-panel-scroll.spec.ts` (or `scripts/e2e-local.sh web:workspace-chrome`, which does
 *      the same thing plus the shared-server bring-up).
 *   3. Expect `SC-2/SC-3/SC-5` to FAIL: the header is not pinned (`sticky top-0` on the CURRENT
 *      structure sticks to a scrollport that never scrolls — spec §4.1 point 1), so scrolling to the
 *      end of a 60-row panel scrolls the header away with it, `elementFromPoint` at its old screen
 *      position returns a row cell rather than the `Name` header, and the panel wrapper (the outer
 *      `overflow-y-auto` div) is the one that scrolls, not the named "Activities" region — so the
 *      `scrollHeight === clientHeight` / `scrollHeight > clientHeight` pairing is reversed between
 *      the two elements the SC-5 case reads.
 *   4. Restore the two files (`git stash pop` / switch back) and re-run: all three pass.
 *
 * **SC-2** is asserted on pointer reachability (`elementFromPoint`), never box presence — ADR-0114
 * M1 shipped a control whose box was correct and which a pointer could not reach, and a box-only
 * assertion would have passed against exactly that. **SC-3** walks Shift+Tab through real rows
 * rather than asserting a single position, because the defect it guards is "eventually landing
 * somewhere behind the header", not "the very last row is behind it". **SC-5** reads two elements'
 * `scrollHeight`/`clientHeight`, because "the region overflows" alone is true of both the broken and
 * the fixed shape — what changed is WHICH element does.
 */

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 900; // offset from sibling suites' stamps sharing the same clock second

function activitiesRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'Activities', exact: true });
}

function panelBody(page: Page): Locator {
  return page.getByTestId('activities-panel-body');
}

/** Seed enough rows to overflow the panel's 280 px default height at every measured width. */
async function seedSixty(page: Page, orgSlug: string): Promise<void> {
  const specs = Array.from({ length: 60 }, (_, i) => ({
    name: `Activity ${String(i + 1).padStart(2, '0')}`,
    laneIndex: i,
  }));
  await seedActivities(page, orgSlug, specs);
  await recalculate(page, orgSlug);
}

test.describe('the activities panel scrolls as one region, header pinned', () => {
  test('SC-2, SC-3, SC-5 at 1646 then 1920', async ({ page }) => {
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Panel scale');
    await ensurePen(page);
    await seedSixty(page, orgSlug);
    await ensurePen(page);

    await page.getByRole('button', { name: 'Expand activities panel' }).click();
    const region = activitiesRegion(page);
    await expect(region).toBeVisible();
    const nameHeader = page.getByRole('columnheader', { name: 'Name' });
    await expect(nameHeader).toBeVisible();

    // 1646 FIRST (the config's own viewport), then 1920 — growing, never shrinking mid-test
    // (`zero-duration.spec.ts`'s recorded trap: Chromium's hit-testing goes stale on a shrink).
    for (const width of [1646, 1920]) {
      await page.setViewportSize({ width, height: 1097 });

      // ── SC-5: one scroller ──────────────────────────────────────────────────────────────────
      const body = await panelBody(page).evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      const regionMetrics = await region.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(body.scrollHeight, `panel body at ${String(width)}px does not itself scroll`).toBe(
        body.clientHeight,
      );
      expect(
        regionMetrics.scrollHeight,
        `the "Activities" region at ${String(width)}px is the one that overflows`,
      ).toBeGreaterThan(regionMetrics.clientHeight);

      // ── SC-2: the header stays pointer-reachable once scrolled to the region's end ──────────
      await region.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      const headerBox = await nameHeader.boundingBox();
      if (!headerBox) throw new Error('the Name header has no box');
      const cx = Math.round(headerBox.x + headerBox.width / 2);
      const cy = Math.round(headerBox.y + headerBox.height / 2);
      const hitsHeader = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('th') !== null,
        { x: cx, y: cy },
      );
      expect(
        hitsHeader,
        `elementFromPoint at the Name header's centre at ${String(width)}px must return the header, not a row`,
      ).toBe(true);

      // ── SC-3: focus never lands wholly inside the header while walking backwards ────────────
      await page
        .getByRole('button', { name: /^Actions for /u })
        .last()
        .focus();
      for (let i = 0; i < 15; i += 1) {
        await page.keyboard.press('Shift+Tab');
        const focusedBox = await page.evaluate(() => {
          const el = document.activeElement;
          if (!(el instanceof HTMLElement)) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        // A zero-size box (e.g. focus having left the table onto `<body>`) cannot be "inside"
        // anything and is not this case's concern — it walks rows, not the whole document.
        if (!focusedBox || (focusedBox.width === 0 && focusedBox.height === 0)) continue;
        const freshHeaderBox = await nameHeader.boundingBox();
        if (!freshHeaderBox) throw new Error('the Name header has no box mid-walk');
        const whollyInside =
          focusedBox.x >= freshHeaderBox.x &&
          focusedBox.y >= freshHeaderBox.y &&
          focusedBox.x + focusedBox.width <= freshHeaderBox.x + freshHeaderBox.width &&
          focusedBox.y + focusedBox.height <= freshHeaderBox.y + freshHeaderBox.height;
        expect(
          whollyInside,
          `Shift+Tab press ${String(i + 1)} at ${String(width)}px must not land wholly behind the header`,
        ).toBe(false);
      }
    }
  });

  test('the windowed table stays keyboard-reachable, announced and steady (ADR-0165, M3)', async ({
    page,
  }) => {
    // Written and NOT run: the session that wrote it was told not to run Playwright. Red recipe: in
    // `ActivitiesTable.tsx` drop `windowed`, and `aria-rowcount` is absent, so the count assertion
    // fails first (an un-windowed table has no announced size). For D4, in `data-table-windowed-
    // body.tsx` set OVERSCAN to 0: the next row is no longer rendered when Tab moves on, and the
    // walk is expected to lose the table (focus falls to <body>) before row 60.
    const orgSlug = await onboard(page, STAMP + 4);
    await createHierarchy(page);
    await newPlan(page, 'Panel scale windowed');
    await ensurePen(page);
    await seedSixty(page, orgSlug);
    await ensurePen(page);

    await page.getByRole('button', { name: 'Expand activities panel' }).click();
    const region = activitiesRegion(page);
    await expect(region).toBeVisible();
    const table = region.getByRole('table');
    const nameHeader = page.getByRole('columnheader', { name: 'Name' });
    await expect(nameHeader).toBeVisible();

    // The table announces its whole size, not the window's: 60 activities plus the header row.
    await expect(table).toHaveAttribute('aria-rowcount', '61');
    // ...while the DOM holds a window, which is the point of the change.
    expect(await table.locator('tbody tr[data-index]').count()).toBeLessThan(60);

    const columnWidths = () =>
      table
        .locator('thead th')
        .evaluateAll((cells) =>
          cells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
        );
    const before = await columnWidths();
    expect(before.length).toBeGreaterThan(1);

    const insideTable = () =>
      region.evaluate(
        (el) => document.activeElement !== null && el.contains(document.activeElement),
      );
    const focusedRowIndex = () =>
      page.evaluate(
        () => document.activeElement?.closest('tr')?.getAttribute('aria-rowindex') ?? null,
      );

    // ── D4: Tab forward through 60 rows reaches row 60 without leaving the table ────────────────
    await region.getByRole('button', { name: 'Actions for Activity 01', exact: false }).focus();
    expect(await focusedRowIndex()).toBe('2');
    let presses = 0;
    while ((await focusedRowIndex()) !== '61') {
      presses += 1;
      // Two stops per row at most (checkbox, Actions); a walk this long has lost its way.
      expect(presses, 'Tab never reached row 60').toBeLessThan(200);
      await page.keyboard.press('Tab');
      expect(await insideTable(), `focus left the table on Tab press ${String(presses)}`).toBe(
        true,
      );
    }
    await expect(
      region.getByRole('button', { name: 'Actions for Activity 60', exact: false }),
    ).toBeFocused();

    // ── header stays pinned at the far end ──────────────────────────────────────────────────────
    const headerBox = await nameHeader.boundingBox();
    if (!headerBox) throw new Error('the Name header has no box');
    const hitsHeader = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('th') !== null,
      {
        x: Math.round(headerBox.x + headerBox.width / 2),
        y: Math.round(headerBox.y + headerBox.height / 2),
      },
    );
    expect(hitsHeader, 'the Name header is still the element under its own centre').toBe(true);

    // ── D4: Shift+Tab walks back to row 1 without leaving the table ─────────────────────────────
    presses = 0;
    while ((await focusedRowIndex()) !== '2') {
      presses += 1;
      expect(presses, 'Shift+Tab never reached row 1').toBeLessThan(200);
      await page.keyboard.press('Shift+Tab');
      expect(
        await insideTable(),
        `focus left the table on Shift+Tab press ${String(presses)}`,
      ).toBe(true);
    }

    // ── WCAG 2.4.3: a scroll far past the overscan does not drop focus ─────────────────────────
    // Row 1's control holds focus while the region is scrolled to the bottom with `scrollTop` (a
    // wheel or scrollbar drag, not a Tab), which would unmount an un-pinned row and leave <body>.
    const firstControl = region.getByRole('button', { name: 'Actions for Activity 01' });
    await firstControl.focus();
    await region.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(firstControl).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await region.evaluate((el) => {
      el.scrollTop = 0;
    });

    // ── D1: column widths did not move across a full scroll, down and back ──────────────────────
    const seen: number[][] = [];
    for (const fraction of [0.25, 0.5, 0.75, 1, 0.5, 0]) {
      await region.evaluate(
        (el, f) => el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * f }),
        fraction,
      );
      await expect(table).toHaveAttribute('aria-rowcount', '61');
      seen.push(await columnWidths());
    }
    for (const widths of seen) expect(widths).toEqual(before);
  });

  test('scrolls as one region at 640px, the narrow single-pane layout too', async ({ page }) => {
    // Build the plan at the default width: below `md` the organisation nav folds behind a menu, so
    // `createHierarchy`'s "Clients" link is not on screen. The narrow layout is what is measured.
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Panel scale narrow');
    await ensurePen(page);
    await seedSixty(page, orgSlug);
    await ensurePen(page);
    await page.setViewportSize({ width: 640, height: 480 });

    // Below `md` there is no separate expand/collapse — the view toggle IS the show/hide mechanism
    // (`plan-workspace-toolbar.tsx`: both panes are always mounted, switched with `hidden`/`block`).
    await page.getByRole('radio', { name: 'Activities' }).click();
    const region = activitiesRegion(page);
    await expect(region).toBeVisible();

    const body = await panelBody(page).evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    const regionMetrics = await region.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(body.scrollHeight, 'panel body at 640px does not itself scroll').toBe(body.clientHeight);
    expect(
      regionMetrics.scrollHeight,
      'the region at 640px is the one that overflows, not its pane',
    ).toBeGreaterThan(regionMetrics.clientHeight);
  });

  test('a selection keeps rows on screen at the default panel height', async ({ page }) => {
    // Found by the M0 harness, not by this suite: ticking a row opens the bulk-assign bar above
    // the table, and in the default 280px panel it squeezed the region to 50px — the pinned header
    // and not one row. The region now has a floor and the panel body scrolls the rest. Asserted as
    // "a data row is painted inside the region", because a region height alone passes against a
    // region that is tall and entirely under its own header.
    const orgSlug = await onboard(page, STAMP + 3);
    await createHierarchy(page);
    await newPlan(page, 'Panel scale select');
    await ensurePen(page);
    // The selection column exists only on a plan that has a WBS summary to assign rows to
    // (`ActivitiesTable`'s `bulkAssignActive`), so seed one alongside the sixty tasks.
    const summaryStatus = await page.evaluate(
      async ({ org, id }: { org: string; id: string }) =>
        (
          await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Phase 1', type: 'WBS_SUMMARY', laneIndex: 60 }),
          })
        ).status,
      { org: orgSlug, id: openPlanId(page) },
    );
    expect(summaryStatus).toBe(201);
    await seedSixty(page, orgSlug);

    await page.getByRole('button', { name: 'Expand activities panel' }).click();
    const region = activitiesRegion(page);
    await expect(region).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select Activity 01', exact: true }).check();
    await expect(page.getByText(/1 activity selected/)).toBeVisible();

    // The fallback: the body scrolls the bar away and the region keeps its floor, so bring the
    // region into the body's view the way a person would, by scrolling the body to its end.
    await panelBody(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const painted = await region.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const head = el.querySelector('thead')?.getBoundingClientRect();
      const top = Math.max(box.top, head ? head.bottom : box.top);
      if (box.bottom - top < 1) return 0;
      let rows = 0;
      for (const tr of el.querySelectorAll('tbody tr')) {
        const r = tr.getBoundingClientRect();
        const y = (r.top + r.bottom) / 2;
        if (y > top && y < box.bottom) {
          const hit = document.elementFromPoint(r.left + 8, y);
          if (hit && tr.contains(hit)) rows += 1;
        }
      }
      return rows;
    });
    expect(painted, 'data rows painted below the header while a row is selected').toBeGreaterThan(
      1,
    );
  });

  test('no new accessibility violation on the pinned header and scroll region', async ({
    page,
  }) => {
    const orgSlug = await onboard(page, STAMP + 2);
    await createHierarchy(page);
    await newPlan(page, 'Panel scale axe');
    await ensurePen(page);
    await seedSixty(page, orgSlug);
    await ensurePen(page);

    await page.getByRole('button', { name: 'Expand activities panel' }).click();
    const region = activitiesRegion(page);
    await expect(region).toBeVisible();

    // Asserted to match something first (the ADR-0099 M5 correction): a scan whose `.include()`
    // names nothing scans nothing and reports green for having tested nothing.
    expect(await region.count()).toBeGreaterThan(0);
    const scan = await new AxeBuilder({ page })
      .include('[role="region"][aria-label="Activities"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});
