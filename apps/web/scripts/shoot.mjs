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
 * — and return `{ planId, projectId, clientId }`.
 *
 * It returns the whole triple rather than just the plan because the project-detail screen is a shot
 * too (M0-T2) and there is no route to it that does not know its id. Navigating there through the
 * Explorer would work and is the wrong trade for a harness: it would make a photograph fail for a
 * navigation reason, which is exactly what {@link seed}'s docblock says not to do.
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
    // **A PARALLEL BRANCH WITH FLOAT, and it is not decoration.** A pure chain makes every
    // activity critical, so every diagram shot ever taken of this plan showed one colour — the
    // on-schedule and near-critical fills, two thirds of the criticality ladder, had never been
    // photographed at all, and neither had a float tail or a link-slack cue, because there is no
    // float in the plan to draw. That is `seed`'s "photographs a lie" one level in: the picture
    // was of a correct diagram that could not exercise the thing under review.
    //
    // Two short activities hanging off the first and merging into the last. Their path is much
    // shorter than the spine, so they carry real total float and paint the ON-SCHEDULE fill.
    //
    // **They land at 18 working days of float, both of them, and that is structural** — an
    // unbranched FS(0) sub-chain has uniform total float, so no arrangement of these two could
    // ever put one in the near-critical band and the other outside it. This docblock claimed
    // exactly that for about an hour before a reviewer ran the real engine over the graph this
    // function POSTs and reported the actual figures. The near-critical fill comes from the third
    // path below, which is sized for it.
    // `laneIndex` is explicit: the branch runs CONCURRENTLY with the spine, so without a lane of
    // its own the packer leaves it on lane 0 and it draws straight through the bars it is
    // parallel to. The first version of this seed did exactly that and the shot was unreadable.
    const branch = [];
    for (const [code, name, durationDays, laneIndex] of [
      ['A1100', 'Divert services', 4, 1],
      ['A1110', 'Temporary hoarding', 3, 2],
    ]) {
      branch.push(
        await post(`/plans/${plan.id}/activities`, { name, code, durationDays, laneIndex }),
      );
    }
    await post(`/plans/${plan.id}/dependencies`, {
      predecessorId: made[0].id,
      successorId: branch[0].id,
    });
    await post(`/plans/${plan.id}/dependencies`, {
      predecessorId: branch[0].id,
      successorId: branch[1].id,
    });
    await post(`/plans/${plan.id}/dependencies`, {
      predecessorId: branch[1].id,
      successorId: made[made.length - 1].id,
    });
    // **A THIRD path, sized to land NEAR-CRITICAL** — total float > 0 but ≤ 5 days
    // (`NEAR_CRITICAL_THRESHOLD_MINUTES`). Without it the fixture has only two of the three
    // criticality states, so the tightest pair in the whole ladder — near-critical against
    // on-schedule at 1.55:1 — was verified by the contrast matrix and by NOTHING that renders.
    // The legend printed a swatch with no bar anywhere in the evidence set to point at.
    //
    // The spine between the first and last activity is 25 working days; 21 days of branch leaves
    // 4 days of float, which is inside the threshold.
    const nearBranch = [];
    for (const [code, name, durationDays, laneIndex] of [
      ['A1200', 'Piling mat & access', 11, 3],
      ['A1210', 'Attenuation crate install', 10, 4],
    ]) {
      nearBranch.push(
        await post(`/plans/${plan.id}/activities`, { name, code, durationDays, laneIndex }),
      );
    }
    await post(`/plans/${plan.id}/dependencies`, {
      predecessorId: made[0].id,
      successorId: nearBranch[0].id,
    });
    await post(`/plans/${plan.id}/dependencies`, {
      predecessorId: nearBranch[0].id,
      successorId: nearBranch[1].id,
    });
    await post(`/plans/${plan.id}/dependencies`, {
      predecessorId: nearBranch[1].id,
      successorId: made[made.length - 1].id,
    });
    await post(`/plans/${plan.id}/schedule/recalculate`, {});
    return { planId: plan.id, projectId: project.id, clientId: client.id };
  }, slug);
}

/**
 * Mint a guest share link for the seeded plan and return the URL a recipient would be sent.
 *
 * The token is returned **once**, at creation, and lives in the URL *fragment* (ADR-0051) so it
 * never reaches a referrer or a server log. That is why this exists at all: there is no way to
 * recover the link afterwards, so the harness has to be the thing that creates it.
 */
async function mintShareLink(page, slug, planId) {
  return page.evaluate(
    async ({ org, plan }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${plan}/shares`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'Client review' }),
      });
      if (!response.ok) throw new Error(`shares: ${response.status} ${await response.text()}`);
      const { data } = await response.json();
      return data.url ?? null;
    },
    { org: slug, plan: planId },
  );
}

const SHOTS = [
  { name: 'sign-in', signedOut: true, go: (p) => p.goto(`${BASE}/sign-in`) },
  { name: 'sign-up', signedOut: true, go: (p) => p.goto(`${BASE}/sign-up`) },
  // **The four remaining public screens** (M0-T2). The pre-authentication surface is six routes and
  // the harness had two of them — so `auth`, the one scope this epic may retire, was two-thirds
  // unphotographed. `reset-password`, `verify-email` and `accept-invite` are shot WITHOUT a token
  // on purpose: that is the invalid-link state, which is a real screen a real person reaches (an
  // expired email, a truncated link) and the one most likely to be forgotten in a re-derivation.
  { name: 'forgot-password', signedOut: true, go: (p) => p.goto(`${BASE}/forgot-password`) },
  { name: 'reset-password', signedOut: true, go: (p) => p.goto(`${BASE}/reset-password`) },
  { name: 'verify-email', signedOut: true, go: (p) => p.goto(`${BASE}/verify-email`) },
  { name: 'accept-invite', signedOut: true, go: (p) => p.goto(`${BASE}/accept-invite`) },
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
  { name: 'audit-log', go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/audit-log`) },
  {
    name: 'project-detail',
    programme: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/projects/${ids.projectId}`),
  },
  // **One error state and one loading state**, both produced by intercepting the request rather
  // than by contriving data — which is what makes them deterministic. Every screen in this product
  // has three states and the harness had only ever photographed the third, so a re-derivation could
  // land a destructive-token or a skeleton value that nobody looks at until it is in front of a
  // customer.
  {
    name: 'clients-error',
    intercept: { url: '**/api/v1/organizations/*/clients*', fulfil: 500 },
    go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/clients`),
    // **`expectText`, because the first version of this shot photographed a SPINNER.** The query
    // retries a 500 three times, so the error state does not arrive for ~5 s — and the harness
    // wrote the picture and printed the shot's name as though it had worked. That is the same
    // green-result-about-nothing the 404 guard above exists for, one state along: a shot NAMED for
    // a state has to prove it reached it, or it is evidence of nothing.
    expectText: /Couldn.t load clients/i,
  },
  {
    name: 'clients-loading',
    intercept: { url: '**/api/v1/organizations/*/clients*', hang: true },
    go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/clients`),
    expectText: /Loading clients/i,
  },
  // **The plan workspace, which this harness omitted for its whole existence.** Nine screens were
  // shot and the TSLD canvas — the product's reason to exist, and the subject of four consecutive
  // epics of command-surface work — was not one of them. The design-system work had this camera and
  // the toolbar work had a ruler, so the screen that needed the camera fell in the gap between two
  // workstreams and was argued from band heights for months. Both pen states, because the shaded
  // read-only row is what a reader actually arrives to and it looks nothing like the editing one.
  {
    name: 'plan-workspace',
    programme: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
  },
  {
    name: 'plan-workspace-readonly',
    programme: true,
    releasePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
  },
  // **The activity editor, which nothing had ever photographed** (ADR-0101). The harness gained
  // the plan workspace after the register found it had never been shot; the editor sitting ON that
  // workspace fell into the same gap one level in, and the screen that reached the product owner
  // was a four-tab form in a 300 px column with four scrollbars. A shot list that stops at the
  // route and never opens what the route opens is the same blind spot with a smaller radius.
  {
    name: 'plan-workspace-editor',
    programme: true,
    // **`takePen`, because the shot before this one gives the pen away.** The lease is per PLAN and
    // the shots share one, so `plan-workspace-readonly` leaves it released and every later shot of
    // that plan inherits a shaded Edit. The shot passed alone under `--only` and failed in the full
    // run — a shot list is ordered state, not three independent pictures, and the only thing that
    // reports it is running the whole list.
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: openActivityEditor,
  },
  // **The Gantt, in both arrow states** (M0-T2). It is a peer view of the same plan (ADR-0059) and
  // the harness had never seen it — so half the product's schedule surface was outside the one
  // instrument this epic is judged by. Arrows ship default-off (ADR-0095), so the default is shot
  // first and the toggled state second; a re-derivation that only ever looks at the default would
  // land an arrow colour nobody checks.
  {
    name: 'gantt',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}?view=gantt`),
  },
  {
    name: 'gantt-arrows',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}?view=gantt`),
    // **"Logic links", not "Dependencies".** Probed, after the obvious guess timed out against a
    // correct control — and the name is Gantt-only: the TSLD's View panel has no such entry,
    // because on a time-scaled logic diagram the links are the picture rather than an option.
    after: (p) => toggleViewSwitch(p, /logic links/i),
  },
  // **The minimap** (ADR-0100, landed 2026-08-21). Its two-tone frame is the token pair with no
  // ancestor in the recovered palette and no resolver behind it — a white stroke derived against a
  // near-black ground. If anything in the diagram is visibly wrong on paper, it is this.
  {
    name: 'plan-workspace-minimap',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: (p) => toggleViewSwitch(p, /minimap/i),
  },
  // **The lenses on** (M2). Float & drift tails, link slack and the late-start overlay are all
  // default-off, so every previous shot of this diagram photographed the plainest thing it can
  // draw. They are ~20 of the palette's token reads and the matrix cannot say whether they READ —
  // the float tails are hatched, the slack cue is a dashed rule, and neither is a pair it asserts.
  {
    name: 'plan-workspace-lenses',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: async (p) => {
      await toggleViewSwitch(p, /float & drift/i);
      await toggleViewSwitch(p, /link slack/i);
      await toggleViewSwitch(p, /late-start overlay/i);
    },
  },
  // **The guest share view** — the only screen in the product a person outside the organisation
  // ever sees, and the only authenticated-adjacent surface with no session at all. Session-less by
  // construction (ADR-0051), so it takes its own anonymous context like the public screens, but it
  // needs a token minted from the signed-in one first.
  { name: 'share-guest', programme: true, shareGuest: true },
  // **The exported diagram, saved as the artefact the planner actually hands over** (M0-T2).
  // This is the shot whose ABSENCE produced `docs/TECH_DEBT.md` #158: the whole shot list stopped
  // at what a screen looks like and never once looked at what the product PRODUCES, so a printed
  // programme with a near-black diagram inside white paper chrome shipped and stayed shipped. It
  // captures the download rather than screenshotting the page, because the file is the deliverable
  // and a picture of the menu that made it proves nothing.
  { name: 'export-diagram', programme: true, takePen: true, exportPng: true },
];

/**
 * Flip one switch in the `View ▾` menu and close it again, so the shot photographs the diagram
 * rather than an open menu over it.
 *
 * Named by pattern rather than by exact string on purpose: three epics have renamed these items
 * (ADR-0091 M7 shortened three labels outright), and a harness that fails on a label change reports
 * a design problem it does not have.
 */
async function toggleViewSwitch(page, pattern) {
  await page.getByRole('button', { name: /^View/ }).first().click();
  // **A `checkbox` inside a `dialog`, not a `menuitemcheckbox` inside a `menu`.** `View` is
  // `aria-haspopup="dialog"` and the panel is a popover of radio groups and checkboxes — probed,
  // because the first version of this helper assumed the ADR-0031 menu taxonomy from the toolbar's
  // other triggers and timed out against a perfectly correct control.
  const panel = page.getByRole('dialog').last();
  const item = panel.getByRole('checkbox', { name: pattern }).first();
  await item.waitFor({ timeout: 5000 });
  await item.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
}

/**
 * Select the first activity from the canvas's parallel listbox and open its editor — the keyboard
 * route, because it needs no bar coordinates and it is a real path a planner has.
 */
async function openActivityEditor(page) {
  const listbox = page.getByRole('listbox', { name: 'Activities in the diagram' });
  await listbox.focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  await edit.first().click();
  await page.getByRole('dialog').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
}

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
  let ids = null;

  for (const shot of wanted) {
    if (shot.exportPng) {
      if (!ids) ids = await seedProgramme(page, slug);
      await page.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1200);
      const start = page.getByRole('button', { name: 'Start editing' });
      if (await start.isVisible().catch(() => false)) await start.click();
      await page
        .getByRole('button', { name: /share.*export/i })
        .first()
        .click();
      const download = page.waitForEvent('download', { timeout: 20_000 });
      await page.getByRole('menuitem', { name: 'Diagram — whole plan (PNG)' }).click();
      const file = await download;
      await file.saveAs(join(dir, `${shot.name}.png`));
    } else if (shot.shareGuest) {
      // Needs BOTH contexts: the signed-in one to mint the link, and an anonymous one to view it
      // as a recipient would. Minting first also means `programme` seeding has already run.
      if (!ids) ids = await seedProgramme(page, slug);
      const url = await mintShareLink(page, slug, ids.planId).catch(() => null);
      if (!url) {
        console.log(`${width}  ${shot.name}  SKIPPED — no share URL returned`);
        continue;
      }
      const anon = await browser.newContext({ viewport: { width, height: 1000 } });
      const anonPage = await anon.newPage();
      await anonPage.goto(url.startsWith('http') ? url : `${BASE}${url}`);
      await anonPage.waitForLoadState('networkidle');
      await anonPage.waitForTimeout(1200);
      await anonPage.screenshot({ path: join(dir, `${shot.name}.png`) });
      await anon.close();
    } else if (shot.signedOut) {
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
      if (shot.programme && !ids) ids = await seedProgramme(page, slug);
      // **Intercepts arm BEFORE the navigation and disarm after the shot**, so a hung route cannot
      // leak into the next picture. `hang` never resolves — Playwright abandons it when the context
      // closes — which is the only way to hold a loading state still enough to photograph.
      if (shot.intercept) {
        await page.route(shot.intercept.url, async (route) => {
          if (shot.intercept.hang) return; // deliberately never fulfilled
          await route.fulfill({
            status: shot.intercept.fulfil,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }),
          });
        });
      }
      await shot.go(page, slug, ids);
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
      // **`networkidle` can never settle behind a hung intercept** — that is the whole point of the
      // loading shot, and waiting for it would hang the harness rather than photograph the state.
      // A fixed settle is the right instrument for exactly this one case and the wrong one for
      // every other, so it is branched rather than applied everywhere.
      if (shot.intercept?.hang) await page.waitForTimeout(1500);
      else await page.waitForLoadState('networkidle');
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
      if (shot.takePen) {
        const start = page.getByRole('button', { name: 'Start editing' });
        if (await start.isVisible().catch(() => false)) {
          await start.click();
          await page.getByRole('button', { name: 'Stop editing' }).waitFor();
          await page.waitForTimeout(400);
        }
      }
      if (shot.after) await shot.after(page);
      if (shot.expectText) {
        // **Scoped to `main`.** A page-wide match would find the Project Explorer's own loading and
        // error copy, which is a different pane in a different state — the guard would pass while
        // the pane being photographed was still a spinner, committing the exact failure it exists
        // to prevent. `waitFor` polls to a real deadline rather than a settle somebody guessed.
        await page
          .locator('main')
          .getByText(shot.expectText)
          .first()
          .waitFor({ state: 'visible', timeout: 20_000 })
          .catch(() => {
            throw new Error(
              `${shot.name}: never reached the state it is named for (${shot.expectText}). ` +
                'The picture would be of some other state, which is worse than no picture.',
            );
          });
        await page.waitForTimeout(300);
      }
      await page.screenshot({ path: join(dir, `${shot.name}.png`) });
      // Disarm, or the next shot inherits this one's failure — the harness reuses one page per
      // width, so a route left armed is a defect that shows up several pictures later.
      if (shot.intercept) await page.unroute(shot.intercept.url);
    }
    console.log(`${width}  ${shot.name}`);
  }
  await context.close();
}

await browser.close();
console.log(`\nwrote ${OUT}/`);
