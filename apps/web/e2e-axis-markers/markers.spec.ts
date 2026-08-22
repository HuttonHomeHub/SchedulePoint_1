import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **The axis markers' journey** (`docs/specs/canvas-axis-markers/`, `docs/TECH_DEBT.md` #148) —
 * lands with the first user-facing milestone, per ADR-0081.
 *
 * **This suite carries replacement guard (b), and it is the whole point of the epic.** For a year
 * `paint.test.ts` asserted that `TODAY_CHIP_TOP` cleared the cursor chip's footprint and that
 * `DATA_DATE_CHIP_TOP` cleared Today's — carefully, correctly, and about the wrong subject. **Both
 * asked whether the pills collided with each other. Nothing asked what was underneath them.** No
 * unit test in this repository could have: it is a question about two elements in a real layout,
 * and jsdom has none.
 *
 * So: for every visible marker, its rect must not intersect the scene canvas's — at more than one
 * pan position (`pan()` is unclamped, `render/viewport.ts:82-84`, and `fitToContent` starts at
 * `originY = 32`, so "the first two lanes" was only ever one frame of a continuum), at more than
 * one zoom preset, and **as a reader who does not hold the pen** as well as one who does. A Viewer
 * and an External Guest are two of the three audiences and neither can see the cursor readout at
 * all, so a fix verified with the pen has verified one of them.
 *
 * The guard asserts **≥ 1 visible marker** alongside, so a green run can never mean "there are no
 * markers" — the ADR-0093 second-assertion pattern, after a gate that would have passed equally
 * whether the duplicate or the capability had gone. Markers are located by `[data-axis-marker]`,
 * never by their copy (the ADR-0091 M7 rule, after three journeys broke on a label change).
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 8200;

interface MarkerReport {
  markers: {
    kind: string;
    text: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[];
  scene: { left: number; top: number; right: number; bottom: number };
  intersecting: string[];
}

/**
 * Read every VISIBLE marker's rect and the scene canvas's, and report which intersect.
 *
 * "Visible" is a non-zero rect, not `display !== 'none'`: a retired pooled node is hidden with
 * `display: none` and still reports a rect of zeros at (0, 0), which has zero overhang against
 * anything and would sail through this assertion (trap T13 — the same 0-width hole ADR-0090 M0
 * records the first draft of a gate falling into).
 */
async function readMarkers(page: Page): Promise<MarkerReport> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.touch-none');
    if (!canvas) throw new Error('no scene canvas — the harness has nothing to judge');
    const s = canvas.getBoundingClientRect();
    const scene = { left: s.left, top: s.top, right: s.right, bottom: s.bottom };
    const markers = [...document.querySelectorAll<HTMLElement>('[data-axis-marker]')]
      .map((el) => {
        const b = el.getBoundingClientRect();
        return {
          kind: el.dataset.axisMarker ?? '',
          text: el.textContent ?? '',
          left: b.left,
          top: b.top,
          right: b.right,
          bottom: b.bottom,
        };
      })
      .filter((m) => m.right - m.left > 0 && m.bottom - m.top > 0);
    const intersecting = markers
      .filter(
        (m) =>
          m.left < scene.right &&
          scene.left < m.right &&
          m.top < scene.bottom &&
          scene.top < m.bottom,
      )
      .map((m) => `${m.kind}@${String(Math.round(m.top))}`);
    return { markers, scene, intersecting };
  });
}

/** Guard (b), plus the assertion that stops it passing vacuously. */
async function expectNoMarkerOverTheScene(page: Page, where: string): Promise<void> {
  const report = await readMarkers(page);
  expect(report.markers.length, `${where}: no marker is visible at all`).toBeGreaterThan(0);
  expect(report.intersecting, `${where}: marker(s) over the diagram`).toEqual([]);
}

test.describe('The axis markers', () => {
  test('never cover the diagram, at two pan positions and two presets, pen or no pen', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Axis markers journey');
    await ensurePen(page);

    // Lane 0 and lane 1 both occupied: those are the rows the old pills printed over, and the
    // bar in lane 0 is the one whose NAME the register's own screenshot shows obscured.
    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 30 },
      { name: 'Dig footings', laneIndex: 1, durationDays: 45 },
      { name: 'Pour foundations', laneIndex: 2, durationDays: 60 },
    ]);
    expect(seeded).toHaveLength(3);
    await recalculate(page, orgSlug);

    // ── The entry point is the diagram itself. Opening a plan IS the capability: there is no
    // toggle to press, which is why this journey's first assertion is that the marks are simply
    // there, in the ruler, without anybody asking for them.
    const ruler = page.getByTestId('tsld-ruler');
    await expect(ruler).toBeVisible();
    const persistentRow = page.getByTestId('tsld-axis-markers');
    await expect(persistentRow).toBeAttached();
    await expect
      .poll(async () => (await readMarkers(page)).markers.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The data date is the mark #148 was reported about, so its presence is asserted by name once
    // — here and nowhere else, so a copy change breaks one line rather than the suite.
    const report = await readMarkers(page);
    expect(report.markers.map((m) => m.kind)).toContain('dataDate');
    expect(report.markers.find((m) => m.kind === 'dataDate')?.text).toMatch(/Data date/);

    // ── **Without the pen first, and the ordering is a correction rather than a preference.**
    // The first version of this test asserted "arrival, pen held" here and only reached the no-pen
    // case at the end, where it timed out waiting for `Stop editing`. The page snapshot said why:
    // `recalculate()` ends in `page.reload()`, and a reload drops the client's ADR-0028 lease — so
    // every assertion above it had ALREADY been running without the pen while claiming otherwise.
    // A label that is wrong about which of the three audiences it covered is worse than no label.
    await expectNoMarkerOverTheScene(page, 'arrival, no pen — a Viewer and a guest see this');

    // ── With the pen. Two of the three audiences never hold it and neither ever sees the cursor
    // readout, so both states are asserted rather than one standing in for the other.
    await ensurePen(page);
    await expectNoMarkerOverTheScene(page, 'pen held');

    // ── A second pan position. `pan()` is unclamped, so the topmost lane is whichever the planner
    // scrolled to; a fix verified at the arrival viewport has verified the arrival viewport.
    const canvas = page.locator('canvas.touch-none').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('the scene canvas has no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 90, { steps: 8 });
    await page.mouse.up();
    await expectNoMarkerOverTheScene(page, 'after panning up 90 px');

    // ── A second zoom preset. The marks' x is a function of the scale, and the Month preset is
    // where M0-T2 measured the overlap rule actually biting.
    await page.getByRole('button', { name: /^View/ }).click();
    await page.getByRole('radio', { name: /^Month\b/ }).check();
    await page.keyboard.press('Escape');
    await expectNoMarkerOverTheScene(page, 'at the Month preset');
  });

  test('the cursor readout appears in the transient row during a gesture, still clear of the diagram', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Cursor readout journey');
    await ensurePen(page);
    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 30 },
      { name: 'Dig footings', laneIndex: 1, durationDays: 45 },
    ]);
    expect(seeded).toHaveLength(2);
    await recalculate(page, orgSlug);
    await ensurePen(page); // the reload above drops the ADR-0028 lease

    const canvas = page.locator('canvas.touch-none').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('the scene canvas has no box');

    // **This is the one state M2's journey structurally cannot reach.** The readout is written only
    // while the pointer is over the surface WITH the pen (`TsldCanvas.tsx`'s `onPointerMove` gate),
    // and it is the mark that moves — the persistent pair is a function of the viewport, this one
    // of the pointer. If the two rows were ever going to collide with each other or with a bar,
    // this is when.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
    await expect
      .poll(
        async () => (await readMarkers(page)).markers.filter((m) => m.kind === 'cursor').length,
        { timeout: 15_000 },
      )
      .toBe(1);

    await expectNoMarkerOverTheScene(page, 'while the cursor readout is showing');

    // …and during an actual drag, where the readout states the day that will be COMMITTED rather
    // than the pixel under the pointer, so it is at its widest and most likely to reach a bar.
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
    await expectNoMarkerOverTheScene(page, 'mid-drag');
    await page.mouse.up();
  });
});
