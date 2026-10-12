import { type Locator, type Page } from '@playwright/test';

import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import { createHierarchy, ensurePen, newPlan, onboard } from '../e2e-workspace-chrome/support';

/**
 * **Under forced colours the chosen member of a switch is still distinguishable** (toolbar-grid M2,
 * SC-5; accessibility review B2, WCAG 2.2 §1.4.1 and §1.4.11).
 *
 * `m0-measurement.md` §7 measured the chosen and the unchosen member of Diagram | Gantt and of the
 * Colour set **byte-identical** in a screenshot under `forcedColors: 'active'`: the mode drops
 * `box-shadow` (the underline) and forces every `background-color` to `Canvas`, so the `selected`
 * fill was the only mark and it vanished. The raised member therefore carries `Highlight` /
 * `HighlightText` system colours with `forced-color-adjust: none` (`TOOLBAR_TRACK_SWITCH`).
 *
 * **The primary assertion is the computed pair**: the chosen member's `background-color` is exactly
 * `Highlight` and its `color` exactly `HighlightText`, read from the browser, which is legible by
 * construction because the reader's theme defines both. **The screenshot diff is supplementary**, the
 * way `e2e-forced-colors/focus-ring.spec.ts` establishes a ring: the same box captured with the member
 * chosen, then again once another member is, which must DIFFER, so a rule that resolves to a colour
 * nobody can see (or a pair that matches the unchosen member) cannot pass on the computed read alone.
 *
 * **Its control is the `forcedColors: 'none'` case.** In ordinary colours the same member must NOT
 * carry the forced pair and must keep its underline, so a green forced run cannot be a rule that
 * leaked into both modes, and the ordinary picture is proven unchanged by the same instrument.
 *
 * **It lives in this suite and not in `e2e-forced-colors`**, which serves a production preview with
 * no API and cannot sign up or onboard (the M1 finding): `forcedColors` is a per-test context option,
 * so nothing is widened. Emulation is Chromium's, not the mode on real Windows with a real theme
 * (`docs/TECH_DEBT.md` #154 is untouched).
 *
 * **Verified red** by deleting the five `forced-colors:` classes from `TOOLBAR_TRACK_SWITCH`: the
 * screenshots of Diagram and of Criticality are then byte-identical (the M0 reading) and the case
 * fails; with `forced-color-adjust: none` alone removed, the labels paint `HighlightText` on a Canvas
 * backplate and the computed-colour assertion fails.
 */
async function openPlan(page: Page): Promise<void> {
  await acknowledgeViewportNotice(page.context());
  await page.setViewportSize({ width: 1440, height: 900 });
  await onboard(page, Date.now() + Math.floor(Math.random() * 1000));
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Tracks');
  await ensurePen(page);
  // The Colour set is promoted from 1912 (L2).
  await page.setViewportSize({ width: 1912, height: 1080 });
  await expect(page.locator('[data-toolbar-item="colour-by-criticality"]')).toBeVisible();
}

/** Two frames after a state change, so the box is read from the settled layout. */
async function settle(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}

async function pictureOf(page: Page, target: Locator): Promise<Buffer> {
  await settle(page);
  const box = await target.boundingBox();
  if (!box) throw new Error('the member has no box');
  return page.screenshot({ clip: box });
}

/** The system colours as this browser resolves them, read from a probe so nothing is assumed. */
async function systemPair(page: Page): Promise<{ highlight: string; highlightText: string }> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.cssText = 'background-color:Highlight;color:HighlightText;position:fixed;top:0';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const out = { highlight: style.backgroundColor, highlightText: style.color };
    probe.remove();
    return out;
  });
}

const colours = (el: Locator) =>
  el.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      bg: style.backgroundColor,
      color: style.color,
      shadow: style.boxShadow,
      adjust: style.forcedColorAdjust,
    };
  });

interface Switch {
  name: string;
  chosen: Locator;
  other: Locator;
}

function switches(page: Page): Switch[] {
  return [
    {
      name: 'Colour',
      chosen: page.locator('[data-toolbar-item="colour-by-criticality"]'),
      other: page.locator('[data-toolbar-item="colour-by-totalFloat"]'),
    },
    {
      name: 'Diagram | Gantt',
      chosen: page.locator('[data-toolbar-item="view-tsld"]').first(),
      other: page.locator('[data-toolbar-item="view-gantt"]').first(),
    },
  ];
}

test.describe('forced colours: the chosen member of a switch', () => {
  test.use({ forcedColors: 'active' });

  test('is distinguishable from the unchosen member, and is the system pair', async ({ page }) => {
    test.setTimeout(240_000);
    await openPlan(page);
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    const system = await systemPair(page);

    for (const { name, chosen, other } of switches(page)) {
      await expect(chosen, `${name}: the fixture's chosen member`).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // Primary: the computed system pair. The screenshot below is taken first only because it needs
      // the settled box; it is asserted last and only corroborates.
      const asChosen = await pictureOf(page, chosen);
      const chosenColours = await colours(chosen);
      expect(chosenColours.bg, `${name}: the chosen fill is Highlight`).toBe(system.highlight);
      expect(chosenColours.color, `${name}: the chosen label is HighlightText`).toBe(
        system.highlightText,
      );

      // Choose the other, and read the first member again as the unchosen one.
      await other.click();
      await expect(other).toHaveAttribute('aria-pressed', 'true');
      await expect(chosen).toHaveAttribute('aria-pressed', 'false');
      const asUnchosen = await pictureOf(page, chosen);
      const unchosenColours = await colours(chosen);
      // Supplementary: the pictures differ.
      expect(
        asChosen.equals(asUnchosen),
        `${name}: the chosen and unchosen member are byte-identical (the M0 reading)`,
      ).toBe(false);
      expect(unchosenColours.bg, `${name}: the unchosen member is filled`).not.toBe(
        system.highlight,
      );
      // And the one that is chosen now carries the mark, so it moved rather than appeared.
      expect((await colours(other)).bg).toBe(system.highlight);

      await chosen.click();
      await expect(chosen).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('a keyboard focus ring still shows on every member, the raised one included', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openPlan(page);
    for (const { name, chosen, other } of switches(page)) {
      for (const [which, member] of [
        ['chosen', chosen],
        ['unchosen', other],
      ] as const) {
        await page.locator('body').click({ position: { x: 2, y: 2 } });
        const box = await member.boundingBox();
        if (!box) throw new Error(`${name} ${which} has no box`);
        // The outline reaches 4 px outside the box (2 px at a 2 px offset); read that band.
        const clip = {
          x: box.x - 4,
          y: box.y - 4,
          width: box.width + 8,
          height: box.height + 8,
        };
        const before = await page.screenshot({ clip });
        await page.keyboard.press('Shift');
        await member.focus();
        await expect(member).toBeFocused();
        const after = await page.screenshot({ clip });
        expect(before.equals(after), `${name} ${which}: focusing it changed nothing`).toBe(false);
      }
    }
  });
});

test.describe('ordinary colours: the control', () => {
  test.use({ forcedColors: 'none' });

  test('the chosen member keeps its fill and underline, and carries none of the forced pair', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openPlan(page);
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(false);
    const system = await systemPair(page);

    for (const { name, chosen, other } of switches(page)) {
      const on = await colours(chosen);
      const off = await colours(other);
      expect(on.bg, `${name}: the forced fill leaked into ordinary colours`).not.toBe(
        system.highlight,
      );
      expect(on.adjust, `${name}: forced-color-adjust leaked into ordinary colours`).toBe('auto');
      // Never colour alone: a distinct fill AND an underline.
      expect(on.bg, `${name}: no fill`).not.toBe(off.bg);
      expect(on.shadow, `${name}: no underline`).not.toBe('none');
      expect(off.shadow, `${name}: the unchosen member is raised too`).toBe('none');
    }
  });
});
