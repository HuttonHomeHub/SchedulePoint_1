import { expect, type Page, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **#478: do the ruler's day numbers overprint at 200 % text?** (`docs/specs/pre-1-0-hardening/
 * m7-measurement.md`.) The row was raised from a reviewer's screenshot and never measured
 * (ADR-0113). At 1280 x 800, once at 100 % and once at text-only 200 % (the browser's default font
 * size through `Page.setFontSizes`, so `rem` answers), at the arrival framing and at each zoom
 * preset: the day pitch, the widest day label, and how many adjacent label pairs overlap, both by
 * glyph box and by padded box. A harness, not a gate (ADR-0081 s3).
 */

const PRESETS = ['Day', 'Week', 'Month', 'Quarter', 'Year'] as const;

async function setFont(page: Page, scale: 1 | 2): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.setFontSizes', {
    fontSizes: {
      standard: 16 * scale,
      fixed: 13 * scale,
      serif: 16 * scale,
      sansSerif: 16 * scale,
    },
  } as never);
  await cdp.detach();
}

/** Self-contained (Playwright serialises it). */
function readDays(): Record<string, unknown> {
  const ruler = document.querySelector<HTMLElement>('[data-testid="tsld-ruler"]');
  const row = ruler?.children[2] as HTMLElement | undefined;
  if (!ruler || !row) throw new Error('no ruler day row');
  const spans = [...row.querySelectorAll<HTMLElement>('span')].filter(
    (s) => s.style.display !== 'none',
  );
  const glyph = spans.map((s) => {
    const range = document.createRange();
    range.selectNodeContents(s);
    const g = range.getBoundingClientRect();
    const b = s.getBoundingClientRect();
    return { text: s.textContent ?? '', gl: g.left, gr: g.right, bl: b.left, br: b.right };
  });
  glyph.sort((a, b) => a.bl - b.bl);
  let glyphOverlaps = 0;
  let paddedOverlaps = 0;
  for (let i = 1; i < glyph.length; i += 1) {
    const p = glyph[i - 1]!;
    const c = glyph[i]!;
    if (c.gl < p.gr) glyphOverlaps += 1;
    if (c.bl < p.br) paddedOverlaps += 1;
  }
  const pitches = glyph.slice(1).map((c, i) => c.bl - glyph[i]!.bl);
  const rowCs = getComputedStyle(row);
  return {
    rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    rulerFontPx: parseFloat(getComputedStyle(ruler).fontSize),
    rowHeight: row.getBoundingClientRect().height,
    rowOverflow: rowCs.overflow,
    labels: glyph.length,
    pitchPx: pitches.length ? Math.round(Math.min(...pitches) * 10) / 10 : null,
    widestGlyphPx: Math.round(Math.max(0, ...glyph.map((g) => g.gr - g.gl)) * 10) / 10,
    widestPaddedPx: Math.round(Math.max(0, ...glyph.map((g) => g.br - g.bl)) * 10) / 10,
    glyphOverlappingPairs: glyphOverlaps,
    paddedOverlappingPairs: paddedOverlaps,
  };
}

test.use({ actionTimeout: 8_000 });

test('#478 ruler day labels at 100 % and 200 % text', async ({ page }) => {
  test.setTimeout(600_000);
  // 200 % text makes 1280 px 40 rem wide, which raises the below-the-floor notice (ADR-0179).
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, '1');
  }, VIEWPORT_NOTICE_ACK_KEY);
  const name = 'ruler-days-200pc';
  clearMeasurement(name);
  const stamp = Date.now() + 478;
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, 'Ruler day labels');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 30 },
    { name: 'Dig footings', laneIndex: 1, durationDays: 45 },
  ]);
  await recalculate(page, orgSlug);
  const planUrl = page.url();
  const record: Record<string, unknown> = { viewport: '1280x800', cells: [] };
  const cells = record.cells as unknown[];

  for (const scale of [1, 2] as const) {
    await setFont(page, scale);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(planUrl);
    await expect(page.getByTestId('tsld-ruler')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    cells.push({ text: scale, framing: 'arrival', ...(await page.evaluate(readDays)) });
    for (const preset of PRESETS) {
      await page.getByRole('button', { name: 'View', exact: true }).click();
      await page.getByRole('radio', { name: new RegExp(`^${preset}\\b`) }).check();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      cells.push({ text: scale, framing: preset, ...(await page.evaluate(readDays)) });
    }
    writeMeasurement(name, record);
  }
  await setFont(page, 1);
  expect(cells.length).toBeGreaterThan(0);
});
