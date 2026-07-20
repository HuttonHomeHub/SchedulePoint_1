import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **schedule interchange (XER import)** suite
 * (`VITE_SCHEDULE_INTERCHANGE`, Stage C2 M1, ADR-0050, `docs/specs/schedule-interchange/`). Mirrors the
 * onboarding + client/project helpers used across the other flag-on suites (`e2e-resource-view/support.ts`,
 * `e2e-loe/support.ts`) verbatim — the onboarding actor becomes the org's Org Admin, which already
 * satisfies `interchange:import` (Planner + Org Admin), so no extra role setup is needed — and adds a
 * minimal valid `.xer` fixture for the upload.
 */

/** Sign up + create an organisation; returns the org slug (name "Interchange Co" → "interchange-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `interchange-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Interchange Tester');
  await page.getByLabel('Email').fill(`interchange-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Interchange Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/**
 * Create a client → project and open the project's plan-create surface (`/orgs/$orgSlug/projects/
 * $projectId`), where the "Import from file…" entry sits beside "New plan" (flag ON). Stops short of
 * creating a plan by hand — this suite's whole point is that the import itself creates one.
 */
export async function openNewProject(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
}

/**
 * A minimal valid XER: one project, two tasks and one FS relationship, no calendar (mirrors the API
 * suite's `validXer()`, `apps/api/test/interchange.e2e-spec.ts`) — the same fixture that suite's own
 * dry-run AND commit tests use, so this journey's expected report counts
 * (`{ activities: 2, relationships: 1, calendars: 0 }`) are proven server-side already.
 */
export function validXer(): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    '%R\tP1\tSample\t2026-01-05 00:00\t2026-01-04 00:00',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tA1000\tMobilise\tTT_Task\t40',
    '%R\tT2\tP1\tA1010\tDesign\tTT_Task\t80',
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\tR1\tT2\tT1\tPR_FS\t0',
    '%E',
  ].join('\n');
}

/** The `.xer` fixture as bytes, ready for `Locator.setInputFiles`. */
export function validXerFile(): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name: 'schedule.xer',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(validXer(), 'utf8'),
  };
}
