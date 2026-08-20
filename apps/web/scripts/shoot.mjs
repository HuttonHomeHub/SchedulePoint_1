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

/**
 * Sign up and create an organisation; returns the slug. Each run gets its own tenant.
 *
 * **The tenant is per WIDTH, not per run**, and that is a repair rather than a nicety: the
 * identity was `shoot-${stamp}` alone, so the first width onboarded and every later one tried to
 * sign up an address that already existed, sat on the organisation heading and threw after 30 s.
 * The harness could therefore only ever complete ONE of its three widths — and it reported that
 * as an uncaught exception AFTER writing a full, correct-looking set of pictures for 1646, which
 * is the shape of failure this file's own docblock is about (2026-08-19).
 */
async function onboard(page, width) {
  const id = `${stamp}-${width}`;
  const slug = `shoot-co-${id}`;
  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(`shoot-${id}@example.com`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
  await page.getByLabel('Organisation name').fill(`Shoot Co ${id}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await page.waitForURL(new RegExp(`/orgs/${slug}`));
  return slug;
}

/**
 * Give the organisation something to be an overview OF.
 *
 * Added when the landing page stopped being a welcome card (ADR-0098): a freshly-onboarded
 * organisation renders the new-organisation empty state, so shooting `org-home` straight after
 * `onboard` photographed the least interesting of the screen's states and called it the screen.
 * Both are worth seeing, so both are shot — `org-home-empty` before this runs, `org-home` after.
 *
 * It goes through the API rather than the UI because this is a screenshot harness, not a journey:
 * the assertions about whether those forms work belong to `e2e-overview/`, and driving them here
 * would make a photograph fail for a reason that has nothing to do with how the screen looks.
 */
async function seed(page, slug) {
  const created = await page.evaluate(async (org) => {
    const post = async (path, body) => {
      const response = await fetch(`/api/v1/organizations/${org}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
      return (await response.json()).data;
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
    return plans.length;
  }, slug);
  console.log(`      seeded ${created} plans`);
}

/**
 * Seed ONE plan with a real programme — six linked activities of differing durations, recalculated
 * — and return its id.
 *
 * **Separate from {@link seed} because that one photographs a lie.** It gives each plan a single
 * five-day activity called "Pour slab", which is ample for a table screen and useless for the
 * canvas: the diagram renders one bar in the first week and 90 % hatching, so the shot looks like
 * a seeding artefact rather than what it is. The plan workspace is the one screen where the CONTENT
 * is the design under review, so it gets content.
 */
async function seedProgramme(page, slug) {
  return page.evaluate(async (org) => {
    const post = async (path, body) => {
      const response = await fetch(`/api/v1/organizations/${org}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
      return (await response.json()).data;
    };
    const client = await post('/clients', { name: 'Northgate Developments' });
    const project = await post(`/clients/${client.id}/projects`, { name: 'Riverside Quarter' });
    const plan = await post(`/projects/${project.id}/plans`, {
      name: 'Riverside — Phase 2 Substructure',
      plannedStart: '2026-01-05',
    });
    await post(`/plans/${plan.id}/edit-lock`, {});
    const made = [];
    const work = [
      ['A1000', 'Site setup & hoarding', 5],
      ['A1010', 'Excavate to formation', 8],
      ['A1020', 'Blind & reinforce', 6],
      ['A1030', 'Pour ground slab', 4],
      ['A1040', 'Cure & strike', 7],
      ['A1050', 'Erect frame — core', 12],
    ];
    for (const [code, name, durationDays] of work) {
      made.push(await post(`/plans/${plan.id}/activities`, { name, code, durationDays }));
    }
    // A chain, so the canvas draws logic rather than a column of unrelated bars starting on the
    // data date — which is exactly how the pre-repair screenshot read.
    for (let i = 1; i < made.length; i += 1) {
      await post(`/plans/${plan.id}/dependencies`, {
        predecessorId: made[i - 1].id,
        successorId: made[i].id,
      });
    }
    await post(`/plans/${plan.id}/schedule/recalculate`, {});
    return plan.id;
  }, slug);
}

const SHOTS = [
  { name: 'sign-in', signedOut: true, go: (p) => p.goto(`${BASE}/sign-in`) },
  { name: 'sign-up', signedOut: true, go: (p) => p.goto(`${BASE}/sign-up`) },
  // Both states of the landing, because a freshly-onboarded organisation renders the
  // new-organisation empty state — so shooting `org-home` straight after `onboard` photographed
  // the least interesting of the screen's states and called it the screen.
  { name: 'org-home-empty', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}`) },
  { name: 'org-home', seedFirst: true, go: (p, slug) => p.goto(`${BASE}/orgs/${slug}`) },
  { name: 'clients', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/clients`) },
  { name: 'calendars', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/calendars`) },
  { name: 'resources', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/resources`) },
  { name: 'members', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/members`) },
  { name: 'recently-deleted', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/recently-deleted`) },
  // **The plan workspace, which this harness omitted for its whole existence.** Nine screens were
  // shot and the TSLD canvas — the product's reason to exist, and the subject of four consecutive
  // epics of command-surface work — was not one of them. The design-system work had this camera and
  // the toolbar work had a ruler, so the screen that needed the camera fell in the gap between two
  // workstreams and was argued from band heights for months. Both pen states, because the shaded
  // read-only row is what a reader actually arrives to and it looks nothing like the editing one.
  {
    name: 'plan-workspace',
    programme: true,
    go: (p, slug, planId) => p.goto(`${BASE}/orgs/${slug}/plans/${planId}`),
  },
  {
    name: 'plan-workspace-readonly',
    programme: true,
    releasePen: true,
    go: (p, slug, planId) => p.goto(`${BASE}/orgs/${slug}/plans/${planId}`),
  },
];

// `--only` takes a comma-separated list. It was a single name until two consecutive runs of
// `--only <name>` produced one file: the wipe below is unconditional, so the second run deleted
// the first run's output. Clearing only what is about to be re-taken fixes the general case; taking
// several shots in one run is what you usually wanted anyway.
const only = arg('only')
  ?.split(',')
  .map((name) => name.trim());
const widths = arg('width') ? [Number(arg('width'))] : WIDTHS;
const wanted = SHOTS.filter((s) => !only || only.includes(s.name));
if (wanted.length === 0) {
  throw new Error(
    `--only ${arg('only')} matches no shot. Known: ${SHOTS.map((s) => s.name).join(', ')}`,
  );
}

if (!only) await rm(OUT, { recursive: true, force: true });

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
  const slug = wanted.some((s) => !s.signedOut) ? await onboard(page, width) : null;
  let seeded = false;
  let planId = null;

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
      if (shot.seedFirst && !seeded) {
        await seed(page, slug);
        seeded = true;
      }
      if (shot.programme && !planId) planId = await seedProgramme(page, slug);
      await shot.go(page, slug, planId);
      // **A shot that photographed a 404 reported success.** The first run of `plan-workspace`
      // used the wrong route, wrote a picture of "Not Found", and printed the shot's name as
      // though it had worked — a green result about nothing, which is the failure class this
      // repository keeps recording. A photograph nobody looks at is worth less than nothing, so
      // the harness refuses to write one it can already tell is wrong.
      if (
        await page
          .getByText('Not Found', { exact: true })
          .isVisible()
          .catch(() => false)
      ) {
        throw new Error(`${shot.name}: the page is a 404 — the route is wrong, not the screen.`);
      }
      await page.waitForLoadState('networkidle');
      // The canvas paints from a ResizeObserver and an animation frame, neither of which
      // `networkidle` waits for — a shot taken on the idle event alone catches an empty canvas and
      // is indistinguishable from a canvas that IS empty, which is the confusion this whole shot
      // exists to resolve.
      if (shot.programme) await page.waitForTimeout(1200);
      if (shot.releasePen) {
        // The state a reader ARRIVES in. It is a different screen: five controls shade out, and
        // the pen cluster changes width. Shooting only the editing state photographs the rarer half.
        const stop = page.getByRole('button', { name: 'Stop editing' });
        if (await stop.isVisible().catch(() => false)) {
          await stop.click();
          await page.getByRole('button', { name: 'Start editing' }).waitFor();
          await page.waitForTimeout(400);
        }
      }
      await page.screenshot({ path: join(dir, `${shot.name}.png`) });
    }
    console.log(`${width}  ${shot.name}`);
  }
  await context.close();
}

await browser.close();
console.log(`\nwrote ${OUT}/`);
