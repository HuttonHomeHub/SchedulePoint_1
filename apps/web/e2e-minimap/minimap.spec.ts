import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **The minimap's journey** (ADR-0100, minimap M2-T7) — lands with the first user-facing
 * milestone, per ADR-0081: its opening moves ARE the entry point (`View ▾` → Panels →
 * `Minimap`, all by role and accessible name, never by copy or CSS selector — ADR-0091 M7's
 * rule after three journeys broke on labels).
 *
 * What only this suite can prove: the toggle row, the panel, the rectangle and the picture
 * exist **in the shipped workspace against a real API with the pen enforced** — the unit
 * suites mount the panel and the toolbar separately, and the register's most repeated defect
 * is a capability whose halves are each fine and whose seam is unreachable (ADR-0081 lists
 * five). The axe scan opts in `wcag22aa` + `target-size` because every legacy scan requests
 * WCAG 2.0 tags and axe ships `target-size` disabled — "the scan is green" is otherwise
 * meaningless about the one criterion a 44px close button is for (ADR-0090 M1).
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 4100;

test.describe('The minimap', () => {
  test('is reachable from View ▾, shows the picture and the rectangle, persists, and closes clean', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Minimap journey');
    await ensurePen(page);

    // ── Before any activity has computed dates: the row is SHADED with a reason, not hidden
    // (ADR-0082) — and it is not pressable.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const shadedRow = page.getByRole('checkbox', { name: 'Minimap' });
    await expect(shadedRow).toBeVisible();
    await expect(shadedRow).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    // ── Seed a small network through the real API and recalculate, so the picture has bars
    // and a critical path to draw.
    // Long durations on purpose: the M3 cases need a plan several viewport-pages wide, or the
    // rectangle legitimately spans the whole box at every preset and the pad (correctly)
    // swallows every click — which the first run of this journey established by screenshot.
    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0, durationDays: 40 },
      { name: 'Pour foundations', laneIndex: 1, durationDays: 80 },
      { name: 'Steel frame', laneIndex: 2, durationDays: 120 },
    ]);
    expect(seeded).toHaveLength(3);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // ── The entry point (the test's real subject): View ▾ → Panels → Minimap.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const row = page.getByRole('checkbox', { name: 'Minimap' });
    await expect(row).not.toBeChecked();
    await row.click();
    await page.keyboard.press('Escape');

    // ── The panel, the picture and the rectangle are all present, in the shipped workspace.
    const panel = page.getByRole('group', { name: 'Diagram overview' });
    await expect(panel).toBeVisible();
    const picture = panel.getByTestId('tsld-minimap-picture');
    await expect(picture).toBeVisible();
    const rect = panel.getByTestId('tsld-minimap-rect');
    await expect(rect).toBeVisible();

    // The rectangle is LIVE — the frame loop has sized it from the real viewport, so it has
    // real dimensions (not the unstyled 0×0 div React rendered).
    await expect
      .poll(async () => {
        const box = await rect.boundingBox();
        return box ? Math.min(box.width, box.height) : 0;
      })
      .toBeGreaterThanOrEqual(8);

    // ── The rectangle is a REGION, not only a boundary (minimap-visual M1-T3).
    //
    // `getComputedStyle`, never the attribute: a unit assertion on an inline style passes
    // against a value a browser silently discards, which is not hypothetical in this token
    // family — ADR-0100 M4 records the frame pair painting NO colour in a real browser while
    // every computed gate stayed green, because a `:root` token with no `@theme inline` alias
    // resolves to the empty string. This is the only tier that can tell those apart.
    //
    // Asserted at the rectangle's CURRENT size and again at its 8×8 floor, because the two are
    // different renderings: the floor is what a planner sees at the Day preset on a long plan,
    // and it is the case where a border alone leaves almost nothing to see.
    const fillOfRect = async (): Promise<string> =>
      rect.evaluate((node) => getComputedStyle(node).backgroundColor);
    const transparent = new Set(['rgba(0, 0, 0, 0)', 'transparent', '']);
    expect(transparent.has(await fillOfRect()), 'the viewport rectangle has a fill').toBe(false);

    // ── The panel's edge is its separation from the diagram (minimap-visual M8).
    //
    // Only a browser can answer this one, and for a reason specific to this codebase.
    // `border-primary` compiles to `var(--primary)`, which the `[data-surface="canvas"]` scope
    // rebinds to `--plot-primary` — the diagram blue. Read any other way it resolves to the page
    // theme's `--page-primary`, which is navy: ADR-0102's finding is that a `--color-*` alias is
    // substituted where it is declared, so a scope can never reach it. A unit test cannot tell
    // those two apart because jsdom applies no stylesheet at all, and both are plausible colours
    // for a border, so the wrong one would look entirely deliberate.
    const borderColour = await panel.evaluate((node) => getComputedStyle(node).borderTopColor);
    // --plot-primary: oklch(0.624 0.115 249). Asserted as the resolved sRGB rather than as a
    // token name, because the token name is exactly what the failure mode above gets right.
    expect(borderColour, 'the panel border took the canvas scope’s primary').toBe(
      'oklch(0.624 0.115 249)',
    );

    // ── The bitmap never touches the border (minimap-visual M8, the UX review's B1).
    //
    // The border shares its value with the non-critical bar ink, and `worldExtent` maps the
    // plan's extremes to the box's edges, so on EVERY plan a bar starts at x=0, one ends at
    // x=width and one sits at y=height. Where that extreme activity is non-critical the two
    // merge at 1:1. `p-px` on the panel puts one pixel of `--canvas` — the pair the border is
    // gated against — between them, which is asserted here as geometry rather than as colour:
    // a colour assertion would have to know which activity happens to be extreme.
    const gap = await panel.evaluate((node) => {
      const picture = node.querySelector('[data-minimap-surface]');
      if (picture === null) return null;
      const p = node.getBoundingClientRect();
      const c = picture.getBoundingClientRect();
      const styles = getComputedStyle(node);
      const bw = (side: string): number =>
        Number.parseFloat(styles.getPropertyValue(`border-${side}-width`));
      return {
        left: c.left - (p.left + bw('left')),
        right: p.right - bw('right') - c.right,
        bottom: p.bottom - bw('bottom') - c.bottom,
      };
    });
    expect(gap, 'the picture surface was found').not.toBeNull();
    for (const [side, value] of Object.entries(gap!)) {
      expect(value, `the bitmap clears the ${side} border by ${value}px`).toBeGreaterThanOrEqual(1);
    }

    // The picture is not blank: the build painted the ground and bars into the backing store.
    const painted = await picture.evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0) return false;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const distinct = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        distinct.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
        if (distinct.size > 1) return true;
      }
      return false;
    });
    expect(painted, 'the bitmap holds more than one colour (ground + bars)').toBe(true);

    // ── The WCAG 2.2 scan, target-size opted in, over the panel.
    const results = await new AxeBuilder({ page })
      // ONE `options()` carrying BOTH runOnly and rules (`docs/TECH_DEBT.md` #170, closed
      // 2026-08-28): `AxeBuilder.options()` is a wholesale REPLACEMENT, not a merge, so the old
      // `.withTags(...).options({rules})` chain discarded `runOnly` and ran every rule axe has —
      // this scan passed only because its `.include()` narrows the subtree. The shape below is
      // `e2e-shell/org-less-screens.spec.ts`'s, which read the library source rather than inferring.
      .options({
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
        },
        rules: { 'target-size': { enabled: true } },
      })
      .include('[data-testid="tsld-minimap"]')
      .analyze();
    expect(results.violations).toEqual([]);

    // ── Persistence: the preference survives a reload (localStorage, global — M2-T3).
    await page.reload();
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toBeVisible({
      timeout: 20_000,
    });

    // ── M3: navigation, with the CANVAS'S OWN RULER as the oracle — the viewport must
    // actually move, and the ruler band is observable state that is not the element under
    // test (a journey that asserts only the panel's DOM would pass with the camera welded).
    const panelAfterReload = page.getByRole('group', { name: 'Diagram overview' });
    const ruler = page.getByTestId('tsld-ruler');
    const atFit = await ruler.innerText();

    // Keyboard: focus the group and page-pan right — the ruler's visible window changes.
    await panelAfterReload.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => ruler.innerText()).not.toBe(atFit);

    // Home returns to the plan's first dated day (announced as a discrete jump).
    await page.keyboard.press('Home');

    // Zoom to the Day preset first: at Fit the rectangle IS nearly the whole box (the whole
    // plan is visible), so a click near the edge lands on the pad — which correctly refuses
    // to jump. The first run of this journey established that, which is exactly the kind of
    // fact only a real browser reports.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('radio', { name: /^Day/ }).click();
    await page.keyboard.press('Escape');
    const atHome = await ruler.innerText();

    // Click-to-jump: click near the surface's right edge — a discrete jump the ruler shows.
    const surface = panelAfterReload.locator('[data-minimap-surface]');
    const surfaceBox = (await surface.boundingBox())!;
    await surface.click({ position: { x: surfaceBox.width - 6, y: surfaceBox.height / 2 } });
    await expect.poll(async () => ruler.innerText()).not.toBe(atHome);

    // Drag the rectangle's pad back toward the left edge — a continuous pan the ruler follows.
    const pad = panelAfterReload.getByTestId('tsld-minimap-rect-pad');
    const padBox = (await pad.boundingBox())!;
    // The 24×24 floor as RENDERED geometry (M4 a11y gate): the unit test asserts the inline
    // min-width/min-height strings and jsdom does no layout; axe's target-size rule skips a
    // role-less pad. Only this measures the real box — at the Day preset, where the true
    // rectangle is at its narrowest.
    expect(padBox.width, 'pad width ≥ 24 (WCAG 2.5.8)').toBeGreaterThanOrEqual(24);
    expect(padBox.height, 'pad height ≥ 24 (WCAG 2.5.8)').toBeGreaterThanOrEqual(24);

    // The fill survives at the rectangle's SMALLEST rendering (M1-T3, the second of the two
    // cases its sibling assertion names). This is the Day preset on a long plan, where the
    // true rectangle floors at 8×8 — the state in which a border alone leaves a planner almost
    // nothing to see, and therefore the state the fill exists for. Measured here rather than
    // above because only this part of the journey has driven the viewport to that preset.
    const rectAfterReload = panelAfterReload.getByTestId('tsld-minimap-rect');
    const rectBox = (await rectAfterReload.boundingBox())!;
    expect(Math.min(rectBox.width, rectBox.height), 'the rectangle is at its floor').toBeLessThan(
      40,
    );
    const floorFill = await rectAfterReload.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    expect(
      ['rgba(0, 0, 0, 0)', 'transparent', ''].includes(floorFill),
      `the rectangle keeps its fill at ${Math.round(rectBox.width)}×${Math.round(rectBox.height)}`,
    ).toBe(false);
    const beforeDrag = await ruler.innerText();
    await page.mouse.move(padBox.x + padBox.width / 2, padBox.y + padBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(surfaceBox.x + 12, padBox.y + padBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => ruler.innerText()).not.toBe(beforeDrag);

    // ── Close via the panel's own button: the panel goes, and focus does NOT drop to <body>
    // (M2-T6 — the most repeated named a11y regression in this codebase).
    await page.getByRole('button', { name: 'Hide overview' }).click();
    await expect(page.getByRole('group', { name: 'Diagram overview' })).toHaveCount(0);
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focusedTag, 'focus must not drop to <body> on dismissal').not.toBe('BODY');

    // ── And the toggle row now reads unchecked again.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Minimap' })).not.toBeChecked();
  });
});
