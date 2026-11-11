import { expect, type Page } from '@playwright/test';

import { canvas, selectedActivityId } from '../e2e-workspace-chrome/support';

/**
 * Shared by the two "follow logic" M0 probes (`docs/specs/placed-bar-follows-link/m0-measurement.md`).
 * Throwaway harness code (ADR-0081 §3): it reads state from the API, never from the DOM, because the
 * plan's own risk row says a placement can be returned before the engine has seen it.
 */

/** The fields M0 reads from each activity. Everything is the API's answer, nothing is inferred. */
export interface Row {
  id: string;
  name: string;
  type: string;
  version: number;
  durationDays: number;
  visualStart: string | null;
  visualEffectiveStart: string | null;
  earlyStart: string | null;
  visualConflictReason: string | null;
  visualDriftDays: number | null;
  constraintType: string | null;
  constraintDate: string | null;
  actualStart: string | null;
  percentComplete: number;
  parentId: string | null;
}

/** The compact form written to the readings file. */
export interface Brief {
  name: string;
  type: string;
  dur: number;
  placed: string | null;
  drawn: string | null;
  early: string | null;
  reason: string | null;
  constraint: string | null;
}

export const brief = (r: Row): Brief => ({
  name: r.name,
  type: r.type,
  dur: r.durationDays,
  placed: r.visualStart?.slice(0, 10) ?? null,
  drawn: r.visualEffectiveStart?.slice(0, 10) ?? null,
  early: r.earlyStart?.slice(0, 10) ?? null,
  reason: r.visualConflictReason,
  constraint:
    r.constraintType === null ? null : `${r.constraintType} ${r.constraintDate?.slice(0, 10)}`,
});

export function planIdOf(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/** Every activity in the open plan, straight from the API. */
export async function readRows(page: Page, org: string): Promise<Row[]> {
  const plan = planIdOf(page);
  return page.evaluate(
    async ({ o, p }: { o: string; p: string }) => {
      const res = await fetch(`/api/v1/organizations/${o}/plans/${p}/activities?limit=100`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`list ${String(res.status)} ${await res.text()}`);
      return ((await res.json()) as { data: Row[] }).data;
    },
    { o: org, p: plan },
  );
}

export async function readDependencyCount(page: Page, org: string): Promise<number> {
  const plan = planIdOf(page);
  return page.evaluate(
    async ({ o, p }: { o: string; p: string }) => {
      const res = await fetch(`/api/v1/organizations/${o}/plans/${p}/dependencies`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`deps ${String(res.status)} ${await res.text()}`);
      return ((await res.json()) as { data: unknown[] }).data.length;
    },
    { o: org, p: plan },
  );
}

/**
 * Poll the API until `done(rows)` holds, then until two further reads agree, so a recalculation that
 * is still landing is not read half-way. Returns the settled rows and how long it took. Throws (so the
 * failure is recorded as a failure) if the condition never holds.
 */
export async function settle(
  page: Page,
  org: string,
  done: (rows: Row[]) => boolean,
  what: string,
  timeoutMs = 20_000,
): Promise<{ rows: Row[]; ms: number }> {
  const t0 = Date.now();
  let last = '';
  let agree = 0;
  let rows: Row[] = [];
  while (Date.now() - t0 < timeoutMs) {
    rows = await readRows(page, org);
    if (done(rows)) {
      const key = JSON.stringify(rows.map(brief));
      agree = key === last ? agree + 1 : 0;
      last = key;
      if (agree >= 2) return { rows, ms: Date.now() - t0 };
    } else {
      agree = 0;
      last = '';
    }
    await page.waitForTimeout(350);
  }
  throw new Error(
    `settle: ${what} never held in ${String(timeoutMs)} ms: ${JSON.stringify(rows.map(brief))}`,
  );
}

/** The x-range, in canvas pixels, along row `y` where a click selects `id` (select mode). */
export async function sweepRow(
  page: Page,
  id: string,
  y: number,
  hint: number,
): Promise<{ min: number; max: number }> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  // Bounded around where the bar was drawn: on a coarse pointer the panel divider's 44 px hit strip
  // covers the canvas's right edge and intercepts a click there.
  for (let x = Math.max(20, hint - 60); x < Math.min(box.width - 60, hint + 80); x += 2) {
    await canvas(page).click({ position: { x, y } });
    if ((await selectedActivityId(page)) === id) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }
  if (!Number.isFinite(min)) throw new Error(`no point in row y=${String(y)} selects ${id}`);
  return { min, max };
}

export async function signUp(
  page: Page,
  stamp: number,
  prefix: string,
): Promise<{ orgSlug: string }> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(`${prefix} Tester`);
  await page.getByLabel('Email').fill(`${prefix}-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`${prefix} Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  const orgSlug = `${prefix.toLowerCase()}-co-${stamp}`;
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return { orgSlug };
}
