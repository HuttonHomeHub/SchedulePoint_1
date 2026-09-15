/**
 * Verifies the non-vacuity control DISCRIMINATES, by pointing it at what `main`'s seed produces.
 *
 * ADR-0110 D5: a gate is not finished when it passes, it is finished when the defect it names has
 * made it fail. `assertLandingStates` guards every figure this epic reports, so a version of it
 * that passes against any fixture would make all of them meaningless while looking like diligence.
 *
 * Not a fabricated failure. It signs up, runs the SHIPPED `seed()` verbatim, and asks the control
 * about those real plans — so every absence it reports is "this plan is not in that state", never
 * "no such row", which would be a red run about nothing.
 *
 *   PLAYWRIGHT_CHROMIUM_PATH=… node scripts/verify-landing-control.mjs
 *
 * Expected: RED, naming 8 of 9 states. The ninth — "never calculated" — is EXPECTED to pass here,
 * because `main`'s seed recalculates nothing, so that state is ambiently true of the old fixture.
 * That is the clearest possible argument for the control naming specific plan ids: phrased as
 * "some plan has never been calculated" it would have been satisfied by a fixture that can exhibit
 * nothing else (ADR-0143 §11's finding, which this epic's spec predicted and this run confirmed).
 */
import { chromium } from '@playwright/test';

import { assertLandingStates } from './landing-fixture.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const tag = `red${String(Date.now())}`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
await page.goto(`${BASE}/sign-up`);
await page.getByLabel('Full name').fill('Ada Lovelace');
await page.getByLabel('Email').fill(`${tag}@example.com`);
await page.getByLabel('Password').fill('correct-horse-battery');
await page.getByRole('button', { name: /create an account/i }).click();
await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
await page.getByLabel('Organisation name').fill(`Red run ${tag}`);
await page.getByRole('button', { name: /create organisation/i }).click();
await page.waitForURL(/\/orgs\/[^/]+$/);
const slug = new URL(page.url()).pathname.split('/')[2];

// `main`'s seed, copied verbatim from shoot.mjs:199-228 so the red run is against the real thing.
const ids = await page.evaluate(async (org) => {
  const post = async (path, body) => {
    const r = await fetch(`/api/v1/organizations/${org}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    return (await r.json()).data;
  };
  const client = await post('/clients', { name: 'Bellway Homes' });
  const project = await post(`/clients/${client.id}/projects`, { name: 'Northgate Quarter' });
  const plans = [];
  for (const name of ['Enabling works', 'Substructure', 'Frame & envelope']) {
    plans.push(await post(`/projects/${project.id}/plans`, { name, plannedStart: '2026-01-05' }));
  }
  for (const plan of plans) {
    await post(`/plans/${plan.id}/edit-lock`, {});
    await post(`/plans/${plan.id}/activities`, {
      name: 'Pour slab',
      code: 'A0001',
      durationDays: 5,
    });
  }
  const [a, b, c] = plans;
  // Every slot points at a plan that really exists in the old fixture — so a failure is "this plan
  // is not in that state", never "no such row", which would be a red run about nothing.
  return {
    projectId: project.id,
    late: a.id,
    onPlan: b.id,
    stale: c.id,
    never: a.id,
    violating: b.id,
    empty: c.id,
    liveInvite: '00000000-0000-0000-0000-000000000000',
    expiredInvite: '00000000-0000-0000-0000-000000000001',
  };
}, slug);

console.log(`# M0-T2 red run — the control against \`main\`'s seed\n`);
console.log(`Organisation: \`${slug}\`  ·  plans: ${ids.late}, ${ids.onPlan}, ${ids.stale}\n`);
try {
  const r = assertLandingStates(ids);
  console.log(
    `**FAILED TO GO RED** — the control passed all ${String(r.checked)} checks against the old seed.`,
  );
  console.log('It cannot tell a fixture that can exhibit the states from one that cannot.');
  process.exitCode = 1;
} catch (error) {
  console.log('```');
  console.log(String(error.message));
  console.log('```');
}
await browser.close();
