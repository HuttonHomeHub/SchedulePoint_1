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

  // M0 scaffold: the plan opens and the canvas scope resolves the grid tokens the painter reads.
  // M1 replaces the second assertion with the solved values and a pixel read of the dashed grid.
  test('the reference plan opens on the canvas, and the canvas scope resolves its grid', async ({
    page,
  }) => {
    await openReferencePlan(page);
    for (const token of ['--canvas', '--canvas-grid-month', '--canvas-grid-year']) {
      expect(await sceneCanvasToken(page, token), `${token} on the scene canvas`).toMatch(
        /^oklch\(/,
      );
    }
  });
});
