import { execFileSync } from 'node:child_process';

import { expect, type Page } from '@playwright/test';

import { ensurePen, onboard, openProject, recalculate } from '../e2e-arrange/support';

/**
 * Shared by the NetPoint grammar journeys (`docs/specs/netpoint-grammar/`). The reference plan is
 * the product owner's NetPoint picture, transcribed (`--tier reference`).
 */

/** The scene canvas: the largest of the siblings `TsldCanvas` mounts. */
export async function sceneCanvasToken(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const canvases = [...document.querySelectorAll('canvas')];
    const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    return getComputedStyle(canvas).getPropertyValue(token).trim();
  }, name);
}

export async function openReferencePlan(page: Page): Promise<void> {
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
