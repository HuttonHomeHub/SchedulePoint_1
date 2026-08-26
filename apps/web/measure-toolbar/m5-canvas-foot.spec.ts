import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Would the Author card fit in the canvas foot, and what would it displace?**
 *
 * The product owner asked to move the deck's Author group out of the command band and into the
 * Activities handle row, so the remaining three cards could sit on one line. That is only worth
 * specifying if it fits — and the row is not empty in the sense the proposal assumes.
 *
 * ADR-0092 made this row **the canvas dock**: `activity-bottom-panel.tsx` records that it "already
 * existed, 36 px tall, with the word Activities at one end and an expand button at the other and
 * the entire width between them empty — so the diagram's transient strips (the armed-tool
 * statement, the selection bars, the conflict banner, the empty-plan notice) fill a gap the
 * workspace was paying for either way". A permanent 10-item toolbar in that gap competes with every
 * one of those strips, and the row is `min-h-9` rather than `h-9`, so the competition resolves by
 * the row **growing** — which is the height this whole exercise is trying to save.
 *
 * So this measures the row in three states: at rest, with a tool armed, and with an activity
 * selected. Author needs **608 px**.
 *
 * **The first probe of this row found nothing** and reported `handle: null`. It searched for text
 * containing "New activity", which belongs to the EXPANDED panel's header — the collapsed bar has
 * no such control. The row carries `data-activities-bar` precisely because locating this chrome by
 * its copy has bitten three times (that attribute's own comment says so), and the probe did it a
 * fourth time. Fixed here rather than worked around.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
];

const AUTHOR_CARD_PX = 608;
const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

test('M0: the canvas foot at rest, armed, and with a selection', async ({ page }) => {
  clearMeasurement('m5-canvas-foot');
  test.setTimeout(300_000);

  await page.setViewportSize(VIEWPORTS[0]!);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, PLAN_NAME);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const readRow = (): Promise<unknown> =>
    page.evaluate(() => {
      const round = (n: number): number => Math.round(n);
      const row = document.querySelector('[data-activities-bar]');
      if (!row) return { error: 'no [data-activities-bar] — is the panel expanded?' };
      const box = row.getBoundingClientRect();
      const children = [...row.children].map((c) => {
        const b = c.getBoundingClientRect();
        return {
          tag: c.tagName,
          width: round(b.width),
          text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 55),
        };
      });
      const used = children.reduce((s, c) => s + c.width, 0);
      // `gap-2` between however many children are present, plus `px-4` either side.
      const gaps = Math.max(0, children.length - 1) * 8;
      return {
        rowWidth: round(box.width),
        rowHeight: round(box.height),
        childrenWidth: used,
        gaps,
        padding: 32,
        free: round(box.width - used - gaps - 32),
        children,
      };
    });

  const report: Record<string, unknown> = { planName: PLAN_NAME, authorCardPx: AUTHOR_CARD_PX };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    const atRest = await readRow();

    // Arm the Add tool — the armed-tool statement is the strip the product owner called a
    // "helper tip", and it is the one that occupies this row most often.
    let armed: unknown = { skipped: 'Add control not found' };
    const add = page.getByRole('button', { name: /^Add$/ }).first();
    if (await add.isVisible().catch(() => false)) {
      await add.click();
      await page.waitForTimeout(400);
      armed = await readRow();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Select an activity through the canvas's own parallel listbox (ADR-0026 D7), which is a real
    // keyboard route and needs no bar coordinates.
    let selected: unknown = { skipped: 'no listbox option found' };
    const option = page.getByRole('option').first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await page.waitForTimeout(400);
      selected = await readRow();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    report[`${viewport.width}`] = { atRest, armed, selected };
  }

  const path = writeMeasurement('m5-canvas-foot', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
