import { type CDPSession, type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttGrid,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  startEditing,
  syncClient,
} from './support';

/**
 * **The Gantt's month labels at 200 % text** (#501, `docs/specs/pre-1-0-batch-2/m5-measurement.md`).
 *
 * The labels are in `rem`, so at 200 % text "Sept 2027" is ~99 px wide while the thinning step
 * assumed ~50. At the 1024 x 600 floor the Quarter preset put 65.5 px between labels that wide and
 * three of four neighbours overprinted. A unit suite cannot ask: jsdom has no layout, so the probe
 * the ruler measures reads zero there. This reads the real glyph boxes through the zoom presets.
 *
 * The text size is the browser's default font size through `Page.setFontSizes` (so `rem`
 * answers), asserted at 32 px before anything is read; a silent failure to apply it would read an
 * ordinary window and pass for the wrong reason.
 */

const PRESETS = ['Day', 'Week', 'Month', 'Quarter', 'Year'] as const;

async function applyFontSize(cdp: CDPSession, scale: 1 | 2): Promise<void> {
  await cdp.send('Page.setFontSizes', {
    fontSizes: {
      standard: 16 * scale,
      fixed: 13 * scale,
      serif: 16 * scale,
      sansSerif: 16 * scale,
    },
  } as never);
}

/** Self-contained (Playwright serialises it). Glyph boxes, so padding is not counted. */
function readMonthLabels(): { labels: number; overlaps: number; clearance: number } {
  const header = document.querySelector<HTMLElement>('[role="row"][aria-rowindex="1"]');
  const ruler = header?.lastElementChild?.querySelector<HTMLElement>('.relative.h-full');
  if (!header || !ruler) throw new Error('no Gantt ruler');
  const boxes = [...ruler.querySelectorAll<HTMLElement>('span')].map((s) => {
    const range = document.createRange();
    range.selectNodeContents(s);
    const g = range.getBoundingClientRect();
    return { left: g.left, right: g.right, bottom: g.bottom };
  });
  boxes.sort((a, b) => a.left - b.left);
  let overlaps = 0;
  for (let i = 1; i < boxes.length; i += 1) if (boxes[i]!.left < boxes[i - 1]!.right) overlaps += 1;
  const rulerBottom = header.getBoundingClientRect().bottom;
  return {
    labels: boxes.length,
    overlaps,
    clearance: boxes.length ? rulerBottom - Math.max(...boxes.map((b) => b.bottom)) : 0,
  };
}

async function longPlan(page: Page): Promise<void> {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Month labels');
  await startEditing(page);
  await seedActivities(page, orgSlug, 1);
  // Months to label: the seeded 5-day activity alone would frame days, not a ruler of months.
  const planId = openPlanId(page);
  const failure = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const created = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Long haul', code: 'L0001', durationDays: 200 }),
      });
      if (!created.ok) return `create ${created.status}`;
      const recalculated = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      return recalculated.ok ? null : `recalculate ${recalculated.status}`;
    },
    { org: orgSlug, id: planId },
  );
  expect(failure, 'the long activity was seeded').toBeNull();
  await syncClient(page);
}

test.describe('the Gantt ruler at 200 % text', () => {
  test.describe.configure({ timeout: 240_000 });
  test.use({ acknowledgeViewportNotice: true });

  test('no two month labels overprint, and the labels stay inside the ruler, at any preset', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await longPlan(page);
    const planUrl = page.url();
    const cdp = await page.context().newCDPSession(page);
    try {
      await applyFontSize(cdp, 2);
      await page.goto(planUrl);
      await showGantt(page);
      const readRoot = (): Promise<string> =>
        page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      if ((await readRoot()) !== '32px') {
        // The renderer can drop the override across a navigation; set it again and reload.
        await applyFontSize(cdp, 2);
        await page.reload();
        await showGantt(page);
      }
      expect(await readRoot(), 'setFontSizes moved the root font size, so rem answers').toBe(
        '32px',
      );
      await expect(ganttGrid(page)).toBeVisible();

      const framings = ['arrival', ...PRESETS] as const;
      for (const framing of framings) {
        if (framing !== 'arrival') {
          await page.getByRole('button', { name: 'View', exact: true }).click();
          await page.getByRole('radio', { name: new RegExp(`^${framing}\\b`) }).check();
          await page.keyboard.press('Escape');
        }
        // Labels are placed by the measured probe: wait until a layout pass has landed.
        await expect
          .poll(async () => (await page.evaluate(readMonthLabels)).overlaps, {
            message: `${framing}: month labels overprint`,
          })
          .toBe(0);
        const facts = await page.evaluate(readMonthLabels);
        expect(
          facts.clearance,
          `${framing}: label bottom sits inside the 34 px ruler`,
        ).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await applyFontSize(cdp, 1);
      await cdp.detach();
    }
  });
});
