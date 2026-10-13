import { expect, type CDPSession, type Page, test } from '@playwright/test';

import { createClient, createPlan, createProject, onboard, showGantt } from '../e2e-gantt/support';
import { ensurePen, recalculate, seedActivities } from '../e2e-workspace-chrome/support';
import { clearMeasurement, writeMeasurement } from '../measure-toolbar/output';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

/**
 * **#501: do the Gantt ruler's month labels overprint or clip at 200 % text?**
 * (`docs/specs/pre-1-0-batch-2/m5-measurement.md`.) `MONTH_LABEL_MIN_PITCH_PX` was reasoned from the
 * 10 px type size and never measured (ADR-0113). At 1280 x 800 and the 1024 x 600 floor, once at 100 % and once at text-only
 * 200 % (the browser's default font size through `Page.setFontSizes`, so `rem` answers), at the
 * arrival framing and at each zoom preset: the pitch between month labels, the widest label, how
 * many adjacent pairs overlap by glyph box, and where the label's bottom sits against the ruler's
 * 34 px row. A harness, not a gate (ADR-0081 s3); it asserts only that the instrument worked.
 */

/** The brief's window, and the design floor (ADR-0179), where the preset pitches are smallest. */
const WINDOWS = [
  { width: 1280, height: 800 },
  { width: 1024, height: 600 },
] as const;

const PRESETS = ['Day', 'Week', 'Month', 'Quarter', 'Year'] as const;

async function applyFont(cdp: CDPSession, scale: 1 | 2): Promise<void> {
  await cdp.send('Page.setFontSizes', {
    fontSizes: {
      standard: 16 * scale,
      fixed: 13 * scale,
      serif: 16 * scale,
      sansSerif: 16 * scale,
    },
  } as never);
}

/** Self-contained (Playwright serialises it). */
function readMonths(): Record<string, unknown> {
  const header = document.querySelector<HTMLElement>('[role="row"][aria-rowindex="1"]');
  const cell = header?.lastElementChild as HTMLElement | null | undefined;
  const ruler = cell?.querySelector<HTMLElement>('.relative.h-full');
  if (!header || !cell || !ruler) throw new Error('no Gantt ruler');
  const spans = [...ruler.querySelectorAll<HTMLElement>('span')];
  const rulerBottom = header.getBoundingClientRect().bottom;
  const boxes = spans.map((s) => {
    const range = document.createRange();
    range.selectNodeContents(s);
    const g = range.getBoundingClientRect();
    const b = s.getBoundingClientRect();
    return {
      text: s.textContent ?? '',
      gl: g.left,
      gr: g.right,
      gb: g.bottom,
      bl: b.left,
      bb: b.bottom,
    };
  });
  boxes.sort((a, b) => a.bl - b.bl);
  let overlaps = 0;
  for (let i = 1; i < boxes.length; i += 1) if (boxes[i]!.gl < boxes[i - 1]!.gr) overlaps += 1;
  const pitches = boxes.slice(1).map((c, i) => c.bl - boxes[i]!.bl);
  const round = (n: number): number => Math.round(n * 10) / 10;
  return {
    rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    labelFontPx: spans[0] ? parseFloat(getComputedStyle(spans[0]).fontSize) : null,
    rulerRowHeight: header.getBoundingClientRect().height,
    labels: boxes.length,
    sample: boxes.slice(0, 3).map((b) => b.text),
    pitchPx: pitches.length ? round(Math.min(...pitches)) : null,
    widestGlyphPx: round(Math.max(0, ...boxes.map((g) => g.gr - g.gl))),
    glyphOverlappingPairs: overlaps,
    // Positive = the glyphs end inside the ruler row; negative = they hang below it (clipped).
    labelBottomClearancePx: boxes.length
      ? round(rulerBottom - Math.max(...boxes.map((g) => g.gb)))
      : null,
    boxBottomClearancePx: boxes.length
      ? round(rulerBottom - Math.max(...boxes.map((g) => g.bb)))
      : null,
  };
}

async function readRoot(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
}

test.use({ actionTimeout: 8_000 });

test('#501 Gantt month labels at 100 % and 200 % text', async ({ page }) => {
  test.setTimeout(600_000);
  // 200 % text makes 1280 px 40 rem wide, which raises the below-the-floor notice (ADR-0179).
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, '1');
  }, VIEWPORT_NOTICE_ACK_KEY);
  const name = 'month-labels-200pc';
  clearMeasurement(name);
  const orgSlug = await onboard(page, Date.now() + 501);
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Month labels');
  await ensurePen(page);
  // Long enough that every preset has months to label; the arrival framing fits the plan.
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 120 },
    { name: 'Dig footings', laneIndex: 1, durationDays: 200 },
  ]);
  await recalculate(page, orgSlug);
  const planUrl = page.url();
  const record: Record<string, unknown> = { cells: [] };
  const cells = record.cells as unknown[];

  const cdp = await page.context().newCDPSession(page);
  for (const { scale, win } of WINDOWS.flatMap((w) =>
    [1, 2].map((sc) => ({ scale: sc as 1 | 2, win: w })),
  )) {
    await applyFont(cdp, scale);
    await page.setViewportSize(win);
    await page.goto(planUrl);
    await showGantt(page);
    if ((await readRoot(page)) !== `${16 * scale}px`) {
      // The override can be dropped across the navigation; set it again and reload.
      await applyFont(cdp, scale);
      await page.reload();
      await showGantt(page);
    }
    // Without this the 200 % cells would silently read an ordinary window.
    expect(await readRoot(page), 'setFontSizes moved the root font size').toBe(`${16 * scale}px`);
    await page.waitForTimeout(800);
    cells.push({
      window: `${win.width}x${win.height}`,
      text: scale,
      framing: 'arrival',
      ...(await page.evaluate(readMonths)),
    });
    for (const preset of PRESETS) {
      await page.getByRole('button', { name: 'View', exact: true }).click();
      await page.getByRole('radio', { name: new RegExp(`^${preset}\\b`) }).check();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      cells.push({
        window: `${win.width}x${win.height}`,
        text: scale,
        framing: preset,
        ...(await page.evaluate(readMonths)),
      });
    }
    writeMeasurement(name, record);
  }
  await applyFont(cdp, 1);
  expect(cells.length).toBeGreaterThan(0);
});
