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
 *   pnpm --filter @repo/web shoot                # every shot at the default widths
 *   pnpm --filter @repo/web shoot --only sign-in # one shot
 *   pnpm --filter @repo/web shoot --width 1646   # one width (the product owner's Surface Pro)
 *
 * **Use the script, not `node scripts/shoot.mjs` directly.** Since the staff shot became
 * satisfiable this file imports `SmtpSink` from TypeScript, so it needs
 * `--experimental-strip-types`, which the script carries. Without it the import throws — loudly,
 * which is the right way for a harness to fail.
 *
 * Output lands in `.screenshots/<width>/<name>.png`, git-ignored.
 */
import { chromium } from '@playwright/test';
import { globSync } from 'node:fs';

// **Imported straight from the TypeScript the journeys use, under `--experimental-strip-types`.**
// The approved plan recommended moving `SmtpSink` to `.mjs` + a `.d.ts` so bare `node` could read
// it; sub-option (i) — strip the types instead — was rejected there without being tried, and it
// works on this repository's Node floor (measured on 22.22.2). It is taken because it is strictly
// smaller: the sink stays ONE implementation with its types attached, and the three specs and one
// config that already import it are untouched. The `shoot` script in `package.json` carries the
// flag so the documented route always has it; without the flag the import throws loudly, which is
// the right failure mode for a harness (ADR-0065 / ADR-0121: two copies drift invisibly — this way
// there is no second copy to drift).
import { firstUrlIn, SmtpSink } from '../e2e-account/smtp-sink.ts';

/**
 * Must match the port in the `MAIL_SMTP_URL` the API was booted with, which is why it reads the
 * same `E2E_SMTP_PORT` default `playwright.staff.config.ts:66` uses. Two numbers that have to agree
 * and are written down twice is how they stop agreeing.
 */
const STAFF_SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? '3026');
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// The landing fixture lives in its own module because `measure-overview.mjs` needs the SAME one —
// two seeds for one fixture drift, and the drift is invisible (ADR-0065, ADR-0121).
import { assertLandingStates, expireInvitation, seedLandingStates } from './landing-fixture.mjs';

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
 * A well-formed id that names nothing, for the three not-found shots.
 *
 * A UUID rather than `missing`: the route params are validated, so a non-UUID is refused before the
 * query runs and would photograph a different screen from the one a person with a stale bookmark
 * actually reaches. All-zeroes is deliberately unmistakable in a URL bar that ends up in a picture.
 */
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

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
 * Sign in as a **verified staff** account, so `/staff` can be photographed.
 *
 * **Why this could not simply reuse `onboard()`.** That function mints
 * `shoot-${Date.now()}-${width}@example.com`, and staff-ness is decided by the API's `STAFF_EMAILS`
 * — read **once, before the process boots** (ADR-0086). An address containing a timestamp cannot be
 * in a variable that was set before the timestamp existed. So the staff shot needs a **knowable**
 * address, which is what `SHOOT_STAFF_EMAIL` is for; its default matches the one
 * `playwright.staff.config.ts` already allow-lists, so an API booted for the staff journey is
 * already booted for this.
 *
 * **And allow-listing is not enough: the guard demands `emailVerified`**, independently of
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` (`staff-bootstrap.service.ts:17-18` counts the allow-listed
 * accounts that are inert for exactly this reason). A verification token goes to the mailbox and
 * nowhere else — since ADR-0074 M0 the row stores it **hashed**, so it cannot be read back out of
 * the database either. Receiving the mail is therefore the only route, which is why this harness
 * now runs an SMTP sink and why `docs/TECH_DEBT.md` #319 called the shot unsatisfiable.
 *
 * The e2e database persists, so on every run after the first the account already exists and is
 * already verified; both branches are handled and neither is the error case.
 */
async function onboardStaff(page, sink) {
  const email = process.env.SHOOT_STAFF_EMAIL ?? 'ops@schedulepoint.test';
  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Ops Lovelace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /create an account/i }).click();

  // Already registered on a previous run: sign in instead. Deliberately not a `catch` around the
  // whole sign-up — that would swallow a real failure and land on the same screen.
  const taken = await page
    .getByText(/already|exists|registered/i)
    .first()
    .isVisible()
    .catch(() => false);
  if (taken) {
    await page.goto(`${BASE}/sign-in`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await page.waitForLoadState('networkidle');

  // Verify only if this run created the account. `waitFor` on mail nobody is going to send is a
  // 30-second timeout reported as a mail failure — the shape `staff.spec.ts:160-168` records
  // having been bitten by.
  await page.goto(`${BASE}/staff`);
  await page.waitForLoadState('networkidle');
  const heading = await page
    .getByRole('heading', { level: 1 })
    .first()
    .textContent()
    .catch(() => null);
  if (heading !== null && /staff console/i.test(heading)) return;

  const mail = await sink.waitFor(email, /verify-email/);
  const verifyUrl = firstUrlIn(mail.body);
  if (!verifyUrl) throw new Error(`no verification link was sent to ${email}`);
  await page.goto(verifyUrl);
  await page.waitForLoadState('networkidle');
}

/**
 * Sign up and STOP on the create-organisation step, so `/onboarding` can be photographed.
 *
 * It is the one authenticated screen no existing shot could reach: the `signedOut` branch has no
 * session and is redirected away, and every signed-in shot has already passed through this step to
 * get its organisation. So the screen every new member meets first was the one the harness
 * structurally could not see.
 *
 * The waited-for heading is the same one `onboard` waits for — deliberately, so a copy change
 * breaks both together rather than leaving this one photographing a blank page.
 */
async function signUpOnly(page, width) {
  const id = `onb-${stamp}-${width}`;
  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Grace Hopper');
  await page.getByLabel('Email').fill(`shoot-${id}@example.com`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
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
 * Seed a **dense** programme — WBS summaries, eight concurrent chains, cross-phase logic — and
 * return `{ planId, projectId, clientId }`.
 *
 * **A third seeder, for the reason the second one already gives about the first.**
 * {@link seed} "photographs a lie" (one activity per plan); {@link seedProgramme} fixes that for
 * the criticality ladder with six activities and three paths. Neither can exhibit what the product
 * owner reported on 2026-09-21 — links travelling across many lanes — because six bars cannot be
 * far apart, and neither carries a single `WBS_SUMMARY`, so the ADR-0063 band has never appeared in
 * any photograph this repository holds.
 *
 * It is **additive**: `seedProgramme`'s plan and every shot pinned to it are untouched, so this
 * cannot move a picture somebody is already comparing against.
 *
 * ## What it is built to show, and why each part is there
 *
 * - **Nine summaries within the band's depth cap** (one root at depth 0, eight phases at depth 1;
 *   `WBS_BAND_MAX_DEPTH` is 2). The band draws them and `deriveWbsBandSource` lifts them out of the
 *   scene — which is the precondition for `docs/TECH_DEBT.md` #364's empty lanes to appear at all.
 * - **Eight chains that run CONCURRENTLY**, because lanes are a function of overlap. Nothing
 *   constrains their starts, so they all begin at the data date and the packer must give each its
 *   own lane.
 * - **Cross-phase links**, which is the whole point: a link from one chain into another is a link
 *   between lanes, and the further apart the packer puts them the further it has to travel.
 *
 * ## What it is NOT
 *
 * It is not the plan from the product owner's screenshot — they could not supply that (CQ-4) — and
 * no claim is made that it resembles it beyond carrying the same *shape* of problem. Durations and
 * names are plausible construction work rather than a real programme.
 */
async function seedDense(page, slug) {
  return page.evaluate(async (org) => {
    /**
     * **Paced, because a dense plan is ~190 writes and the API throttles at 100/60 s.**
     *
     * The first run of this seeder fired them flat out and took a `429 RATE_LIMITED` part way
     * through the activities — which is `docs/TECH_DEBT.md` #361, and that row says in as many
     * words that the answer is NOT to raise the limit again. So the seeder lives inside the
     * budget rather than asking the product to widen it for a harness.
     *
     * 650 ms was the first attempt and it **still took a 429**: that is ~92 requests a minute
     * against a limit of 100 (`RATE_LIMIT_LIMIT`/`RATE_LIMIT_TTL`, `env.validation.ts:292-293`),
     * and the seeder does not have the bucket to itself — the app page is open behind it, polling
     * its edit-lock heartbeat and refetching. 1000 ms leaves a third of the budget for the product.
     *
     * The phase count came down with it, for the same reason rather than a different one: fewer
     * writes is the other half of living inside a limit you have decided not to raise.
     */
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const post = async (path, body) => {
      const response = await fetch(`/api/v1/organizations/${org}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
      const data = (await response.json()).data;
      await sleep(1000);
      return data;
    };
    const client = await post('/clients', { name: 'Meridian Infrastructure' });
    const project = await post(`/clients/${client.id}/projects`, { name: 'Unit 400 Upgrade' });
    const plan = await post(`/projects/${project.id}/plans`, {
      name: 'Unit 400 — Construction & Commissioning',
      plannedStart: '2026-03-02',
    });
    await post(`/plans/${plan.id}/edit-lock`, {});

    const root = await post(`/plans/${plan.id}/activities`, {
      name: 'Unit 400 Upgrade',
      code: 'W000',
      durationDays: 1,
      type: 'WBS_SUMMARY',
    });

    const phases = [
      [
        'Civils & Underground',
        ['Survey & set out', 'Excavate', 'Blind', 'Reinforce', 'Pour bases', 'Backfill'],
      ],
      [
        'Structural Steel',
        [
          'Deliver steel',
          'Erect columns',
          'Erect beams',
          'Plumb & bolt',
          'Grout bases',
          'Fire protection',
        ],
      ],
      [
        'Mechanical',
        ['Set vessels', 'Align pumps', 'Pipe spools', 'Weld tie-ins', 'Supports', 'Insulate'],
      ],
      [
        'Piping',
        [
          'Prefab spools',
          'Rack piping',
          'Small bore',
          'Hydrotest prep',
          'Hydrotest',
          'Reinstate joints',
        ],
      ],
      [
        'Electrical',
        ['Cable tray', 'Pull cable', 'Terminate LV', 'Terminate HV', 'Earthing', 'Loop check'],
      ],
      [
        'Instrumentation',
        [
          'Install transmitters',
          'Impulse lines',
          'Tubing',
          'Calibrate',
          'Loop folders',
          'Functional test',
        ],
      ],
      [
        'Commissioning',
        ['Flush & clean', 'Leak test', 'Energise', 'Dry run', 'Wet commissioning', 'Handover'],
      ],
    ];

    const chains = [];
    let code = 1000;
    for (const [phaseName, tasks] of phases) {
      const summary = await post(`/plans/${plan.id}/activities`, {
        name: phaseName,
        code: `W${String(code)}`,
        durationDays: 1,
        type: 'WBS_SUMMARY',
        parentId: root.id,
      });
      code += 10;
      const made = [];
      for (const task of tasks) {
        made.push(
          await post(`/plans/${plan.id}/activities`, {
            name: task,
            code: `A${String(code)}`,
            durationDays: 3 + (code % 7),
            parentId: summary.id,
          }),
        );
        code += 10;
      }
      for (let i = 1; i < made.length; i += 1) {
        await post(`/plans/${plan.id}/dependencies`, {
          predecessorId: made[i - 1].id,
          successorId: made[i].id,
        });
      }
      chains.push(made);
    }

    // **The cross-phase logic, which is what makes a link travel.** Each phase feeds the next from
    // its middle, and two long-range links reach from the first phase to the last — the shape a
    // planner sees as a line crossing most of the diagram.
    for (let i = 1; i < chains.length; i += 1) {
      await post(`/plans/${plan.id}/dependencies`, {
        predecessorId: chains[i - 1][3].id,
        successorId: chains[i][1].id,
      });
    }
    await post(`/plans/${plan.id}/dependencies`, {
      predecessorId: chains[0][2].id,
      successorId: chains[chains.length - 1][2].id,
    });
    await post(`/plans/${plan.id}/dependencies`, {
      predecessorId: chains[1][0].id,
      successorId: chains[chains.length - 2][4].id,
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
/**
 * One plan in an existing project, with no activities — the fixture for the guest view's empty
 * state (`docs/specs/empty-state-consolidation/` M5).
 *
 * It takes no edit lock, because it creates nothing that needs one: a plan is created against the
 * project, and every write the pen gates is a write to a plan's contents.
 */
async function seedEmptyPlan(page, slug, projectId) {
  return page.evaluate(
    async ({ org, project }) => {
      const response = await fetch(`/api/v1/organizations/${org}/projects/${project}/plans`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Riverside — Phase 3 (not started)',
          plannedStart: '2026-06-01',
        }),
      });
      if (!response.ok) throw new Error(`plans: ${response.status} ${await response.text()}`);
      return (await response.json()).data.id;
    },
    { org: slug, project: projectId },
  );
}

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
  // **The dense programme** (`docs/specs/diagram-legibility/`). Every canvas shot above uses
  // `seedProgramme`'s six activities, which cannot exhibit either thing this epic is about: a link
  // travelling across many lanes, or the ADR-0063 WBS band — no fixture in this repository carried
  // a single `WBS_SUMMARY` until now, so the band had never been photographed at all.
  //
  // **There is no PANNED companion, and the reason is worth more than the shot would have been.**
  // One was written, because the defect that opened this epic showed itself panned (58 of 60
  // gutter legs off-canvas — `m0-measurement.md`). Two helpers were tried and NEITHER panned: a
  // drag is the ADR-0080 marquee selection once the pen is taken, and the wheel moved nothing
  // either. Worse, the check that was supposed to catch it could not — comparing the two PNGs
  // byte-for-byte reports a difference every time, because this harness mints a fresh tenant per
  // run and paints its name into the header (ADR-0099 M2 records exactly that, which is why a
  // pixel diff is the method there). The shot was removed rather than shipped under a filename
  // that claimed something it did not show. If a panned view is wanted, the pan has to be built
  // and verified by LOOKING, not by comparing bytes.
  {
    name: 'plan-workspace-dense',
    dense: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: arrangeWithBand,
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
  // **The health check panel, and the printed report it hands over** (health M4-T1 step 7). The
  // register records a four-scrollbar editor reaching a user because the shot list stopped at the
  // route (ADR-0101), and a printed document is exactly the artefact nobody looks at until a
  // client does. Two shots: the docked panel over the programme (the reading surface), and the
  // print DOCUMENT — captured by stubbing `window.print` and revealing the detached container,
  // because the file-shaped deliverable here IS that DOM (the export-diagram rule, one medium
  // over). The programme plan fails several metrics honestly, so both shots carry real verdicts
  // and a real offender list rather than fourteen green rows.
  {
    name: 'plan-workspace-health',
    programme: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: openHealthPanel,
  },
  {
    name: 'health-print-document',
    programme: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: async (p) => {
      await openHealthPanel(p);
      await stubPrintDialog(p);
      await p.getByRole('button', { name: 'Print report' }).click();
      await revealPrintDocument(p);
    },
  },
  // **The other two print documents, which nothing had ever photographed** (M2-U2). The shot list
  // had exactly one — the health report — and the two artefacts a planner actually hands over,
  // the printed diagram and the printed programme, were absent. That is `docs/TECH_DEBT.md` #158's
  // shape one level in: the list stopped at the deliverable it had thought of. It is also where
  // this epic's defect lived, since `PrintSurface.css` and `GanttPrintSurface.css` are the two
  // stylesheets that named a face with no file — so the two documents nobody could see were the
  // two that were wrong.
  {
    name: 'tsld-print-diagram',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: async (p) => {
      await stubPrintDialog(p);
      await p
        .getByRole('button', { name: /share.*export/i })
        .first()
        .click();
      await p.getByRole('menuitem', { name: 'Print…', exact: true }).click();
      // The diagram path rasterises the whole-plan PNG before it mounts anything, so unlike the
      // other two this one is asynchronous — wait for the container rather than for a timeout.
      // `attached`, not the default `visible`: the container is `display: none` until the print
      // stylesheet or the reveal below shows it, so waiting for visibility waits forever.
      await p.locator('.tsld-print-container').waitFor({ state: 'attached', timeout: 30_000 });
      await revealPrintDocument(p);
    },
  },
  {
    // **Predecessors ON**, which the reader's default hides (`gantt-view-state.ts`
    // `DEFAULT_HIDDEN_COLUMNS`). The shot below it is the default document; this one is the fix
    // for `docs/TECH_DEBT.md` #217, and it needs the column visible to show anything: paper now
    // follows the reader's column choice, so the DEFAULT programme proves only that the column is
    // correctly absent. A picture of an absence cannot show that the names arrived.
    name: 'gantt-print-programme-predecessors',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}?view=gantt&ghide=none`),
    after: async (p) => {
      await stubPrintDialog(p);
      await p
        .getByRole('button', { name: /share.*export/i })
        .first()
        .click();
      await p.getByRole('menuitem', { name: 'Print…', exact: true }).click();
      await p.locator('.tsld-print-container').waitFor({ state: 'attached', timeout: 30_000 });
      await revealPrintDocument(p);
    },
  },
  {
    name: 'gantt-print-programme',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}?view=gantt`),
    after: async (p) => {
      await stubPrintDialog(p);
      await p
        .getByRole('button', { name: /share.*export/i })
        .first()
        .click();
      // The SAME menu item: `printDiagram` branches on the live view mode (ADR-0059 M4), so the
      // programme is what `Print…` produces while the Gantt is the current view.
      await p.getByRole('menuitem', { name: 'Print…', exact: true }).click();
      // `attached`, not the default `visible`: the container is `display: none` until the print
      // stylesheet or the reveal below shows it, so waiting for visibility waits forever.
      await p.locator('.tsld-print-container').waitFor({ state: 'attached', timeout: 30_000 });
      await revealPrintDocument(p);
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
  // **The five screens the harness had never photographed** (TECH_DEBT W1). Derived by matching
  // shot names against `src/routes/*.tsx`, then checking each candidate rather than trusting the
  // match — `plan-detail` looked unshot and is covered by the five `plan-workspace*` shots.
  // The light corporate theme (ADR-0102) repainted all five and nobody had looked at any of them.
  { name: 'account', go: (p) => p.goto(`${BASE}/account`) },
  { name: 'my-activity', go: (p) => p.goto(`${BASE}/me/activity`) },
  {
    name: 'client-detail',
    programme: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/clients/${ids.clientId}`),
  },
  // Its own context and its own account: a signed-in shot has already left this screen behind.
  { name: 'onboarding', onboarding: true },
  // **Opt-in, and it skips LOUDLY.** `/staff` is gated on the API's `STAFF_EMAILS` (ADR-0086) and
  // this harness boots no servers, so it can only be reached against an API started with that
  // variable set — see `playwright.staff.config.ts`, which already does exactly that. Silent
  // skipping is how a shot list grows a hole that reads as coverage.
  { name: 'staff', staff: true, go: (p) => p.goto(`${BASE}/staff`) },
  // **The state the design is actually judged on** (staff-console M0-T3, spec §4.7). An all-green
  // console cannot tell you whether a red state would be findable, so the epic's headline
  // falsification condition — every non-healthy condition named within the first viewport — is
  // measured here and nowhere else.
  //
  // It is a SECOND INVOCATION against a differently-configured API, not a second pass of one run:
  // this harness boots no servers (`:566-570`), and the recipe is environment. Take `staff` first,
  // against the healthy API, and this one second — `onboardStaff` can only VERIFY a new account by
  // receiving mail, so a fresh account cannot be created against an API whose transport is
  // deliberately unset. After the first run the account persists and is already verified, which is
  // what makes the ordering work rather than a coincidence.
  {
    name: 'staff-unhealthy',
    staff: true,
    go: (p) => p.goto(`${BASE}/staff`),
    // Keyed to spec §4.7's recipe, one probe per line, deliberately matching the VISIBLE sentence.
    // Coupling a measurement instrument to copy is right here: the shot is judged on what is on
    // screen, so a copy change should make this fail and be re-read, not pass quietly against a
    // condition that no longer announces itself.
    //
    // **The split into `conditions` and `ambient` is the whole point, and it was learnt by running
    // the first version against the HEALTHY API and watching it pass.** That version listed all
    // four together and required any two; `MAIL_ALERT_URL` and `HEARTBEAT_URL` are **empty by
    // default on every boot** (CLAUDE.md §17 — they are compose edits on the host), so it found
    // "Failure alerting: off, Heartbeat: off" on the healthy console and filed the picture. A
    // control written to stop a hierarchy assertion being judged over an empty set, satisfied by
    // two conditions that are true whether or not the recipe was ever applied. The
    // gate-that-cannot-see-the-defect shape, inside the gate written to prevent it.
    //
    // So `conditions` holds only what the recipe **turns on** — the probes that DISCRIMINATE
    // between the two boots — and **every one of them must be present**. `ambient` is reported for
    // the record and can satisfy nothing.
    conditions: [
      { id: 'MAIL_SMTP_URL unset', pattern: /No mail transport is configured/i },
      { id: 'RETENTION_SWEEP_ENABLED=false', pattern: /Retention sweeping is disabled/i },
    ],
    ambient: [
      { id: 'MAIL_ALERT_URL unset', pattern: /Failure alerting: off/i },
      { id: 'HEARTBEAT_URL unset', pattern: /Heartbeat: off/i },
    ],
  },
  // **The states the empty-state pass changed, which nothing had ever photographed**
  // (`docs/specs/empty-state-consolidation/` M8). The epic reshaped 27 sites and three of its
  // milestones owed a shot each; those are the six below. The reason they were owed rather than
  // taken at the time is the point: every one of them is a state you reach by getting something
  // wrong (a stale link), by sharing something unfinished, or by opening a tab — and a shot list
  // ordered by ROUTE cannot see any of that, which is the same blind spot ADR-0101 records one
  // level up.
  //
  // The three not-found screens are reached with a well-formed id that names nothing, which is the
  // real path: a bookmark to a deleted plan, or a link forwarded to somebody without access. An
  // intercepted 500 would photograph the same branch and prove less, because it could not tell you
  // the route resolves and the guard fires. `expectText` is what makes each a shot of the state it
  // is named for rather than of whatever rendered — the `clients-error` lesson, where the first
  // version photographed a spinner and reported success.
  {
    name: 'plan-not-found',
    go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/plans/${MISSING_ID}`),
    expectText: /doesn.t exist, was deleted, or you don.t have access/i,
  },
  {
    name: 'project-not-found',
    go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/projects/${MISSING_ID}`),
    expectText: /doesn.t exist, was deleted, or you don.t have access/i,
  },
  {
    name: 'client-not-found',
    go: (p, slug) => p.goto(`${BASE}/orgs/${slug}/clients/${MISSING_ID}`),
    expectText: /doesn.t exist, was deleted, or you don.t have access/i,
  },
  // **A shared plan with no work in it yet** (M5). `share-guest` above photographs the populated
  // view; this is the one an outsider meets when somebody shares a plan before building it, and it
  // is the only empty state in the product with no signed-in reader and no action — the archetype's
  // third shape. It needs its own plan, because the programme's cannot be un-populated.
  { name: 'share-guest-empty', shareGuest: true, emptyPlan: true },
  // **Two panel empty states behind a tab** (M6). The dock and the side panel are where
  // `NoticeStrip emphasis="dashed"` earns its place over `EmptyState`, and neither had been seen.
  {
    name: 'activity-editor-notes-empty',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: (p) => openEditorTab(p, 'Notes'),
  },
  {
    name: 'activity-editor-resources-empty',
    programme: true,
    takePen: true,
    go: (p, slug, ids) => p.goto(`${BASE}/orgs/${slug}/plans/${ids.planId}`),
    after: (p) => openEditorTab(p, 'Resources'),
  },
];

/**
 * Flip one switch in the `View ▾` menu and close it again, so the shot photographs the diagram
 * rather than an open menu over it.
 *
 * Named by pattern rather than by exact string on purpose: three epics have renamed these items
 * (ADR-0091 M7 shortened three labels outright), and a harness that fails on a label change reports
 * a design problem it does not have.
 */
/** Open the Analysis menu and the Health check dock, waiting for the report to settle. */
async function openHealthPanel(page) {
  await page.locator('[data-toolbar-item="analysis"]').first().click();
  await page.getByRole('menuitem', { name: 'Health check…' }).click();
  const panel = page.getByRole('region', { name: 'Health check' });
  await panel.waitFor({ timeout: 10_000 });
  await panel
    .getByText(/failed · /)
    .first()
    .waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
}

/**
 * Stop the browser's print dialog opening, so the detached container stays mounted long enough to
 * photograph. Teardown waits on `afterprint`, which a stub never fires.
 */
async function stubPrintDialog(page) {
  await page.evaluate(() => {
    globalThis.print = () => {};
  });
}

/**
 * Reveal the mounted print document and photograph it **as paper**.
 *
 * **Emulate the medium, or the shot is not of the medium it names.** The one print shot this
 * harness had revealed its container with `display: block` in page script and never called
 * `emulateMedia`, so `@media print` never applied: every rule that exists only on paper was absent
 * from the picture, and the shot showed the SCREEN's treatment of a print document. Found while
 * carrying the typeface to the print stylesheets (`docs/specs/typeface-outward-artefacts/` §5) —
 * those sheets set the family inside `@media print`, so the harness photographed the inherited
 * face while paper got the overridden one. It would have shown the RIGHT face throughout the whole
 * time the defect existed, which is worse than showing nothing.
 *
 * One helper rather than three copies: the three print documents share `mountPrintDocument`'s
 * container (`lib/print-document.ts`), and three reveals would drift in exactly the way the
 * `emulateMedia` omission did — silently, in the direction of looking correct.
 */
async function revealPrintDocument(page) {
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => {
    const node = globalThis.document.querySelector('.tsld-print-container');
    if (!(node instanceof globalThis.HTMLElement)) throw new Error('no print container mounted');
    // Reveal what the print stylesheet only shows on paper, and hide the app behind it.
    node.style.display = 'block';
    node.style.background = '#fff';
    node.style.position = 'fixed';
    node.style.inset = '0';
    node.style.overflow = 'auto';
    node.style.zIndex = '99999';
  });
  await page.waitForTimeout(400);
}

/**
 * Turn the ADR-0063 WBS band on, then press **Arrange**, the way a planner meeting an imported
 * programme does.
 *
 * **Both halves are the subject, not staging.** The band is what lifts summaries out of the scene,
 * which is the precondition for `docs/TECH_DEBT.md` #364's empty lanes; `Arrange` is the packer
 * whose objective this whole epic is about. A shot of this plan without them is a shot of neither.
 *
 * **It replaces hand-assigning `laneIndex`, which is what the first version did — badly.** Every
 * activity was left on the API's default lane 0, so the picture was fifty bars overlapping in one
 * row: no lanes, no visible logic, nothing to judge. `seedProgramme`'s own docblock warns about
 * precisely that ("without a lane of its own the packer leaves it on lane 0 and it draws straight
 * through the bars it is parallel to"), and this seeder made the same mistake after reading it.
 * Pressing the real control is better than a hand-placed fixture anyway: it photographs what the
 * product does rather than what the harness arranged for it to do.
 */
async function arrangeWithBand(page) {
  await toggleViewSwitch(page, /WBS band/i);
  await page.locator('[data-toolbar-item="auto-arrange"]').first().click();
  const confirm = page.getByRole('button', { name: 'Auto-arrange' });
  await confirm.waitFor({ timeout: 8000 });
  await confirm.click();
  // The repack is a batch write plus a refetch; the shot must not race it.
  await page
    .getByRole('button', { name: 'Auto-arrange' })
    .waitFor({ state: 'detached', timeout: 20_000 });
  await page.waitForTimeout(1500);
}

async function toggleViewSwitch(page, pattern) {
  // **By the registry id, never the copy** (`docs/TECH_DEBT.md` #199, and ADR-0091's own rule:
  // locate a toolbar control by `[data-toolbar-item]`). #199 hypothesised the old `/^View/` name
  // locator was folding a deck group card; PROBED 2026-08-28, that was false — the name resolved
  // the right control — but a name locator on a control whose label is one English word stays one
  // renamed caption away from the same timeout, so the id is the honest anchor either way.
  await page.locator('[data-toolbar-item="view"]').first().click();
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
/**
 * Open the activity editor and switch to one of its tabs, so the panel empty states can be
 * photographed (`docs/specs/empty-state-consolidation/` M6, M8).
 *
 * Two of the eight sites M6 converted live behind a tab that nothing had ever opened — the Notes
 * thread and the Resources assignment list — so the treatment they were given was reviewed as a
 * diff and never as a picture. The tab is found by role and accessible name rather than by a test
 * id: these are `Tabs` from `components/ui`, and a name change should break this loudly rather
 * than quietly photograph whichever tab happened to be first.
 */
async function openEditorTab(page, name) {
  await openActivityEditor(page);
  await page.getByRole('tab', { name }).click();
  await page.waitForTimeout(500);
}

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

const failures = [];
for (const width of widths) {
  const dir = join(OUT, String(width));
  await mkdir(dir, { recursive: true });

  // One context per width, so the sign-up happens once and every authenticated shot reuses it.
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  const slug = wanted.some((s) => !s.signedOut) ? await onboard(page, width) : null;
  let seeded = false;
  let ids = null;
  let denseIds = null;

  for (const shot of wanted) {
    // **A failed shot records itself and the run carries on** (#199's second half): the list is
    // ordered, so a throw here silently cost every LATER picture — and the three it killed were
    // the canvas lens states, the ones a contrast matrix and an axe scan structurally cannot
    // judge. An instrument that produces nothing must say so (the ADR-0100 rule); it must not
    // also destroy its neighbours' output.
    try {
      // **Reset the medium before every shot, unconditionally.** `emulateMedia` is a CONTEXT
      // setting that survives navigation, and this loop shares one page across the whole list — so
      // a print shot that emulated paper and did not restore it would photograph every LATER shot
      // as paper, silently and in the direction of looking plausible. Reset here rather than in
      // `revealPrintDocument`, because the screenshot is taken after `after` returns: the helper
      // cannot restore what the camera still needs. Unconditional, so the next print shot inherits
      // the protection instead of having to remember it.
      await page.emulateMedia({ media: null });
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
        // **A second plan, not the programme with its activities removed.** Deleting six
        // activities would leave the plan carrying their deletion batch and a computed schedule
        // that no longer describes it, which is a state the guest view can reach but is not the one
        // this shot is named for. A plan nobody has put work in yet is the honest fixture, and it
        // is cheap: one POST.
        const planId = shot.emptyPlan ? await seedEmptyPlan(page, slug, ids.projectId) : ids.planId;
        const url = await mintShareLink(page, slug, planId).catch(() => null);
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
      } else if (shot.onboarding) {
        // Its own context and its own account, because this screen exists only between signing up
        // and having an organisation — a state the shared signed-in context left behind minutes ago.
        const fresh = await browser.newContext({ viewport: { width, height: 1000 } });
        const freshPage = await fresh.newPage();
        await signUpOnly(freshPage, width);
        await freshPage.waitForLoadState('networkidle');
        await freshPage.screenshot({ path: join(dir, `${shot.name}.png`) });
        await fresh.close();
      } else if (shot.staff) {
        // **Skips loudly, and says what would make it run.** A silent skip in a shot list is
        // indistinguishable from coverage — which is the whole failure W1 exists to correct.
        if (process.env.SHOOT_STAFF !== '1') {
          console.log(
            `${width}  ${shot.name}  SKIPPED — set SHOOT_STAFF=1, and boot the API with: ` +
              `STAFF_EMAILS containing ${process.env.SHOOT_STAFF_EMAIL ?? 'ops@schedulepoint.test'}, ` +
              `MAIL_SMTP_URL=smtp://127.0.0.1:${STAFF_SMTP_PORT}, and MAIL_FROM (the API refuses to ` +
              `start with a transport and no sender). playwright.staff.config.ts:55-84 is the ` +
              `working recipe. For \`staff-unhealthy\`, boot a SECOND time on spec §4.7's recipe ` +
              `(MAIL_SMTP_URL, MAIL_ALERT_URL and HEARTBEAT_URL unset, ` +
              `RETENTION_SWEEP_ENABLED=false) — take \`staff\` first, because a new account can ` +
              `only be verified by receiving mail.`,
          );
          continue;
        }
        // **Its own context and its own account** — the shared signed-in page holds the stamped
        // `shoot-…@example.com` identity, which is not and cannot be in `STAFF_EMAILS` (see
        // `onboardStaff`). Photographing THAT would be a picture of the guard's uniform 404, which
        // is a real screen but not the one this shot is named for.
        //
        // This is the defect #319 described and the reason its headline was wrong: the shot has
        // always been on the list, and a reader auditing the list for `/staff` coverage found it
        // there. It could never have produced a picture.
        const sink = new SmtpSink();
        await sink.start(STAFF_SMTP_PORT);
        const staffCtx = await browser.newContext({ viewport: { width, height: 1000 } });
        try {
          const staffPage = await staffCtx.newPage();
          await onboardStaff(staffPage, sink);
          await shot.go(staffPage);
          await staffPage.waitForLoadState('networkidle');
          // The console's panels each resolve their own query; 800 ms was enough when it was one
          // card and is not now there are eight. This waits for the last one rather than guessing.
          await staffPage.waitForTimeout(2500);
          // A staff-gated route renders nothing recognisable to a non-staff caller, and
          // photographing that would be a picture of the guard. Fail rather than file it — and
          // name WHICH precondition failed, because "no heading" covers four different causes.
          const heading = await staffPage
            .getByRole('heading', { level: 1 })
            .first()
            .textContent()
            .catch(() => null);
          if (heading === null || !/staff console/i.test(heading))
            throw new Error(
              `staff console not reached (heading: ${heading ?? 'none'}). Either ` +
                `STAFF_EMAILS does not contain ${process.env.SHOOT_STAFF_EMAIL ?? 'ops@schedulepoint.test'}, ` +
                `or the address is not verified, or the API is not the one this harness targets.`,
            );
          // **The non-vacuity control, checked BEFORE the picture is filed** (spec §4.7). A
          // hierarchy assertion over an empty set passes and proves nothing — the shape ADR-0093,
          // ADR-0108, ADR-0121 and ADR-0131 each recorded a gate failing on. So a shot that
          // declares conditions must actually find at least two DISTINCT ones, and it names which
          // it found rather than printing a bare count: "2 of 4" does not tell you whether the
          // recipe was applied or whether two unrelated things happened to be wrong.
          //
          // Verified red by running it against the healthy API, where it finds zero.
          if (shot.conditions) {
            const body = (await staffPage.locator('body').innerText()) ?? '';
            const missing = shot.conditions.filter((c) => !c.pattern.test(body)).map((c) => c.id);
            if (missing.length > 0)
              throw new Error(
                `${shot.name}: the non-vacuity control failed — the recipe was not applied. ` +
                  `Missing: ${missing.join(', ')}. This picture would be judged for hierarchy ` +
                  `against a console with nothing wrong on it. Boot the API on the spec §4.7 ` +
                  `recipe: MAIL_SMTP_URL unset, RETENTION_SWEEP_ENABLED=false.`,
              );
            const amb = (shot.ambient ?? []).filter((c) => c.pattern.test(body)).map((c) => c.id);
            console.log(
              `${width}  ${shot.name}  recipe applied (${shot.conditions.length}/` +
                `${shot.conditions.length})${amb.length > 0 ? `; ambient: ${amb.join(', ')}` : ''}`,
            );
          }
          await staffPage.screenshot({ path: join(dir, `${shot.name}.png`), fullPage: true });
        } finally {
          await staffCtx.close();
          await sink.stop();
        }
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
          // The organisation landing's own fixture, beside the canvas one and never inside it.
          // The control runs immediately: a shot of a page with nothing to say is worse than no
          // shot, because it still looks like a result.
          const landing = await seedLandingStates(page, slug);
          expireInvitation(landing.expiredInvite);
          assertLandingStates(landing);
          seeded = true;
        }
        if (shot.programme && !ids) ids = await seedProgramme(page, slug);
        // **`dense` rides the generic path rather than a branch of its own.** The first version of
        // this gave it a dedicated `if`, which navigated and ran `after` and then fell out of the
        // chain BEFORE the shared `page.screenshot` at the bottom — so the run printed the shot's
        // name and wrote no file. A green line about nothing, which is the exact failure the
        // "photographed a 404" guard below exists for, reproduced by a harness edit rather than by
        // a wrong route. One camera, one path.
        if (shot.dense && !denseIds) denseIds = await seedDense(page, slug);
        // **Intercepts arm BEFORE the navigation and disarm after the shot**, so a hung route cannot
        // leak into the next picture. `hang` never resolves — Playwright abandons it when the context
        // closes — which is the only way to hold a loading state still enough to photograph.
        if (shot.intercept) {
          await page.route(shot.intercept.url, async (route) => {
            if (shot.intercept.hang) return; // deliberately never fulfilled
            await route.fulfill({
              status: shot.intercept.fulfil,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'INTERNAL', message: 'Something went wrong.' },
              }),
            });
          });
        }
        await shot.go(page, slug, shot.dense ? denseIds : ids);
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
    } catch (error) {
      failures.push(`${width}/${shot.name}`);
      console.log(
        `${width}  ${shot.name}  FAILED — ${String(error?.message ?? error).slice(0, 200)}`,
      );
    }
  }
  await context.close();
}

await browser.close();
console.log(`\nwrote ${OUT}/`);
if (failures.length > 0) {
  console.log(
    `\n${failures.length} shot(s) FAILED and are missing from the set: ${failures.join(', ')}`,
  );
  process.exitCode = 1;
}
