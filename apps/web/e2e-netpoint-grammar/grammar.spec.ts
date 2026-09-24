import { execFileSync } from 'node:child_process';

import { expect, test, type Page } from '@playwright/test';

import { ensurePen, onboard, openProject, recalculate } from '../e2e-arrange/support';

/**
 * **The NetPoint grammar on the real canvas** (`docs/specs/netpoint-grammar/`).
 *
 * The reference plan is the product owner's NetPoint picture, transcribed (`--tier reference`). Every
 * milestone of this epic is judged against it on the product owner's own screen width.
 */

/** The scene canvas: the largest of the siblings `TsldCanvas` mounts. */
async function sceneCanvasToken(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const canvases = [...document.querySelectorAll('canvas')];
    const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    return getComputedStyle(canvas).getPropertyValue(token).trim();
  }, name);
}

async function openReferencePlan(page: Page): Promise<void> {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  const projectId = /projects\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!projectId) throw new Error(`no project id in ${page.url()}`);
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@repo/seed-cli',
      'seed',
      '--url',
      'http://localhost:3000',
      '--org',
      orgSlug,
      '--project',
      projectId,
      '--email',
      `arrange-${stamp}@example.com`,
      '--password',
      'correct-horse-battery',
      '--tier',
      'reference',
    ],
    { stdio: 'inherit', cwd: '../..' },
  );
  await page.reload();
  await page
    .getByRole('link', { name: /NetPoint reference/ })
    .first()
    .click();
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });
  await ensurePen(page);
  await recalculate(page, orgSlug);
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });
}

test.describe('NetPoint grammar', () => {
  test.setTimeout(240_000);

  // M1 (G1, G2): the grid and the ground reach the real canvas with the solved values, and the
  // grid is PAINTED dashed. A token read alone would pass against a painter that ignored the dash.
  test('the canvas takes the near-white ground and paints a quiet, dashed grid', async ({
    page,
  }) => {
    await openReferencePlan(page);

    // Where the painter reads them: the scene canvas element, inside the canvas scope (ADR-0102).
    expect(await sceneCanvasToken(page, '--canvas')).toBe('oklch(0.995 0.002 250)');
    expect(await sceneCanvasToken(page, '--canvas-grid-month')).toBe('oklch(0.862 0.005 250)');
    expect(await sceneCanvasToken(page, '--canvas-grid-year')).toBe('oklch(0.776 0.008 250)');

    // The pixels. A dashed vertical rule is a column of short ink runs (the 3 px dash) separated by
    // short gaps. A solid rule is one long run, broken only where a bar or a label crosses it. So
    // the column holding the most ink runs of 2 to 4 px, each followed by a gap of 2 to 4 px, is
    // read over the top 300 px of the scene. A first version counted every on/off transition, and a
    // solid grid then scored 37 against a threshold of 40, because bars crossing a column flip it
    // too. That margin could not separate the two.
    const dashes = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')];
      const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2D context');
      const height = Math.min(300, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, height).data;
      // Ink is a painted pixel darker than the ground. The scene canvas is transparent wherever
      // nothing is drawn (the ground is painted beneath it), so an unpainted pixel reads as
      // (0, 0, 0, 0) and must not count as ink.
      const isInk = (x: number, y: number): boolean => {
        const i = (y * canvas.width + x) * 4;
        const sum = (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
        return (data[i + 3] ?? 0) > 0 && sum < 735;
      };
      let best = 0;
      for (let x = 0; x < canvas.width; x += 1) {
        const runs: { ink: boolean; length: number }[] = [];
        for (let y = 0; y < height; y += 1) {
          const ink = isInk(x, y);
          const last = runs.at(-1);
          if (last && last.ink === ink) last.length += 1;
          else runs.push({ ink, length: 1 });
        }
        let count = 0;
        for (let i = 0; i + 1 < runs.length; i += 1) {
          const run = runs[i]!;
          const gap = runs[i + 1]!;
          if (run.ink && run.length >= 2 && run.length <= 4 && gap.length >= 2 && gap.length <= 4) {
            count += 1;
          }
        }
        best = Math.max(best, count);
      }
      return best;
    });
    expect(dashes, 'no column of the scene holds a dashed rule').toBeGreaterThan(20);
  });
});
