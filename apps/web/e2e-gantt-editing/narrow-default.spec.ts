import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttGrid,
  onboard,
  seedActivities,
  showGantt,
} from '../e2e-gantt/support';
import { holdThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';
import { recalculate, unfoldViewSections } from '../e2e-support/toolbar';
import { TIMELINE_MIN_SHARE } from '../src/features/gantt/layout/pinned-geometry';

/**
 * **A narrow Gantt opens without Code and Finish** (`docs/specs/gantt-narrow-default-columns/`, M1).
 *
 * The first case is written before the change and is red on the code it was written against: at
 * 1024 x 768 with the Explorer open, a view with no `ghide` in its address drew all five usual
 * columns and left the timeline a thin strip. It asserts ratios and edges, never a pixel figure, so
 * it holds on whatever machine runs it.
 *
 * The suite's config runs at 1920 x 1080, so this spec sets its own viewport.
 */
test.use({ viewport: { width: 1024, height: 768 } });
test.describe.configure({ mode: 'serial' });

async function ganttPlan(page: Page): Promise<void> {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await holdThePen(page);
  await seedActivities(page, orgSlug, 3);
  await recalculate(page);
  await showGantt(page);
  await expect(ganttGrid(page)).toBeVisible();
}

const header = (page: Page, name: string, exact = false) =>
  ganttGrid(page).getByRole('columnheader', { name, exact });

test('a view with no column choice, opened narrow, leaves the timeline its room', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ganttPlan(page);
  // The address says nothing about columns: this is the "new view" case, not a stated choice.
  expect(new URL(page.url()).searchParams.has('ghide')).toBe(false);

  await expect(header(page, 'Code', true)).toHaveCount(0);
  await expect(header(page, 'Finish', true)).toHaveCount(0);
  for (const name of ['Activity', 'Duration', 'Start', 'Float left']) {
    await expect(header(page, name).first()).toBeVisible();
  }

  // Scrolled home first: the pinned block is sticky, so a mid-scroll edge reads as an overlap.
  const measured = await page.getByTestId('gantt-scroll').evaluate((scroller) => {
    scroller.scrollLeft = 0;
    const frame = scroller.getBoundingClientRect();
    const heads = [...scroller.querySelectorAll('[role="columnheader"]')].map((el) => {
      const box = el.getBoundingClientRect();
      return { name: (el.textContent ?? '').trim(), left: box.left, right: box.right };
    });
    const timeline = heads.find((h) => h.name.startsWith('Timeline'));
    const pinned = heads.filter((h) => !h.name.startsWith('Timeline'));
    return {
      frameLeft: frame.left + scroller.clientLeft,
      frameWidth: scroller.clientWidth,
      timelineLeft: timeline?.left ?? null,
      pinnedRight: pinned.length === 0 ? null : Math.max(...pinned.map((h) => h.right)),
      page: {
        scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
        clientWidth: document.scrollingElement?.clientWidth ?? 0,
      },
    };
  });

  expect(measured.timelineLeft, 'no Timeline column header').not.toBeNull();
  expect(measured.pinnedRight, 'no pinned column headers').not.toBeNull();
  const timelineLeft = measured.timelineLeft ?? 0;
  const pinnedRight = measured.pinnedRight ?? 0;

  // The timeline's share of the Gantt's own width: a ratio, never a figure.
  const timelineWidth = measured.frameLeft + measured.frameWidth - timelineLeft;
  expect(timelineWidth / measured.frameWidth).toBeGreaterThanOrEqual(TIMELINE_MIN_SHARE);

  // No header cut off: every pinned header ends at or before the timeline begins.
  expect(Math.round(pinnedRight)).toBeLessThanOrEqual(Math.round(timelineLeft));

  // No sideways scroll of the page itself.
  expect(measured.page.scrollWidth).toBeLessThanOrEqual(measured.page.clientWidth);
});

const REASON = 'Code and Finish start off when the Gantt is narrow. Tick them to show them.';

async function openColumns(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await unfoldViewSections(page);
}

test('the narrow default can be switched off, says why, and the choice then sticks', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ganttPlan(page);

  await openColumns(page);
  await expect(page.getByText(REASON)).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole('checkbox', { name: 'Code', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Finish', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(header(page, 'Code').first()).toBeVisible();
  await expect(header(page, 'Finish').first()).toBeVisible();
  // Back on the standard set, which is the old default: it must stay in the address as a choice, or
  // the next read would take it for "say nothing" and hide both columns again.
  await expect.poll(() => new URL(page.url()).searchParams.get('ghide')).toBe('predecessors');

  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect(header(page, 'Code').first()).toBeVisible();
  await expect(header(page, 'Finish').first()).toBeVisible();

  await openColumns(page);
  await expect(page.getByText(REASON)).toHaveCount(0);
});

test('a stated "show everything" wins at a narrow width', async ({ page }) => {
  test.setTimeout(180_000);
  await ganttPlan(page);
  await page.goto(`${page.url().split('?')[0]}?view=gantt&ghide=none`);
  await expect(ganttGrid(page)).toBeVisible();
  for (const name of ['Code', 'Finish', 'Predecessors']) {
    await expect(header(page, name).first()).toBeVisible();
  }
});

test("a wide window keeps today's columns", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ganttPlan(page);
  expect(new URL(page.url()).searchParams.has('ghide')).toBe(false);
  await expect(header(page, 'Code').first()).toBeVisible();
  await expect(header(page, 'Finish').first()).toBeVisible();
  await expect(header(page, 'Predecessors', true)).toHaveCount(0);
});

test('widening the window after opening narrow changes nothing until the view opens again', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ganttPlan(page);
  await expect(header(page, 'Code', true)).toHaveCount(0);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(ganttGrid(page)).toBeVisible();
  await expect(header(page, 'Code', true)).toHaveCount(0);
  await expect(header(page, 'Finish', true)).toHaveCount(0);
});
