import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

/**
 * The **organisation export** journey (ADR-0194, `docs/specs/organisation-export/`, milestone 3).
 *
 * An Org Admin presses **Export data** in the rail, presses **Download export**, and receives a real
 * ZIP; the audit log then shows that it happened. Everything here needs a real browser and a real
 * API, which is why a unit suite cannot stand in for it:
 *
 * 1. **The download event fires for a `blob:` anchor** and carries the server's filename. The hook
 *    collects a streamed POST into a `Blob` and clicks a synthetic `<a download>`; whether Chromium
 *    treats that as a download, and whether `Content-Disposition` is readable across the proxy, is
 *    only observable here.
 * 2. **The bytes are a ZIP and a complete one.** The local-file signature opens it and the
 *    end-of-central-directory signature closes it; a truncated stream has the first and not the
 *    second, which is exactly what a half-failed export would look like.
 * 3. **The audit row is written by the server, after the stream**, so its presence proves the whole
 *    path ran, not just that a button produced a file.
 *
 * Runs in the audit suite because it reads the audit log and needs no other flag.
 */

/**
 * Scans the page only once nothing on it is moving. `Button` carries `transition-colors`, and the
 * Download control changes variant (outline while working, filled at rest) and sits under the
 * pointer that just pressed it, so a scan taken the instant the status line appears can read a
 * colour half-way between two settled ones, which is no state a reader ever sees: CI measured
 * #a7adb8 on #404656 (4.17:1) and #949baa on #5d616b (2.22:1) for the same button on two attempts.
 * The settled colours pass (15.3:1 at rest, 17.4:1 hovered, 9.8:1 and 14.0:1 while working), so
 * the fix is to wait for the movement to end, not to relax the scan's rules or tags.
 */
async function scanWhenSettled(page: Page) {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
}

/** The organisation nav in the rail, scoped so its links do not clash with the breadcrumbs. */
function navLink(page: Page, name: string): Locator {
  return page
    .getByRole('navigation', { name: 'Organisation' })
    .getByRole('link', { name, exact: true });
}

test('an Org Admin downloads the whole organisation as a ZIP, and the audit log records it', async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  const orgSlug = `export-co-${stamp}`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Export Admin');
  await page.getByLabel('Email').fill(`export-admin-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`Export Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  // Something to export beyond the organisation row itself.
  await navLink(page, 'Clients').click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByRole('link', { name: 'Northgate' })).toBeVisible();

  // ---------------------------------------------------------------- The entry point is the rail
  await navLink(page, 'Export data').click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}/export$`));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Export organisation data' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What is included' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What is not included' })).toBeVisible();

  // The screen is accessible (WCAG 2.2 AA, the rules axe can decide) before and after the download.
  const before = await scanWhenSettled(page);
  expect(before.violations).toEqual([]);

  // ------------------------------------------------------------------ The download itself
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download export' }).click();
  const download = await downloaded;

  expect(download.suggestedFilename()).toMatch(/^schedulepoint-export-.+\.zip$/);
  expect(download.suggestedFilename()).toContain(orgSlug);

  const saved = testInfo.outputPath('export.zip');
  await download.saveAs(saved);
  const bytes = await readFile(saved);
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  // The end-of-central-directory record: present only when the archive was written to its end.
  expect(bytes.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
  // manifest.json is written last, so its name is in the central directory of a complete archive.
  expect(bytes.includes(Buffer.from('manifest.json'))).toBe(true);
  expect(bytes.includes(Buffer.from('README.txt'))).toBe(true);

  // Scoped to the page body: the shell owns a second, empty polite region of its own.
  const main = page.getByRole('main');
  await expect(main.getByRole('status')).toContainText(/^Downloaded /);
  await expect(main.getByRole('status')).toContainText(download.suggestedFilename());
  // Back at rest and offering the action again, with no refusal showing.
  await expect(main.getByRole('button', { name: 'Download export' })).toBeVisible();
  await expect(main.getByRole('alert')).toHaveCount(0);

  const after = await scanWhenSettled(page);
  expect(after.violations).toEqual([]);

  // ------------------------------------------------------------ The audit log records the export
  await navLink(page, 'Audit log').click();
  const row = page
    .getByRole('row')
    .filter({ has: page.getByText('Organisation data exported', { exact: true }) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Succeeded');
});
