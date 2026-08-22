import { expect, test, type Page } from '@playwright/test';

import { writeMeasurement } from './output';
import {
  createHierarchy,
  newPlan,
  onboard,
  setPreset,
  TARGET_HEIGHT,
  TARGET_WIDTH,
} from './support';

/**
 * **M0-T2 — how often do `Data date` and `Today` actually collide?** This settles **CQ-1**, whose
 * default (withhold `Today`'s label on a near-but-not-coincident overlap) is only defensible if the
 * overlap is rare. On a live programme the data date is *near* today by definition, so "rare" is a
 * claim that has to be measured rather than argued.
 *
 * **It observes rather than computes.** The two pills are painted on the scene canvas TODAY, on
 * separate rows (`paint.ts:1376`, `:1399`), which is exactly what makes them readable as a pair:
 * this pass scans the real painted pixels for each pill and reports whether the two x intervals
 * intersect. That is the number the arithmetic cannot produce, because the arithmetic omits the
 * edge clamp (`cx = max(0, min(centre − w/2, width − w))`).
 *
 * **Two things make the scan honest, and the first draft had neither.**
 *
 * 1. **The plan is EMPTY — no activities.** The first draft seeded three and recognised a pill as
 *    "a run of non-ground pixels", which measured the bars: `fitToContent` pins `originY = 32`
 *    (`viewport.ts:180`), so lane 0 sits directly under both pill rows. Its control failed loudly —
 *    at 200 days apart it reported 473 px-wide "pills" overlapping — which is the only reason the
 *    reading is not in this milestone's numbers document as a fact. ADR-0032 M1 renders the canvas
 *    from a timeline anchor alone, so an empty plan still draws both rules and both pills.
 * 2. **A pill is matched by COLOUR, not by "not the ground".** The alternating month bands
 *    (ADR-0055 §4) give the row two grounds, so a modal-colour test invents a run at every band
 *    boundary. `palette.today` is `--destructive` and `palette.dataDate` is `--foreground`
 *    (`render/palette.ts:103`, `:112`), resolved in the canvas surface scope; the scan resolves the
 *    same two tokens from the live DOM and matches exactly.
 *
 * **Where it bypasses the product** (ADR-0081 §3): it reads canvas pixels, which no planner does,
 * and it runs at the arrival viewport only.
 */

/**
 * Separations between the plan's data date and today, in days. Zero is the coincident case the
 * product already merges; 200 is well past any preset's threshold and is the control — if 200
 * overlaps, the scan is measuring something other than the pills.
 */
const SEPARATIONS = [0, 3, 7, 30, 200] as const;
const PRESETS = ['Day', 'Week', 'Month', 'Quarter', 'Year'] as const;

/** `YYYY-MM-DD` for today minus `days`, in the local calendar the plan form uses. */
function dataDateFor(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Run {
  from: number;
  to: number;
  width: number;
}

/**
 * Resolve a canvas-palette token to the **device pixels the painter produces**.
 *
 * Not `getComputedStyle().color`: these tokens are authored in `oklch` and Chrome returns the
 * `oklch(...)` string unconverted, which cannot be compared to an `ImageData` byte. Filling a 1×1
 * canvas with the token's own string is the same conversion the painter performs
 * (`resolveTsldPalette` hands the raw value straight to `ctx.fillStyle`), so the answer is exactly
 * the colour on screen rather than a re-derivation of it.
 *
 * The value is read **on the scene canvas element**, so a surface rebind in scope there is what
 * comes back (ADR-0102's finding that the canvas scope had never reached the painter).
 */
async function resolveToken(page: Page, name: string): Promise<[number, number, number]> {
  return page
    .locator('canvas.touch-none')
    .first()
    .evaluate((el, prop: string) => {
      const raw = getComputedStyle(el).getPropertyValue(prop).trim();
      if (raw === '') throw new Error(`${prop} is not declared in scope on the scene canvas`);
      const probe = document.createElement('canvas');
      probe.width = 1;
      probe.height = 1;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no 2d context for the colour probe');
      ctx.fillStyle = raw;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b] as [number, number, number];
    }, name);
}

/** Scan one canvas row for runs of pixels matching a fill colour exactly. */
async function scanRow(
  page: Page,
  y: number,
  rgb: [number, number, number],
  minWidth: number,
): Promise<Run[]> {
  return page
    .locator('canvas.touch-none')
    .first()
    .evaluate(
      (el, args: { y: number; rgb: [number, number, number]; minWidth: number }) => {
        const canvas = el as HTMLCanvasElement;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no 2d context on the scene canvas — nothing to judge');
        const dpr = canvas.width / canvas.getBoundingClientRect().width;
        const row = ctx.getImageData(0, Math.round(args.y * dpr), canvas.width, 1).data;
        const [r, g, b] = args.rgb;
        const runs: { from: number; to: number; width: number }[] = [];
        let start: number | null = null;
        for (let x = 0; x <= canvas.width; x += 1) {
          const hit =
            x < canvas.width &&
            row[x * 4] === r &&
            row[x * 4 + 1] === g &&
            row[x * 4 + 2] === b &&
            row[x * 4 + 3] === 255;
          if (hit && start === null) start = x;
          else if (!hit && start !== null) {
            const from = Math.round(start / dpr);
            const to = Math.round(x / dpr);
            if (to - from >= args.minWidth) runs.push({ from, to, width: to - from });
            start = null;
          }
        }
        return runs;
      },
      { y, rgb, minWidth },
    );
}

test('M0-T2 — the data-date/today overlap, observed at five separations', async ({ page }) => {
  test.setTimeout(600_000);
  const stamp = Date.now();
  await page.setViewportSize({ width: TARGET_WIDTH, height: TARGET_HEIGHT });
  await onboard(page, stamp);
  await createHierarchy(page);

  const report: Record<string, unknown> = {};
  let canvasWidth = 0;
  for (const sep of SEPARATIONS) {
    // Deliberately NO activities: see the docblock. The canvas renders from the timeline anchor.
    await newPlan(page, `Sep${String(sep)}`, dataDateFor(sep));
    await expect(page.getByTestId('tsld-ruler')).toBeVisible();
    await expect(page.locator('canvas.touch-none').first()).toBeVisible();
    const todayRgb = await resolveToken(page, '--destructive');
    const dataRgb = await resolveToken(page, '--foreground');
    canvasWidth = await page
      .locator('canvas.touch-none')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width));

    const perPreset: Record<string, unknown> = {};
    for (const preset of PRESETS) {
      await setPreset(page, preset);
      // Two px BELOW each pill's top edge (`TODAY_CHIP_TOP` 24, `DATA_DATE_CHIP_TOP` 44), not at
      // its vertical centre. The centre is the text baseline row, so the ink breaks the fill into
      // sub-12 px fragments and a run scan finds nothing at all — which is what the first version
      // of this pass reported, uniformly, for every plan. Cross-checked: at y = 26 the Today fill
      // measures 37 px against M0-T1's predicted 37.8, and at y = 46 the Data date fill measures
      // 59 px against 60.6, so the scan and the label measurement agree to a pixel.
      const today = await scanRow(page, 26, todayRgb, 12);
      const dataDate = await scanRow(page, 46, dataRgb, 12);
      const t = today[0] ?? null;
      const d = dataDate[0] ?? null;
      perPreset[preset] = {
        todayPill: t,
        dataDatePill: d,
        // The merged case: the painter suppresses the Today rule and pill when the two rules round
        // to the same x, and widens the data-date label to `Data date · today` (`paint.ts:1356`,
        // `:1395`). A missing Today pill beside a ~105 px data-date pill IS that case, not a defect.
        merged: t === null && d !== null && d.width > 90,
        wouldOverlapOnOneRow: t !== null && d !== null ? t.from < d.to && d.from < t.to : null,
        clearancePx:
          t !== null && d !== null ? Math.max(t.from, d.from) - Math.min(t.to, d.to) : null,
        runCounts: { todayRow: today.length, dataDateRow: dataDate.length },
      };
    }
    report[`separation ${String(sep)}d`] = perPreset;
    await page.goBack();
    await page.goBack();
  }

  const path = writeMeasurement('axis-markers-m0-t2-overlap', {
    viewport: { width: TARGET_WIDTH, height: TARGET_HEIGHT },
    canvasWidth,
    method:
      'Empty plans, arrival viewport. A pill is a run of >= 12 px matching palette.today ' +
      '(--destructive) or palette.dataDate (--foreground) exactly.',
    report,
  });
  expect(Object.keys(report)).toHaveLength(SEPARATIONS.length);
  console.log(`wrote ${path}`);
});
