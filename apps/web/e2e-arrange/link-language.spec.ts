import { expect, test, type Page } from '@playwright/test';

import {
  createPlan,
  ensurePen,
  onboard,
  openProject,
  placeRelativeTo,
  recalculate,
  seedActivities,
  seedDependency,
} from './support';

/**
 * **The link language reaches the real canvas** (NetPoint-layout M2, spec §4.7).
 *
 * Three canvas colour traps have each shipped in this repository once, and none of them is visible
 * to a unit suite, because jsdom resolves no custom property and has no canvas:
 *
 * - ADR-0102's: the painter reads the value off the canvas element, so a token declared somewhere
 *   the canvas scope does not reach resolves to the empty string and the painter falls back to a
 *   literal, with every gate green.
 * - ADR-0100 M4's: a DOM key that reads the token through a missing Tailwind alias paints nothing.
 * - ADR-0121's: a `var(...)` handed to Canvas 2D is discarded silently.
 *
 * So this reads the token where the painter reads it, and the legend swatch's COMPUTED colour, and
 * asserts they agree and are real.
 */

/** The scene canvas (the largest of the siblings `TsldCanvas` mounts). */
async function sceneCanvasToken(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const canvases = [...document.querySelectorAll('canvas')];
    const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    return getComputedStyle(canvas).getPropertyValue(token).trim();
  }, name);
}

/** A token resolved to a computed colour inside the canvas scope, the way the legend's swatch resolves it. */
async function resolvedInCanvasScope(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const canvases = [...document.querySelectorAll('canvas')];
    const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    canvas.parentElement!.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);
}

test('the non-driving link ink is a real token on the canvas and in its key', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Link language');
  await ensurePen(page);
  const made = await seedActivities(page, orgSlug, [
    { name: 'Excavate', laneIndex: 0, durationDays: 5 },
    { name: 'Pour', laneIndex: 2, durationDays: 5 },
  ]);
  const from = made.find((a) => a.name === 'Excavate');
  const to = made.find((a) => a.name === 'Pour');
  if (!from || !to) throw new Error('the fixture did not seed the two activities it links');
  await seedDependency(page, orgSlug, from.id, to.id);
  // Placed well after its only predecessor, so the link does not drive it: it waits.
  // The anchor has no drawn start until the plan is computed.
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await placeRelativeTo(page, orgSlug, 'Pour', 'Excavate', 20);
  await recalculate(page, orgSlug);
  await expect(page.locator('canvas').first()).toBeAttached();

  // (1) The token resolves where the painter reads it, and it is its own value, not the page's
  // secondary text colour it replaced (TECH_DEBT #367).
  const minor = await sceneCanvasToken(page, '--canvas-link-minor');
  expect(minor).not.toBe('');
  expect(minor).not.toBe(await sceneCanvasToken(page, '--muted-foreground'));

  // (2) The key draws the same colour, resolved in the same scope — a key in a different colour
  // from the mark it names is a key to a mark that is not there.
  // Located by `data-toolbar-item`, never by copy: the Legend is promoted onto the command row.
  await page.locator('[data-toolbar-item="legend"]').click();
  const legend = page.getByRole('list', { name: 'Legend' });
  await expect(legend.getByText('Gap in working days')).toBeVisible();
  await expect(legend.getByText('Non-driving link — dashed')).toHaveCount(0);
  const swatch = await legend.getByText('Non-driving link', { exact: true }).evaluate((label) => {
    const line = label.closest('li')!.querySelector('span > span') as HTMLElement;
    return getComputedStyle(line).borderTopColor;
  });
  // A real colour, not the transparent a missing alias computes to. Chromium keeps an `oklch()`
  // value in that space, so the form is not asserted; the equality below is the load-bearing check.
  expect(swatch).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))?$/);
  expect(swatch).toBe(await resolvedInCanvasScope(page, '--canvas-link-minor'));
});
