import { expect, test } from '@playwright/test';

import { writeMeasurement } from './output';
import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  seedAndRecalculate,
  setPreset,
  TARGET_HEIGHT,
  TARGET_WIDTH,
} from './support';

/**
 * **M0-T1, M0-T3 and M0-T7** — how wide the marks actually are, what the ruler band actually holds,
 * and what one DOM width read costs.
 *
 * **Where this bypasses the product** (ADR-0081 §3): the label widths are read from probe spans
 * mounted **inside the real ruler element**, not from markers the product draws — because the
 * markers do not exist yet and their width is the question. The spans inherit the real cascade, so
 * the number is the one a marker would get; it is not proof that a marker of that width *fits*,
 * which is M2's browser gate.
 *
 * Everything else here is the real product: real sign-up, real plan, real pen, real recalculation,
 * real zoom presets driven through the `View` menu.
 */

/** Every label the two marker rows can ever carry. */
const PERSISTENT = ['Today', 'Data date', 'Data date · today'] as const;
const TRANSIENT = [
  '2 Jan', // idle hover — the point form
  'Start 22 Sep', // reposition
  'Finish 30 Sep', // finish-edge resize
  '12 Sep – 30 Sep · 19d', // create — the range form
  '12 Sep – 30 Sep · 365d', // create — the widest the grammar allows
] as const;

const PRESETS = ['Day', 'Week', 'Month', 'Quarter', 'Year'] as const;

test('M0-T1/T3/T7 — label widths, ruler occupancy, and the cost of a layout read', async ({
  page,
}) => {
  const stamp = Date.now();
  await page.setViewportSize({ width: TARGET_WIDTH, height: TARGET_HEIGHT });
  const org = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, 'Axis', '2026-01-05');
  await ensurePen(page);
  await seedAndRecalculate(page, org, ['Excavate', 'Pour slab', 'Erect frame']);
  await ensurePen(page);

  const ruler = page.getByTestId('tsld-ruler');
  await expect(ruler).toBeVisible();

  // --- M0-T1 -----------------------------------------------------------------------------------
  // Two typographies, because the spec's rejected alternative turns on their difference: the
  // ruler's `text-xs` (the cascade a DOM marker inherits) and the painter's `LABEL_FONT`
  // (`geometry.ts:254`, what a canvas mark would measure).
  const widths = await ruler.evaluate(
    (el, labels: string[]) => {
      const host = el as HTMLElement;
      const probe = document.createElement('span');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.whiteSpace = 'pre';
      host.appendChild(probe);
      const resolved = getComputedStyle(probe);
      const rulerFont = `${resolved.fontStyle} ${resolved.fontWeight} ${resolved.fontSize}/${resolved.lineHeight} ${resolved.fontFamily}`;

      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) throw new Error('no 2d context — the harness has nothing to judge');
      ctx.font = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";

      const out: Record<string, { rulerDomPx: number; canvasFontPx: number }> = {};
      for (const label of labels) {
        probe.textContent = label;
        out[label] = {
          // 6px = the horizontal padding a marker would carry, matching the painter's
          // `LABEL_PAD_PX * 2` so the two columns are comparable.
          rulerDomPx: Math.round((probe.getBoundingClientRect().width + 6) * 10) / 10,
          canvasFontPx: Math.round((ctx.measureText(label).width + 6) * 10) / 10,
        };
      }
      probe.remove();
      return { rulerFont, rulerFontFamily: resolved.fontFamily, widths: out };
    },
    [...PERSISTENT, ...TRANSIENT],
  );

  // --- M0-T7 -----------------------------------------------------------------------------------
  // The cost of `getBoundingClientRect()` on a ruler-resident span, cold (first read after a style
  // write, i.e. a forced synchronous layout) and warm (no intervening write).
  const readCost = await ruler.evaluate((el) => {
    const host = el as HTMLElement;
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    host.appendChild(probe);
    const time = (fn: () => void, n: number): number => {
      const t0 = performance.now();
      for (let i = 0; i < n; i += 1) fn();
      return (performance.now() - t0) / n;
    };
    let sink = 0;
    // Cold: mutate text (invalidating layout) then read — the forced-reflow shape.
    const cold = time(() => {
      probe.textContent = `probe ${String(sink)}`;
      sink += probe.getBoundingClientRect().width;
    }, 200);
    probe.textContent = 'Data date';
    // Warm: read repeatedly with no write in between — what a memoised cache turns cold into.
    const warm = time(() => {
      sink += probe.getBoundingClientRect().width;
    }, 200);
    probe.remove();
    return {
      coldMsPerRead: Math.round(cold * 10000) / 10000,
      warmMsPerRead: Math.round(warm * 10000) / 10000,
      sink,
    };
  });

  // --- M0-T3 -----------------------------------------------------------------------------------
  // Ruler occupancy per preset. The three rows are absolutely positioned inside a 40px band
  // (`TsldCanvas.tsx:1875-1883`); this records, per preset, each row's y extent and the x extent of
  // the LEFTMOST label in each — the sticky month/year labels pinned at x = 0
  // (`time-scale.ts:213`, `:216`) are the CQ-2 subject, and a left-clamped marker lands on them.
  const occupancy: Record<string, unknown> = {};
  for (const preset of PRESETS) {
    await setPreset(page, preset);
    occupancy[preset] = await ruler.evaluate((el) => {
      const host = el as HTMLElement;
      const box = host.getBoundingClientRect();
      const rows = [...host.children].map((child) => {
        const row = child as HTMLElement;
        const rb = row.getBoundingClientRect();
        const labels = [...row.children].map((n) => {
          const b = (n as HTMLElement).getBoundingClientRect();
          return {
            text: (n as HTMLElement).textContent ?? '',
            left: Math.round(b.left - box.left),
            right: Math.round(b.right - box.left),
          };
        });
        labels.sort((a, b) => a.left - b.left);
        return {
          top: Math.round(rb.top - box.top),
          bottom: Math.round(rb.bottom - box.top),
          count: labels.length,
          leftmost: labels[0] ?? null,
          secondFromLeft: labels[1] ?? null,
        };
      });
      return { bandHeight: Math.round(box.height), rows };
    });
    await page
      .getByTestId('tsld-ruler')
      .screenshot({ path: `measure-output/ruler-${preset.toLowerCase()}.png` });
  }

  const path = writeMeasurement('axis-markers-m0-t1-t3-t7', {
    viewport: { width: TARGET_WIDTH, height: TARGET_HEIGHT },
    labelWidths: widths,
    layoutReadCost: readCost,
    rulerOccupancy: occupancy,
  });
  // The harness throws rather than reporting a verdict from an `undefined` (ADR-0097 Landing C).
  expect(Object.keys(widths.widths)).toHaveLength(PERSISTENT.length + TRANSIENT.length);
  expect(Object.keys(occupancy)).toHaveLength(PRESETS.length);
  console.log(`wrote ${path}`);
});
