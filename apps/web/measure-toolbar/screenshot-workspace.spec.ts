import { expect, test } from '@playwright/test';

/**
 * **Look at the thing.** Every measurement in this directory reports geometry — heights, widths,
 * overhang — and none of them has ever produced a picture. Four consecutive epics optimised the
 * command surface against arithmetic ("does the row fit") rather than against how it reads, which
 * is what arithmetic cannot see. This captures the workspace as a planner meets it, at the width
 * the product is actually judged at, so a design conversation can start from the real screen.
 *
 * Not a gate and not a visual-regression test: it asserts nothing and pins no pixels. It is here to
 * be looked at.
 */
test('the plan workspace as a planner meets it', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const stamp = Date.now();

  await page.setViewportSize({ width: 1646, height: 1097 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Shot Taker');
  await page.getByLabel('Email').fill(`shot-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Northgate Construction ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate Developments');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate Developments' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside Quarter');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside Quarter' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside — Phase 2 Substructure');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Riverside — Phase 2 Substructure' }).click();
  await expect(page.getByRole('toolbar', { name: 'View and navigate' })).toBeVisible();

  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible().catch(() => false)) await expand.click();

  // A recognisable substructure sequence rather than two placeholder bars: the question this
  // picture has to answer is how the chrome reads against a real programme.
  for (const name of [
    'Site setup & hoarding',
    'Excavate to formation',
    'Blind & reinforce',
    'Pour ground slab',
    'Cure & strike',
    'Erect frame — core',
  ]) {
    await page.getByRole('button', { name: 'New activity' }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Finish', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  await testInfo.attach('workspace-1646-pen-held.png', {
    body: await page.screenshot({ path: 'measure-output/workspace-1646-pen-held.png' }),
    contentType: 'image/png',
  });

  // The state a reader ARRIVES in — nobody holding the pen — which is the commoner of the two and
  // has a different pen cluster.
  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'measure-output/workspace-1646-pen-available.png' });

  // 1440 — where the register records the row running out of room first.
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'measure-output/workspace-1440.png' });
});
