import type { Page } from '@playwright/test';

/**
 * Hold a read the page is waiting on until the journey releases it — the technique the loading
 * journeys share (`docs/specs/loading-skeletons/`). No timer: the request stays pending exactly as
 * long as the test needs to observe the pending picture, then goes through untouched.
 *
 * Shared from `e2e-support/` for the reason `toolbar.ts` beside it is: a Playwright `testDir` is its
 * own compilation root, so the alternative is a copy of the same twelve lines in every suite.
 */
export interface HeldRead {
  /** Let the held request (and any later one matching) through. */
  release: () => void;
}

export async function holdRead(page: Page, pattern: RegExp): Promise<HeldRead> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pattern, async (route) => {
    await released;
    await route.continue();
  });
  return { release };
}
