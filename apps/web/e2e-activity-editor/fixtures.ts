import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test as base } from '../e2e-support/test';

/** The signed-in organisation this worker's tests share. */
export interface Account {
  orgSlug: string;
  /** Path of the saved storage state: the session cookie of the Org Admin that signed up. */
  storageState: string;
}

interface WorkerFixtures {
  account: Account;
}

/**
 * The suite's `test`: the guarded one plus **one sign-up per worker** (docs/TECH_DEBT.md #435 and
 * #361, ADR-0175 rung 2).
 *
 * Every test used to sign up and create an organisation of its own, which spent the same few
 * handlers' 100-per-minute budget (`/me`, session reads, org creation) once per test: CI run
 * 37195968342 met a 429 on `GET /api/v1/me` there. The sign-up is not what any of these tests are
 * about, so it happens once and each test starts from the saved session.
 *
 * What a test still owns is its **data**: it creates a client, project and plan suffixed with its
 * own `stamp`, so two tests in the one organisation never share a row or a link name. Anything an
 * org-level fixture could leak (the resource library) is created by the test that needs it.
 *
 * The sign-up runs in a worker-scoped context, outside any test, so the 429 guard does not watch
 * it (the stated gap in `e2e-support/test.ts`). It is one sign-up, and it fails loudly on the
 * onboarding heading if the throttle ever did refuse it.
 */
export const test = base.extend<object, WorkerFixtures>({
  account: [
    async ({ browser }, provide, workerInfo) => {
      const stamp = Date.now() + workerInfo.workerIndex;
      const orgSlug = `editor-co-${stamp}`;
      const page = await browser.newPage({
        baseURL: workerInfo.project.use.baseURL ?? 'http://localhost:5173',
      });
      await page.goto('/sign-up');
      await page.getByLabel('Full name').fill('Editor Tester');
      await page.getByLabel('Email').fill(`editor-${stamp}@example.com`);
      await page.getByLabel('Password').fill('correct-horse-battery');
      await page.getByRole('button', { name: /create an account/i }).click();
      // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
      await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel('Organisation name').fill(`Editor Co ${stamp}`);
      await page.getByRole('button', { name: /create organisation/i }).click();
      await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
      const storageState = path.join(
        await mkdtemp(path.join(tmpdir(), 'editor-account-')),
        's.json',
      );
      await page.context().storageState({ path: storageState });
      await page.close();
      await provide({ orgSlug, storageState });
    },
    { scope: 'worker' },
  ],

  // Overrides the `storageState` option for every test in the worker, which is how Playwright
  // documents a per-worker account. A test that mints a second actor opens its own context.
  storageState: async ({ account }, provide) => {
    await provide(account.storageState);
  },
});

export { expect };
