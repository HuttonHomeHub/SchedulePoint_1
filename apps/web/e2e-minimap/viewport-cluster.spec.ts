import { type BrowserContext, type Locator, type Page } from '@playwright/test';

import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  createHierarchy,
  diagramList,
  ensurePen,
  linkActivities,
  newPlan,
  onboard,
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

const intersects = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

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

  test('a keyboard reveal keeps the bottom-right-most activity out from under the cluster and the minimap (SC-15)', async () => {
    test.setTimeout(180_000);
    // The floor (1024 x 600): the stage is short enough that the corner is where a bar ends up. At
    // 1646 x 1097 the bottom-right activity sits hundreds of pixels above the column and the case
    // would pass without any reveal margin at all (checked: it did).
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

    // The column is a pointer-events layer; let the probe click through it, so a bar that IS under
    // the cluster is measured at its true extent and not clipped to the part that peeks out.
    const style = await page.addStyleTag({
      content:
        '[data-testid="tsld-viewport-column"], [data-testid="tsld-viewport-column"] * { pointer-events: none !important; }',
    });
    const canvas = page.locator('main canvas').first();
    const cbox = await box(canvas);
    const target = ids[ids.length - 1]!;
    const selected = async (): Promise<string | null> => {
      const active = await diagramList(page).getAttribute('aria-activedescendant');
      return /-opt-([0-9a-f-]{36})$/.exec(active ?? '')?.[1] ?? null;
    };
    // Find any point of the target by sweeping the canvas.
    let seed: { x: number; y: number } | null = null;
    for (let y = 16; y < cbox.h && !seed; y += 12) {
      for (let x = 12; x < cbox.w - 4; x += 24) {
        await page.mouse.click(cbox.x + x, cbox.y + y);
        if ((await selected()) === target) {
          seed = { x, y };
          break;
        }
      }
    }
    expect(seed, 'the last activity is not drawn anywhere on the canvas').not.toBeNull();
    const probe = async (x: number, y: number): Promise<boolean> => {
      if (x < 0 || y < 0 || x >= cbox.w || y >= cbox.h) return false;
      await page.mouse.click(cbox.x + x, cbox.y + y);
      return (await selected()) === target;
    };
    const walk = async (dx: number, dy: number): Promise<number> => {
      let n = 0;
      while (await probe(seed!.x + dx * (n + 1) * 3, seed!.y + dy * (n + 1) * 3)) n += 1;
      return n * 3;
    };
    const left = await walk(-1, 0);
    const right = await walk(1, 0);
    const up = await walk(0, -1);
    const down = await walk(0, 1);
    await style.evaluate((el) => (el as Element).remove());

    const bar = {
      x: cbox.x + seed!.x - left,
      y: cbox.y + seed!.y - up,
      w: left + right + 1,
      h: up + down + 1,
    };
    expect(bar.w, 'the probe found a degenerate bar').toBeGreaterThan(10);
    expect(
      intersects(bar, await box(clusterOf(page))),
      `the bar ${JSON.stringify(bar)} is under the cluster`,
    ).toBe(false);
    expect(
      intersects(bar, await box(panel)),
      `the bar ${JSON.stringify(bar)} is under the minimap`,
    ).toBe(false);
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
});

test.describe('The Diagram viewport cluster, under a finger', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1024, height: 600 },
      hasTouch: true,
    });
    await acknowledgeViewportNotice(context);
    page = await context.newPage();
    const orgSlug = await onboard(page, Date.now() + 5300);
    await createHierarchy(page);
    await newPlan(page, 'Cluster touch');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate', laneIndex: 1, durationDays: 18 },
    ]);
    await recalculate(page, orgSlug);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('at 1024 x 600 a selection leaves the stage too short for the minimap: it steps aside, the cluster stays', async () => {
    const pointer = await page.evaluate(() =>
      window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
    );
    expect(pointer).toBe('coarse');
    // Selecting an activity docks its bar in the foot row, which takes the height the column needs.
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const toggle = minimapToggle(page);
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(toggle).toHaveAccessibleDescription('Not enough room for the minimap');
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toHaveCount(0);
    // The cluster is whole: four 44 px targets, below the ruler.
    const cluster = await box(clusterOf(page));
    const ruler = await box(page.getByTestId('tsld-ruler'));
    expect(cluster.y).toBeGreaterThanOrEqual(ruler.y + ruler.h);
    for (const name of ['Zoom out', 'Zoom in', 'Fit to plan', 'Minimap']) {
      const b = await box(clusterOf(page).getByRole('button', { name }));
      expect(b.w, `${name} is under 44 px wide`).toBeGreaterThanOrEqual(44);
      expect(b.h, `${name} is under 44 px tall`).toBeGreaterThanOrEqual(44);
    }
  });
});
