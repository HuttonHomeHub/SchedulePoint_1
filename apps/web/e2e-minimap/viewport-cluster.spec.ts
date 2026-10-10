import { type BrowserContext, type Locator, type Page } from '@playwright/test';

import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  createHierarchy,
  DATA_DATE,
  diagramList,
  ensurePen,
  linkActivities,
  newPlan,
  onboard,
  placeViaApi,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **The "Diagram viewport" cluster** (toolbar-redesign M4, CQ-1): Zoom out, Zoom in, Fit to plan and
 * the Minimap toggle at the diagram's bottom-right, the minimap stacked above them.
 *
 * Entry point: the Diagram view's "Diagram viewport" toolbar, then "Zoom in". Everything here is by
 * role and accessible name. What only a browser can say — and so what this suite is for — is the
 * geometry (the column between the ruler and the stage's bottom, the button that does not move when
 * the minimap opens), the Tab order across three composite widgets, a reveal that keeps a focused
 * bar out from under the column (WCAG 2.4.11), and focus surviving the view switching to the Gantt.
 */
test.describe.configure({ mode: 'serial' });

const CHAIN = ['Site setup', 'Excavate', 'Footings', 'Slab', 'Frame', 'Roof'] as const;

const clusterOf = (page: Page): Locator => page.getByRole('toolbar', { name: 'Diagram viewport' });
const minimapToggle = (page: Page): Locator =>
  clusterOf(page).getByRole('button', { name: 'Minimap' });

async function box(locator: Locator): Promise<{ x: number; y: number; w: number; h: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no bounding box');
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/** The box that is actually on screen for the diagram: the section, which the stage clips to. */
const stageOf = (page: Page): Locator =>
  page.locator('section[aria-label="Time-scaled logic diagram"]');

const within = (
  inner: { x: number; y: number; w: number; h: number },
  outer: { x: number; y: number; w: number; h: number },
): boolean =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.w <= outer.x + outer.w + 0.5 &&
  inner.y + inner.h <= outer.y + outer.h + 0.5;

/**
 * **The right and bottom edges of the selected bar, read from the canvas's own pixels.**
 *
 * The first version of this probe clicked its way to the bar, and a click SELECTS: once the keyboard
 * reveal also clears the column, a click on a bar near the corner pans it, so the bar being measured
 * moved under the probe. This reads nothing it can disturb. The scene canvas is copied with the bar
 * selected and again with the selection cleared (Escape on the list, which does not pan); what
 * differs is the selection ring and the bar's own highlighted links, and the bounding box of the
 * difference gives the bar's **right and bottom** edges exactly. Those are the two edges that matter
 * against a column at the stage's bottom-right: a bar is under it only if it reaches past the
 * column's left AND its top, and the box's left and top (which may include a link's elbow) are
 * always short of both. The selection is put back before returning.
 */
async function selectedBarCorner(page: Page): Promise<{ right: number; bottom: number }> {
  // The canvas repaints on a frame, so a capture can land before the ring is drawn: retry, which is
  // safe because each attempt leaves the bar selected again.
  let last = { right: -1, x: 0, y: 0, scaleX: 1, scaleY: 1, bottom: -1 };
  for (let attempt = 0; attempt < 3 && last.right <= 0; attempt += 1) {
    last = await readCorner(page);
    await page.keyboard.press('End');
    await page.waitForTimeout(600);
  }
  expect(
    last.right,
    'selecting the last activity changed no pixel: the probe saw no ring',
  ).toBeGreaterThan(0);
  return {
    right: last.x + (last.right + 1) / last.scaleX,
    bottom: last.y + (last.bottom + 1) / last.scaleY,
  };
}

async function readCorner(page: Page): Promise<{
  right: number;
  bottom: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}> {
  // Two reads of the same canvas; the first stays in the page, so no pixel crosses the protocol.
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const canvas = document.querySelector('main canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    (window as unknown as { __selected: ImageData }).__selected = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const corner = await page.evaluate(() => {
    const canvas = document.querySelector('main canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const cleared = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const selected = (window as unknown as { __selected: ImageData }).__selected;
    let right = -1;
    let bottom = -1;
    // The two images differ in height: the selection bar docks in the foot row and the stage
    // shrinks while the bar is selected. They share a top-left origin (a resize does not pan), so
    // the rows both have are the ones compared.
    const width = Math.min(selected.width, cleared.width);
    const height = Math.min(selected.height, cleared.height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const a = (y * selected.width + x) * 4;
        const b = (y * cleared.width + x) * 4;
        const delta =
          Math.abs(selected.data[a]! - cleared.data[b]!) +
          Math.abs(selected.data[a + 1]! - cleared.data[b + 1]!) +
          Math.abs(selected.data[a + 2]! - cleared.data[b + 2]!);
        if (delta < 60) continue;
        // The ring and the bar's highlighted links are the diagram's blue; a stripe or a wash that
        // also changes with the selection is not, and must not stretch the box.
        const blue = selected.data[a + 2]! - selected.data[a]!;
        if (blue < 40) continue;
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    const rect = canvas.getBoundingClientRect();
    return {
      right,
      bottom,
      x: rect.x,
      y: rect.y,
      scaleX: canvas.width / rect.width,
      scaleY: canvas.height / rect.height,
    };
  });
  return corner;
}

/**
 * **These cases depend on the plan the third case seeds**, and the file is serial for that reason.
 * Run alone (`-g`), "Fit to plan" is shaded on the empty plan and a click waits for it to enable
 * until the test's own timeout: a 180 s hang that reads as a product defect. A short assertion turns
 * that into the failure it is (found while verifying the reveal cases red with the margin disabled).
 */
async function expectPlanSeeded(page: Page): Promise<void> {
  await expect(
    clusterOf(page).getByRole('button', { name: 'Fit to plan' }),
    'the plan is empty: run this file whole, because the earlier "Zoom in" case seeds the activities',
  ).not.toHaveAttribute('aria-disabled', 'true', { timeout: 3_000 });
}

/** Whether a bar whose bottom-right corner is `corner` reaches into `obstacle` from its top-left. */
const cornerIsUnder = (
  corner: { right: number; bottom: number },
  obstacle: { x: number; y: number; w: number; h: number },
): boolean => corner.right > obstacle.x && corner.bottom > obstacle.y;

test.describe('The Diagram viewport cluster, under a mouse', () => {
  let page: Page;
  let orgSlug: string;
  const ids: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1646, height: 1097 } });
    orgSlug = await onboard(page, Date.now() + 5200);
    await createHierarchy(page);
    await newPlan(page, 'Cluster journey');
    // The empty plan first: the cluster is shaded, not absent.
    await expect(clusterOf(page)).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('before a diagram exists every button is shaded, focusable and says why', async () => {
    const zoomIn = clusterOf(page).getByRole('button', { name: 'Zoom in' });
    await expect(zoomIn).toHaveAttribute('aria-disabled', 'true');
    await zoomIn.focus();
    await expect(zoomIn).toBeFocused();
    await expect(zoomIn).toHaveAccessibleDescription('Add an activity to enable zoom');
    const minimap = minimapToggle(page);
    await expect(minimap).toHaveAttribute('aria-disabled', 'true');
    await expect(minimap).toHaveAccessibleDescription('Add an activity first');
    // Playwright treats aria-disabled as not enabled; the press is forced to prove it does nothing.
    await minimap.click({ force: true });
    await expect(minimap).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toHaveCount(0);
  });

  test('Zoom in changes the scale, and Fit puts it back', async () => {
    await ensurePen(page);
    const seeded = await seedActivities(
      page,
      orgSlug,
      CHAIN.map((name, laneIndex) => ({ name, laneIndex, durationDays: 10 })),
    );
    for (const s of seeded) ids.push(s.id);
    for (let i = 0; i + 1 < ids.length; i += 1) {
      await linkActivities(page, orgSlug, ids[i]!, ids[i + 1]!);
    }
    await recalculate(page, orgSlug);

    const ruler = page.getByTestId('tsld-ruler');
    await clusterOf(page).getByRole('button', { name: 'Fit to plan' }).click();
    const fitted = await ruler.innerText();
    await clusterOf(page).getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(async () => ruler.innerText()).not.toBe(fitted);
    await clusterOf(page).getByRole('button', { name: 'Fit to plan' }).click();
    await expect.poll(async () => ruler.innerText()).toBe(fitted);
  });

  test('the column sits between the ruler and the stage bottom, and opening the minimap never moves the button', async () => {
    const toggle = minimapToggle(page);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const before = await box(toggle);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const panel = page.getByRole('group', { name: 'Diagram overview' });
    await expect(panel).toBeVisible();
    const after = await box(toggle);
    expect(after, 'the Minimap button moved under the pointer when the panel opened').toEqual(
      before,
    );

    const mm = await box(panel);
    const cluster = await box(clusterOf(page));
    // Stacked: the minimap is wholly above the cluster, `gap-2` (8 px) between.
    expect(mm.y + mm.h).toBeLessThanOrEqual(cluster.y);
    expect(cluster.y - (mm.y + mm.h)).toBeCloseTo(8, 0);
    // Right-aligned, 12 px in from the stage's right edge.
    const stage = await box(page.getByTestId('tsld-viewport-column').locator('xpath=..'));
    expect(stage.x + stage.w - (cluster.x + cluster.w)).toBeCloseTo(12, 0);
    expect(stage.x + stage.w - (mm.x + mm.w)).toBeCloseTo(12, 0);
    // The ruler is the top bound.
    const ruler = await box(page.getByTestId('tsld-ruler'));
    expect(mm.y).toBeGreaterThanOrEqual(ruler.y + ruler.h);

    // The panel's own close button and the toggle are one fact.
    await page.getByRole('button', { name: 'Hide overview' }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('Tab order is the diagram, then the minimap, then the cluster', async () => {
    await minimapToggle(page).click();
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toBeVisible();
    await diagramList(page).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toBeFocused();
    await page.keyboard.press('Tab');
    // The overview's × is a tab stop of its own, inside the panel.
    await expect(page.getByRole('button', { name: 'Hide overview' })).toBeFocused();
    await page.keyboard.press('Tab');
    // The cluster is one roving stop: Tab lands on whichever control last held it (the earlier
    // test pressed Fit, so it is Fit), and the arrows walk the four from there.
    await expect(clusterOf(page).locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Home');
    await expect(clusterOf(page).getByRole('button', { name: 'Zoom out' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(clusterOf(page).getByRole('button', { name: 'Zoom in' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(minimapToggle(page)).toBeFocused();
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[role="toolbar"]')?.getAttribute('aria-label') ?? '',
      ),
    ).not.toBe('Diagram viewport');
    await minimapToggle(page).click();
  });

  test('the cluster is one tab stop with no group inside it: the arrows rove and never leave, Tab does', async () => {
    // One toolbar, one name: a screen reader would otherwise hear "Diagram viewport" and then a
    // "Navigate" group wrapped round the same four buttons.
    await expect(clusterOf(page).getByRole('group')).toHaveCount(0);
    await clusterOf(page).getByRole('button', { name: 'Zoom out' }).focus();
    for (const name of ['Zoom in', 'Fit to plan', 'Minimap', 'Zoom out']) {
      await page.keyboard.press('ArrowRight');
      // Past the last control the arrow wraps to the first: focus is still inside the cluster.
      await expect(clusterOf(page).getByRole('button', { name })).toBeFocused();
    }
    await page.keyboard.press('ArrowLeft');
    await expect(minimapToggle(page)).toBeFocused();
    // Exactly one control carries the tab stop, and it is the one the arrows left focus on.
    const stops = await clusterOf(page)
      .locator('[data-toolbar-item][tabindex="0"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-toolbar-item')));
    expect(stops).toEqual(['minimap']);
    // Shift+Tab leaves backwards and Tab comes back to that same one stop, not to another.
    await page.keyboard.press('Shift+Tab');
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[role="toolbar"]')?.getAttribute('aria-label') ?? '',
      ),
    ).not.toBe('Diagram viewport');
    await page.keyboard.press('Tab');
    await expect(minimapToggle(page)).toBeFocused();
    // Landing on the diagram's list selected an activity, and a selection docks its bar in the foot
    // row, which takes the stage the next cases need: put the diagram back as it was.
    await diagramList(page).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Clear selection' })).toHaveCount(0);
  });

  test('a cluster tooltip opens above the cluster, not over the foot row, and pressing the Minimap dismisses it', async () => {
    const zoomIn = clusterOf(page).getByRole('button', { name: 'Zoom in' });
    await zoomIn.focus();
    const tip = page.locator('[data-tooltip]');
    await expect(tip).toBeVisible();
    const cluster = await box(clusterOf(page));
    const tipBox = await box(tip);
    expect(tipBox.y + tipBox.h, 'the tip opened over the cluster or below it').toBeLessThanOrEqual(
      cluster.y,
    );
    // The press opens a panel directly above the button; the tip must not stay over it.
    await minimapToggle(page).click();
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toBeVisible();
    await expect(page.locator('[data-tooltip]')).toHaveCount(0);
    await minimapToggle(page).click();
  });

  test('a keyboard reveal keeps the bottom-right-most activity out from under the cluster and the minimap (SC-15)', async () => {
    test.setTimeout(180_000);
    // The floor (1024 x 600): the stage is short enough that the corner is where a bar ends up. At
    // 1646 x 1097 the bottom-right activity sits hundreds of pixels above the column and the case
    // would pass without any reveal margin at all (checked: it did).
    await expectPlanSeeded(page);
    await page.setViewportSize({ width: 1024, height: 600 });
    await clusterOf(page).getByRole('button', { name: 'Fit to plan' }).click();
    await minimapToggle(page).click();
    const panel = page.getByRole('group', { name: 'Diagram overview' });
    await expect(panel).toBeVisible();

    // The last activity of a chain is the right-most and lowest; End on the diagram's list selects
    // it by keyboard, and the selection-reveal pans it into view.
    await diagramList(page).focus();
    await page.keyboard.press('End');
    await page.waitForTimeout(500);

    const corner = await selectedBarCorner(page);
    expect(
      cornerIsUnder(corner, await box(clusterOf(page))),
      `the bar's corner ${JSON.stringify(corner)} is under the cluster`,
    ).toBe(false);
    // With a mouse the docked bar leaves the stage 246 px, which still holds the minimap, so the
    // panel is on screen beside the cluster and must be cleared too.
    await expect(panel).toBeVisible();
    expect(
      cornerIsUnder(corner, await box(panel)),
      `the bar's corner ${JSON.stringify(corner)} is under the minimap`,
    ).toBe(false);
    await page.keyboard.press('Escape');
    // The selection is gone, so the stage is tall again and the panel returns: close it.
    await expect(panel).toBeVisible();
    await minimapToggle(page).click();
    await page.setViewportSize({ width: 1646, height: 1097 });
  });

  test('switching to the Gantt removes the cluster, hands focus to the Gantt segment and leaves the band alone', async () => {
    await clusterOf(page).getByRole('button', { name: 'Zoom in' }).focus();
    const band = page.locator('[data-surface="chrome"]:not([data-activities-bar])');
    const bandBefore = await box(band);
    // A click on the view switch would move focus itself; dispatching the activation leaves focus
    // where the reader was, which is the case ADR-0135 is about (the view changing under them).
    await page.locator('[data-toolbar-item="view-gantt"]').dispatchEvent('click');
    await expect(clusterOf(page)).toHaveCount(0);
    await expect(page.locator('[data-toolbar-item="view-gantt"]')).toBeFocused();
    await expect(page.getByTestId('announcer')).toHaveText(
      'Diagram viewport controls are only in the Diagram view. Focus moved to Gantt.',
    );
    expect(await box(band), 'the band shifted when the cluster went').toEqual(bandBefore);
    await page.locator('[data-toolbar-item="view-tsld"]').click();
    await expect(clusterOf(page)).toBeVisible();
  });

  test('a docked panel narrows the stage: the minimap steps aside with its reason and the cluster stays', async () => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.locator('[data-toolbar-item="comments"]').click();
    await expect(page.getByTestId('tsld-viewport-slot')).toBeVisible();
    const toggle = minimapToggle(page);
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(toggle).toHaveAccessibleDescription('Not enough room for the minimap');
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toHaveCount(0);
    // The cluster is in the stage, left of the dock, and Zoom in still works.
    const cluster = await box(clusterOf(page));
    const stage = await box(page.getByTestId('tsld-viewport-column').locator('xpath=..'));
    expect(cluster.x + cluster.w).toBeLessThanOrEqual(stage.x + stage.w);
    await expect(clusterOf(page).getByRole('button', { name: 'Zoom in' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.locator('[data-toolbar-item="comments"]').click();
    await page.setViewportSize({ width: 1646, height: 1097 });
  });

  test('with a dock open the cluster still keeps the bottom-right-most activity clear of it (2.4.11)', async () => {
    test.setTimeout(180_000);
    // The dock narrows the stage to 386 px, so the cluster is 44 % of its width: the corner a
    // revealed bar lands in is smaller and the column is the biggest thing in it.
    await expectPlanSeeded(page);
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.locator('[data-toolbar-item="comments"]').click();
    await expect(page.getByTestId('tsld-viewport-slot')).toBeVisible();
    await clusterOf(page).getByRole('button', { name: 'Fit to plan' }).click();
    await diagramList(page).focus();
    await page.keyboard.press('End');
    await page.waitForTimeout(500);
    const corner = await selectedBarCorner(page);
    expect(
      cornerIsUnder(corner, await box(clusterOf(page))),
      `the bar's corner ${JSON.stringify(corner)} is under the cluster with a dock open`,
    ).toBe(false);
    await page.keyboard.press('Escape');
    await page.locator('[data-toolbar-item="comments"]').click();
    await page.setViewportSize({ width: 1646, height: 1097 });
  });
});

test.describe('The Diagram viewport cluster, under a finger', () => {
  let page: Page;
  let context: BrowserContext;
  let orgSlug: string;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1024, height: 600 },
      hasTouch: true,
    });
    await acknowledgeViewportNotice(context);
    page = await context.newPage();
    orgSlug = await onboard(page, Date.now() + 5300);
    await createHierarchy(page);
    await newPlan(page, 'Cluster touch');
    await ensurePen(page);
    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate', laneIndex: 1, durationDays: 18 },
    ]);
    await linkActivities(page, orgSlug, seeded[0]!.id, seeded[1]!.id);
    await recalculate(page, orgSlug);
  });

  test.afterAll(async () => {
    await context.close();
  });

  /** The reading every case below states: the visible stage, the cluster, and where each sits. */
  async function reading(): Promise<{
    stage: { x: number; y: number; w: number; h: number };
    cluster: { x: number; y: number; w: number; h: number };
    clusterVisible: boolean;
  }> {
    const stage = await box(stageOf(page));
    const clusterVisible = await clusterOf(page).isVisible();
    const cluster = clusterVisible ? await box(clusterOf(page)) : { x: 0, y: 0, w: 0, h: 0 };
    return { stage, cluster, clusterVisible };
  }

  test('at 1024 x 600 a selection leaves the stage too short for the minimap: it steps aside, the cluster stays and is on screen', async () => {
    const pointer = await page.evaluate(() =>
      window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
    );
    expect(pointer).toBe('coarse');
    // Selecting an activity docks its bar in the foot row, which takes the height the column needs.
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(600);
    const toggle = minimapToggle(page);
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(toggle).toHaveAccessibleDescription('Not enough room for the minimap');
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toHaveCount(0);
    // The cluster is whole — four 44 px targets — and inside the box that is on screen. (It used to
    // be anchored to the canvas's own bottom, which a short stage clips: drawn off screen and still
    // a Tab stop.)
    const { stage, cluster, clusterVisible } = await reading();
    expect(clusterVisible, 'the cluster is withdrawn although the stage can hold it').toBe(true);
    expect(
      within(cluster, stage),
      `the cluster ${JSON.stringify(cluster)} is outside the visible stage ${JSON.stringify(stage)}`,
    ).toBe(true);
    const ruler = await box(page.getByTestId('tsld-ruler'));
    expect(cluster.y).toBeGreaterThanOrEqual(ruler.y + ruler.h);
    for (const name of ['Zoom out', 'Zoom in', 'Fit to plan', 'Minimap']) {
      const b = await box(clusterOf(page).getByRole('button', { name }));
      expect(b.w, `${name} is under 44 px wide`).toBeGreaterThanOrEqual(44);
      expect(b.h, `${name} is under 44 px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test('the selection bar has a visible Clear selection, and it is the way out', async () => {
    const clear = page.getByRole('button', { name: 'Clear selection' });
    await expect(clear).toBeVisible();
    const b = await box(clear);
    expect(b.w).toBeGreaterThanOrEqual(44);
    expect(b.h).toBeGreaterThanOrEqual(44);
    await expect(clear).toHaveAttribute('aria-keyshortcuts', 'Escape');
    await clear.click();
    await expect(clear).toHaveCount(0);
    await expect(page.getByTestId('announcer')).toHaveText('Selection cleared.');
    // Focus is not dropped to <body>: the diagram's list takes it back.
    await expect(diagramList(page)).toBeFocused();
  });

  test('with a conflict selected the diagram keeps at least 120 px of stage and the cluster stays on screen', async () => {
    await ensurePen(page);
    await placeViaApi(page, orgSlug, 'Excavate', DATA_DATE);
    await recalculate(page, orgSlug);
    await page.reload();
    await expect(clusterOf(page)).toBeVisible();
    await page.getByRole('button', { name: 'Next conflict' }).click();
    await expect(page.getByRole('button', { name: 'Clear selection' })).toBeVisible();
    await page.waitForTimeout(600);
    const { stage, cluster, clusterVisible } = await reading();
    // The foot bar used to leave 89 px here (five lines in a 320 px column beside the facts).
    expect(stage.h, `the stage is ${String(stage.h)} px`).toBeGreaterThanOrEqual(120);
    expect(clusterVisible).toBe(true);
    expect(within(cluster, stage)).toBe(true);
  });

  test('where even that leaves no room the cluster is withdrawn from the Tab order, focus on it moves to the diagram, and View ▾ still fits the plan', async () => {
    // Standing on Zoom in when the stage shrinks: the column is hidden under the reader's focus.
    await clusterOf(page).getByRole('button', { name: 'Zoom in' }).focus();
    await page.setViewportSize({ width: 1024, height: 500 });
    await page.waitForTimeout(600);
    await expect(diagramList(page)).toBeFocused();
    await expect(page.getByTestId('announcer')).toHaveText(
      'Diagram viewport controls hidden: not enough room. Use View, Zoom.',
    );
    // Withdrawn means hidden and out of the tab order, not drawn clipped.
    await expect(clusterOf(page)).toBeHidden();
    await expect(page.getByTestId('tsld-viewport-slot').locator('button:visible')).toHaveCount(0);
    // The route that stays: View ▾ carries Fit to plan.
    await page.getByRole('button', { name: /^View/ }).click();
    const fit = page
      .getByRole('dialog', { name: 'View' })
      .getByRole('button', { name: 'Fit to plan' });
    await expect(fit).toBeVisible();
    await fit.click();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1024, height: 600 });
  });
});
