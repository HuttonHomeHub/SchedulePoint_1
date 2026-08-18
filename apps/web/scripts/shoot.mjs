/**
 * Screenshot harness for the ADR-0097 redesign.
 *
 * **Why this exists.** Every previous epic in this repository that touched the visual design was
 * argued from numbers — token ratios, band heights, label widths — and the numbers were right and
 * the screens still landed wrong twice (ADR-0091's "it looks awful", ADR-0092's four reports). A
 * contrast matrix cannot tell you a screen is ugly, and a Playwright assertion cannot tell you a
 * heading is competing with the thing beneath it. This puts a real rendered screen in front of a
 * reviewer — human or otherwise — at a named width, on demand.
 *
 * It drives the REAL app against a REAL API, because the alternative (a component in isolation) is
 * how three separate epics shipped a control that looked right alone and wrong in place.
 *
 *   node scripts/shoot.mjs                       # every shot at the default widths
 *   node scripts/shoot.mjs --only sign-in        # one shot
 *   node scripts/shoot.mjs --width 1646          # one width (the product owner's Surface Pro)
 *
 * Output lands in `.screenshots/<width>/<name>.png`, git-ignored.
 */
import { chromium } from '@playwright/test';
import { globSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const OUT = '.screenshots';

// 1646 is the product owner's Surface Pro (2880×1920 at 175%), established in ADR-0091's
// retrospective as the width two whole epics had never once measured at. It leads the list
// deliberately: it is the screen this work is judged on.
const WIDTHS = [1646, 1920, 1280];

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const stamp = Date.now();
const password = 'correct-horse-battery';

/** Sign up and create an organisation; returns the slug. Each run gets its own tenant. */
async function onboard(page) {
  const slug = `shoot-co-${stamp}`;
  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(`shoot-${stamp}@example.com`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
  await page.getByLabel('Organisation name').fill(`Shoot Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await page.waitForURL(new RegExp(`/orgs/${slug}`));
  return slug;
}

const SHOTS = [
  { name: 'sign-in', signedOut: true, go: (p) => p.goto(`${BASE}/sign-in`) },
  { name: 'sign-up', signedOut: true, go: (p) => p.goto(`${BASE}/sign-up`) },
  { name: 'org-home', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}`) },
  { name: 'clients', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/clients`) },
  { name: 'calendars', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/calendars`) },
  { name: 'resources', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/resources`) },
  { name: 'members', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/members`) },
  { name: 'recently-deleted', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/recently-deleted`) },
];

const only = arg('only');
const widths = arg('width') ? [Number(arg('width'))] : WIDTHS;
const wanted = SHOTS.filter((s) => !only || s.name === only);

await rm(OUT, { recursive: true, force: true });

/**
 * The same browser discovery `scripts/e2e-local.sh:84-86` does, for the same reason: this
 * container ships a Chromium build under `/opt/pw-browsers` that need not match the revision
 * `@playwright/test` pins, and the pinned path does not exist. Resolved rather than hardcoded so
 * a container image bump does not silently break this harness — and reading `PLAYWRIGHT_CHROMIUM_PATH`
 * first means the shell script's answer wins when it set one.
 */
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
if (!executablePath) {
  throw new Error(
    'No Chromium found under /opt/pw-browsers. Set PLAYWRIGHT_CHROMIUM_PATH, or run this ' +
      'through scripts/e2e-local.sh, which does the same discovery.',
  );
}

const browser = await chromium.launch({ executablePath });

for (const width of widths) {
  const dir = join(OUT, String(width));
  await mkdir(dir, { recursive: true });

  // One context per width, so the sign-up happens once and every authenticated shot reuses it.
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  const slug = wanted.some((s) => !s.signedOut) ? await onboard(page) : null;

  for (const shot of wanted) {
    if (shot.signedOut) {
      // A signed-out shot needs its own context — the session cookie would redirect it away.
      const anon = await browser.newContext({ viewport: { width, height: 1000 } });
      const anonPage = await anon.newPage();
      await shot.go(anonPage);
      await anonPage.waitForLoadState('networkidle');
      await anonPage.screenshot({ path: join(dir, `${shot.name}.png`) });
      await anon.close();
    } else {
      await shot.go(page, slug);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: join(dir, `${shot.name}.png`) });
    }
    console.log(`${width}  ${shot.name}`);
  }
  await context.close();
}

await browser.close();
console.log(`\nwrote ${OUT}/`);
