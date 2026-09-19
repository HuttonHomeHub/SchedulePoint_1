/**
 * FC-9 — the detail-screen child counts (page composition D3 / M5-T2).
 *
 * The product owner's answer to "add child counts to Client and Project detail?" was **"Yes —
 * measure cost first"**, so this is a requirement rather than a courtesy. `falsification.md` FC-9
 * was committed in its own commit BEFORE this file existed (ADR-0128's ordering), so the bar cannot
 * have been tuned to the answer.
 *
 * **What it grades**
 *
 * - **(a) latency** — `GET …/clients/:id` and `GET …/projects/:id` p95 < 50 ms at every shape, and
 *   the counts' own added cost p95 ≤ 25 ms. Run-to-run spread is reported beside every delta: a
 *   delta smaller than the spread is INDETERMINATE, not a pass.
 * - **(b) plan shape** — every count node an `Index Only Scan` / `Index Scan` / `Bitmap Index Scan`;
 *   a `Seq Scan` on `projects`, `plans` or `activities` FAILS whatever the timing says. Plus the
 *   regression this epic's §4.11 correction is about: the clients LIST plan must keep
 *   `clients_organization_id_created_at_id_idx`.
 * - **(c) estimate** — `EXPLAIN`'s total cost under `jit_above_cost` (100,000) at every shape.
 *
 * (b) is load-bearing and (c) is why: ADR-0144 records a JIT cliff firing on a small tenant
 * **because a different tenant grew**, which no timing on one database can see.
 *
 * **How "added" is derived, and what it is NOT.** It is not an A/B of two builds. The counts are
 * the only new work on these routes and they are the last thing the service does, so the added cost
 * is measured directly: each count's SQL is run under `EXPLAIN (ANALYZE)` REPS times and the two
 * are **summed**, which is the conservative reading — they are issued concurrently, so the true
 * added wall-clock is somewhere between the max and the sum. Stated here rather than left for a
 * reader to assume, because a benchmark that quietly picks the flattering half of a range is worse
 * than one that reports both.
 *
 * **The harness DILUTES, and that is not optional.** `database-architect`'s first probe reported
 * every count as a `Seq Scan` — an artefact of seeding one fat subject into a near-empty database,
 * where the subject is 98–99.98% of every table and a sequential scan is genuinely the right plan.
 * `client.repository.ts` records the same correction from the other direction: Postgres seq-scans
 * while the tenant is a majority share and switches below roughly 25–33%. So every shape is seeded
 * **beside** a dilutant population large enough to put the subject in the minority, and the harness
 * REFUSES to judge if it is not (see `assertDiluted`).
 *
 * **Where it bypasses the product** (ADR-0081). Organisations, clients and the FIRST project of
 * each shape are created through the public REST API; the remaining projects, and all plans and
 * activities, are bulk-inserted in SQL. Those rows are not proof that a write path works and
 * nothing here claims they are — they exist to give the planner a table to plan against.
 *
 * The first version created every project over REST and **died at the `fatClient` shape with a
 * 429**, 500 paced creates being ~5.5 minutes of throttle-limited seeding for one shape. Pacing the
 * seed would have made the harness take longer than anybody would re-run it for, which is the
 * failure `docs/TECH_DEBT.md` #75 records: a measurement nobody takes twice.
 *
 * Run with both dev servers up (`scripts/e2e-local.sh --db-only` then `pnpm dev`):
 *   PLAYWRIGHT_CHROMIUM_PATH=… node scripts/measure-detail-counts.mjs > /tmp/fc9.md
 */
import { chromium } from '@playwright/test';

import { psql } from './local-psql.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';
const REPS = Number(process.env.REPS ?? '30');
const WARMUP = 5;
/** Two sittings of the same shape, so the run-to-run spread is measured rather than assumed. */
const SITTINGS = Number(process.env.SITTINGS ?? '2');

/**
 * The route is behind the global throttler (`RATE_LIMIT_LIMIT` per `RATE_LIMIT_TTL` per IP). The
 * landing benchmark's first run fired its samples back-to-back and the third shape came back 429,
 * having measured two shapes and refused the one the epic most needed. Paced, never retried: a
 * retried 429 reports the latency of a request that was refused once and accepted later, which is
 * not a latency anybody experiences.
 */
const RATE_LIMIT = Number(process.env.RATE_LIMIT_LIMIT ?? '100');
const RATE_TTL_MS = Number(process.env.RATE_LIMIT_TTL ?? '60') * 1000;
const MIN_INTERVAL_MS = Math.ceil((RATE_TTL_MS / RATE_LIMIT) * 1.1);

const tag = String(Date.now());
const out = [];
const p = (s = '') => out.push(s);

/**
 * FC-9's four shapes.
 *
 * `deployed` is the real installation as found, and is the only one that is not invented.
 * `fatClient` exists for one reason: `Client.planCount` has no stable plan, switching from a nested
 * loop to a hash join with a `Seq Scan on plans` somewhere between 75 and 100 projects under one
 * client at a 76,817-plan estate. It is a ratio, so it moves; this shape is how we find where it
 * sits today rather than quoting the architect's number forward.
 */
const SHAPES = [
  {
    key: 'deployed',
    label: 'deployed installation',
    projects: 4,
    plansPerProject: 4,
    activitiesPerPlan: 8,
  },
  {
    key: 'typical',
    label: 'typical (ADR-0098)',
    projects: 1,
    plansPerProject: 16,
    activitiesPerPlan: 180,
  },
  {
    key: 'fatClient',
    label: 'fat client',
    projects: 500,
    plansPerProject: 12,
    activitiesPerPlan: 0,
  },
  {
    key: 'fatProject',
    label: 'fat project',
    projects: 1,
    plansPerProject: 60,
    activitiesPerPlan: 2000,
  },
];

/** The four counts, as the repositories issue them — one SQL each, so (b) grades what ships. */
const COUNT_SQL = {
  'client.projectCount': (ids) =>
    `SELECT count(*) FROM projects WHERE client_id = '${ids.clientId}'::uuid AND deleted_at IS NULL`,
  'client.planCount': (ids) =>
    `SELECT count(*) FROM plans pl JOIN projects pr ON pr.id = pl.project_id
       WHERE pl.deleted_at IS NULL AND pr.client_id = '${ids.clientId}'::uuid AND pr.deleted_at IS NULL`,
  'project.planCount': (ids) =>
    `SELECT count(*) FROM plans WHERE project_id = '${ids.projectId}'::uuid AND deleted_at IS NULL`,
  'project.activityCount': (ids) =>
    `SELECT count(*) FROM activities a JOIN plans pl ON pl.id = a.plan_id
       WHERE a.deleted_at IS NULL AND pl.project_id = '${ids.projectId}'::uuid AND pl.deleted_at IS NULL`,
};

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

function explain(sql) {
  const estimated = JSON.parse(psql(`EXPLAIN (FORMAT JSON) ${sql}`))[0].Plan['Total Cost'];
  const analyzed = psql(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  const ms = Number(/Execution Time: ([\d.]+) ms/.exec(analyzed)?.[1] ?? 'NaN');
  const seqScans = [...analyzed.matchAll(/Seq Scan on (\w+)/g)].map((m) => m[1]);
  const indexNodes = [
    ...analyzed.matchAll(/(Index Only Scan|Index Scan|Bitmap Index Scan) using (\w+)/g),
  ].map((m) => `${m[1]} (${m[2]})`);
  return { estimated, ms, analyzed, seqScans, indexNodes, jit: /^\s*JIT:/m.test(analyzed) };
}

/**
 * Bulk-insert one shape's plans and activities under an already-created project set.
 * `generate_series` in one statement per table, so the cost is the database's and not the round
 * trips'.
 */
function seedProjects(orgId, clientId, shape, userId) {
  if (shape.projects <= 1) return;
  psql(`
    INSERT INTO projects (id, organization_id, client_id, name, updated_at, created_at, created_by, updated_by)
    SELECT gen_random_uuid(), '${orgId}'::uuid, '${clientId}'::uuid,
           'Bench project ${shape.key} ' || g, now(), now(), '${userId}', '${userId}'
      FROM generate_series(2, ${String(shape.projects)}) g;
  `);
}

function seedPlansAndActivities(orgId, clientId, shape, userId) {
  psql(`
    INSERT INTO plans (id, organization_id, project_id, name, planned_start, updated_at, created_at, created_by, updated_by, status)
    SELECT gen_random_uuid(), '${orgId}'::uuid, pr.id,
           'Bench plan ' || pr.id || ' ' || g, DATE '2026-01-05',
           now(), now(), '${userId}', '${userId}', 'DRAFT'::"PlanStatus"
      FROM projects pr
      CROSS JOIN generate_series(1, ${String(shape.plansPerProject)}) g
     WHERE pr.client_id = '${clientId}'::uuid;
  `);
  if (shape.activitiesPerPlan > 0) {
    psql(`
      INSERT INTO activities (id, organization_id, plan_id, name, updated_at, created_at, created_by, updated_by)
      SELECT gen_random_uuid(), '${orgId}'::uuid, pl.id, 'Activity ' || a, now(), now(), '${userId}', '${userId}'
        FROM plans pl
        JOIN projects pr ON pr.id = pl.project_id
        CROSS JOIN generate_series(1, ${String(shape.activitiesPerPlan)}) a
       WHERE pr.client_id = '${clientId}'::uuid;
    `);
  }
  psql('ANALYZE projects; ANALYZE plans; ANALYZE activities;');
}

/**
 * **Refuse to judge an undiluted estate.** A subject holding a majority share of its table makes a
 * sequential scan the right plan, so limb (b) would report a failure that is the harness's fault —
 * or, seeded the other way round, a pass that says nothing. The threshold is the one
 * `client.repository.ts` records Postgres switching at (roughly 25–33%), taken at its loose end.
 */
function assertDiluted(label, subjectRows, tableRows) {
  const share = tableRows === 0 ? 1 : subjectRows / tableRows;
  if (share > 0.33) {
    throw new Error(
      `${label}: the subject is ${(share * 100).toFixed(1)}% of its table (${String(subjectRows)} of ${String(tableRows)}). ` +
        'A sequential scan is the correct plan at that share, so limb (b) would grade the harness rather than the code. Seed more dilutant.',
    );
  }
  return share;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/sign-up`);
await page.getByLabel('Full name').fill('Ada Lovelace');
await page.getByLabel('Email').fill(`fc9-${tag}@example.com`);
await page.getByLabel('Password').fill('correct-horse-battery');
await page.getByRole('button', { name: /create an account/i }).click();
await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
await page.getByLabel('Organisation name').fill(`FC9 ${tag}`);
await page.getByRole('button', { name: /create organisation/i }).click();
await page.waitForURL(/\/orgs\/[^/]+$/);
const slug = new URL(page.url()).pathname.split('/')[2];

/**
 * One organisation, one client per shape, and the projects created through the public API.
 *
 * ONE organisation deliberately: the shapes then dilute one another, which is the property
 * `assertDiluted` needs and which separate organisations would destroy — each subject would be
 * ~100% of its own tenant and, more importantly, of the tables, since these are the only rows in a
 * local database.
 */
const subjects = await page.evaluate(
  async ({ shapes, slug }) => {
    const call = async (method, path, body) => {
      const r = await fetch(`/api/v1${path}`, {
        method,
        credentials: 'include',
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
      return r.status === 204 ? null : (await r.json()).data;
    };
    const made = [];
    for (const shape of shapes) {
      const client = await call('POST', `/organizations/${slug}/clients`, {
        name: `Client ${shape.key}`,
      });
      // ONE project over REST per shape — enough to prove the write path is reachable; the rest are
      // bulk-inserted (see the docblock). The FIRST project is the `project*` subject below.
      const project = await call('POST', `/organizations/${slug}/clients/${client.id}/projects`, {
        name: `Project ${shape.key} 0`,
      });
      made.push({ key: shape.key, clientId: client.id, projectIds: [project.id] });
    }
    return made;
  },
  { shapes: SHAPES, slug },
);

const userId = psql(`SELECT id FROM users WHERE email = 'fc9-${tag}@example.com' LIMIT 1`).trim();
if (userId === '')
  throw new Error('Could not resolve the benchmark user id — nothing would be attributable.');
const orgId = psql(`SELECT id FROM organizations WHERE slug = '${slug}' LIMIT 1`).trim();

for (const shape of SHAPES) {
  const subject = subjects.find((s) => s.key === shape.key);
  process.stderr.write(`seeding ${shape.key}…\n`);
  seedProjects(orgId, subject.clientId, shape, userId);
  seedPlansAndActivities(orgId, subject.clientId, shape, userId);
}

/**
 * **Seed a dilutant population until no subject is a majority of its table.**
 *
 * This is not padding; it is the condition under which limb (b) means anything.
 * `database-architect`'s first probe reported every count as a `Seq Scan` and nearly became a
 * finding — an artefact of seeding one fat subject into a near-empty database, where the subject is
 * 98–99.98% of every table and a sequential scan is genuinely the right plan.
 * `client.repository.ts` records the same correction from the other side: Postgres seq-scans while
 * the tenant is a majority share and switches to the index plan below roughly 25–33%.
 *
 * The size is **derived from the measured subjects**, never a constant: whatever the largest
 * subject in each table turns out to be, the table is grown until that subject is under
 * `TARGET_SHARE`. A hard-coded figure would go stale the first time a shape changed, and the guard
 * would fire with no explanation of how much more was needed.
 *
 * The first run of this harness died here rather than reporting a number — which is the harness
 * working. `assertDiluted` refuses a verdict it cannot support, the way ADR-0128's judge throws
 * rather than grading when it has nothing to grade.
 */
const TARGET_SHARE = 0.25;
/**
 * How many clients one organisation should hold before the LIST plan is worth grading. ADR-0053's
 * stated ceiling is 5,000 per organisation and `client.repository.ts` measured the search across a
 * sweep up to it; 2,000 is the figure that repository's own escalation trigger names, so the list
 * is graded at the size somebody already decided was the interesting one.
 */
const ORG_CLIENT_TARGET = 2000;

function seedDilutant(orgId, userId, subjects) {
  // Inserted then SELECTed rather than `RETURNING id`: `psql` prints the command tag after the
  // row, so the returned value was `<uuid>\nINSERT 0 1` and every statement below it failed on
  // "invalid input syntax for type uuid". Two statements are cheaper than a parser.
  psql(
    `INSERT INTO clients (id, organization_id, name, updated_at, created_at, created_by, updated_by)
     VALUES (gen_random_uuid(), '${orgId}'::uuid, 'Dilutant', now(), now(), '${userId}', '${userId}')`,
  );
  const dilutantClient = psql(
    `SELECT id FROM clients WHERE organization_id = '${orgId}'::uuid AND name = 'Dilutant' LIMIT 1`,
  ).trim();

  /**
   * **`clients` is diluted too, and its absence was a real instrument fault.** The first judged run
   * reported limb (b)'s list assertion as FAILING — `Seq Scan on clients` — over a table holding
   * SIX rows, where a sequential scan is obviously the right plan. That is the same fault the
   * dilution guard exists for, one table over, and it would have been reported as a product
   * regression. The guard now covers every table an assertion reads.
   *
   * The subject here is not a client but the organisation's whole page, so the target is a table
   * large enough that one organisation's clients are a minority of it.
   */
  const dilutantClients = Math.max(0, Math.ceil(ORG_CLIENT_TARGET / TARGET_SHARE));
  psql(`
    INSERT INTO clients (id, organization_id, name, updated_at, created_at, created_by, updated_by)
    SELECT gen_random_uuid(), '${orgId}'::uuid, 'Dilutant client ' || g, now(), now(), '${userId}', '${userId}'
      FROM generate_series(1, ${String(dilutantClients)}) g;
  `);

  const biggest = {
    projects: Math.max(...subjects.map((s) => s.counts.projects)),
    plans: Math.max(...subjects.map((s) => s.counts.plans)),
    activities: Math.max(...subjects.map((s) => s.counts.activities)),
  };
  const total = {
    projects: Number(psql('SELECT count(*) FROM projects')),
    plans: Number(psql('SELECT count(*) FROM plans')),
    activities: Number(psql('SELECT count(*) FROM activities')),
  };
  const need = (table) => Math.max(0, Math.ceil(biggest[table] / TARGET_SHARE) - total[table]);

  const projectsNeeded = need('projects');
  process.stderr.write(
    `diluting: +${String(projectsNeeded)} projects, +${String(need('plans'))} plans, +${String(need('activities'))} activities\n`,
  );

  if (projectsNeeded > 0) {
    psql(`
      INSERT INTO projects (id, organization_id, client_id, name, updated_at, created_at, created_by, updated_by)
      SELECT gen_random_uuid(), '${orgId}'::uuid, '${dilutantClient}'::uuid,
             'Dilutant project ' || g, now(), now(), '${userId}', '${userId}'
        FROM generate_series(1, ${String(projectsNeeded)}) g;
    `);
  }

  /**
   * The dilutant plans and activities are spread over the dilutant projects, so the dilution is in
   * the TABLE and not in one other subject — a single fat sibling would leave the planner facing
   * the same skew from the other direction.
   */
  const plansNeeded = need('plans');
  if (plansNeeded > 0) {
    const perProject = Math.max(1, Math.ceil(plansNeeded / Math.max(1, projectsNeeded)));
    psql(`
      INSERT INTO plans (id, organization_id, project_id, name, planned_start, updated_at, created_at, created_by, updated_by, status)
      SELECT gen_random_uuid(), '${orgId}'::uuid, pr.id, 'Dilutant plan ' || g, DATE '2026-01-05',
             now(), now(), '${userId}', '${userId}', 'DRAFT'::"PlanStatus"
        FROM projects pr
        CROSS JOIN generate_series(1, ${String(perProject)}) g
       WHERE pr.client_id = '${dilutantClient}'::uuid;
    `);
  }

  const activitiesNeeded = need('activities');
  if (activitiesNeeded > 0) {
    const nowPlans = Number(
      psql(
        `SELECT count(*) FROM plans pl JOIN projects pr ON pr.id = pl.project_id WHERE pr.client_id = '${dilutantClient}'::uuid`,
      ),
    );
    const perPlan = Math.max(1, Math.ceil(activitiesNeeded / Math.max(1, nowPlans)));
    psql(`
      INSERT INTO activities (id, organization_id, plan_id, name, updated_at, created_at, created_by, updated_by)
      SELECT gen_random_uuid(), '${orgId}'::uuid, pl.id, 'Dilutant activity ' || a, now(), now(), '${userId}', '${userId}'
        FROM plans pl
        JOIN projects pr ON pr.id = pl.project_id
        CROSS JOIN generate_series(1, ${String(perPlan)}) a
       WHERE pr.client_id = '${dilutantClient}'::uuid;
    `);
  }
  /**
   * **`VACUUM`, not just `ANALYZE`, and the difference decides a number.**
   *
   * An index-only scan is only index-only to the extent the visibility map says a page is
   * all-visible, and a freshly bulk-inserted table has no bits set — so every row costs a heap
   * fetch and the count measures the worst state the table is ever in. `database-architect` could
   * not establish the heap-fetch count at all (its probes ran inside an uncommitted transaction)
   * and said so rather than quoting the plan node as settled, leaving it for a harness that
   * commits and can vacuum. This is that harness.
   *
   * This is NOT softening the bar. A real installation's tables are vacuumed continuously by
   * autovacuum; measuring only the never-vacuumed state would grade a condition no deployed
   * database sits in for long. The un-vacuumed figures are reported beside the vacuumed ones so
   * both ends of the range are on the page (ADR-0144 §8 measured the decay in the other direction:
   * every recalculation dirties every activity row in a plan, so the map is not permanently set
   * either).
   */
  psql('ANALYZE clients; ANALYZE projects; ANALYZE plans; ANALYZE activities;');
}

seedDilutant(
  orgId,
  userId,
  SHAPES.map((shape) => {
    const subject = subjects.find((s) => s.key === shape.key);
    return {
      counts: {
        projects: Number(
          psql(`SELECT count(*) FROM projects WHERE client_id = '${subject.clientId}'::uuid`),
        ),
        plans: Number(
          psql(
            `SELECT count(*) FROM plans pl JOIN projects pr ON pr.id = pl.project_id WHERE pr.client_id = '${subject.clientId}'::uuid`,
          ),
        ),
        activities: Number(
          psql(
            `SELECT count(*) FROM activities a JOIN plans pl ON pl.id = a.plan_id WHERE pl.project_id = '${subject.projectIds[0]}'::uuid`,
          ),
        ),
      },
    };
  }),
);

/**
 * The count SQL, EXPLAINed REPS times, per shape. Run twice — before and after a `VACUUM` — so both
 * ends of the range are on the page rather than whichever one flatters the verdict. See
 * `seedDilutant`'s note for why the vacuumed figure is the one the bars are judged against.
 */
function measureCounts() {
  const rowsOut = [];
  for (const shape of SHAPES) {
    const subject = subjects.find((s) => s.key === shape.key);
    const ids = { clientId: subject.clientId, projectId: subject.projectIds[0] };
    for (const [name, sql] of Object.entries(COUNT_SQL)) {
      const samples = [];
      let last;
      for (let i = 0; i < REPS; i += 1) {
        last = explain(sql(ids));
        samples.push(last.ms);
      }
      samples.sort((a, b) => a - b);
      rowsOut.push({
        shape: shape.key,
        name,
        p95: quantile(samples, 0.95),
        estimated: last.estimated,
        nodes: last.indexNodes.join(', ') || '(none)',
        seqScans:
          last.seqScans.filter((t) => ['projects', 'plans', 'activities'].includes(t)).join(', ') ||
          '—',
        jit: last.jit,
      });
    }
  }
  return rowsOut;
}

process.stderr.write('measuring counts before VACUUM…\n');
const coldRows = measureCounts();
process.stderr.write('VACUUM (ANALYZE)…\n');
psql('VACUUM (ANALYZE) clients, projects, plans, activities;');

const cookies = await context.cookies();
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
let nextAllowedAt = 0;
async function timeRoute(url) {
  const wait = nextAllowedAt - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
  const t0 = performance.now();
  const r = await fetch(url, { headers: { cookie: cookieHeader } });
  const body = await r.json();
  if (r.status === 429) {
    throw new Error(
      `${url}: 429 despite pacing at ${String(MIN_INTERVAL_MS)} ms — refused, never retried.`,
    );
  }
  if (!r.ok) throw new Error(`${url}: ${String(r.status)} ${JSON.stringify(body)}`);
  return { ms: performance.now() - t0, data: body.data };
}

p('# FC-9 — the detail-screen child counts, measured');
p();
p(`- **Taken:** ${new Date().toISOString()}`);
p(
  `- **Reps:** ${String(REPS)} after ${String(WARMUP)} warm-up, × ${String(SITTINGS)} sittings per shape`,
);
p(
  `- **Paced:** one request per ${String(MIN_INTERVAL_MS)} ms (global ${String(RATE_LIMIT)}/${String(RATE_TTL_MS / 1000)} s throttle) — NOT back-to-back`,
);
p(
  `- **Bars:** route p95 < 50 ms; added p95 ≤ 25 ms; no \`Seq Scan\` on a child table; estimate < 100,000`,
);
p();

process.stderr.write('measuring counts after VACUUM…\n');
const warmRows = measureCounts();

const rows = [];
const planRows = [];
let anyFailure = false;

for (const shape of SHAPES) {
  const subject = subjects.find((s) => s.key === shape.key);
  const ids = { clientId: subject.clientId, projectId: subject.projectIds[0] };

  const counts = {
    projects: Number(
      psql(
        `SELECT count(*) FROM projects WHERE client_id = '${ids.clientId}'::uuid AND deleted_at IS NULL`,
      ),
    ),
    plans: Number(
      psql(
        `SELECT count(*) FROM plans pl JOIN projects pr ON pr.id = pl.project_id WHERE pr.client_id = '${ids.clientId}'::uuid`,
      ),
    ),
    activities: Number(
      psql(
        `SELECT count(*) FROM activities a JOIN plans pl ON pl.id = a.plan_id WHERE pl.project_id = '${ids.projectId}'::uuid`,
      ),
    ),
  };
  const totals = {
    projects: Number(psql('SELECT count(*) FROM projects')),
    plans: Number(psql('SELECT count(*) FROM plans')),
    activities: Number(psql('SELECT count(*) FROM activities')),
  };

  // Non-vacuity, checked BEFORE the timings. A benchmark over a subject whose rows failed to land
  // reports the fastest number the route can produce and says nothing about the case it exists for.
  if (counts.projects !== shape.projects) {
    throw new Error(
      `${shape.key}: seeded ${String(counts.projects)} projects, expected ${String(shape.projects)}.`,
    );
  }

  const shares = {
    projects: assertDiluted(`${shape.key} projects`, counts.projects, totals.projects),
    plans: assertDiluted(`${shape.key} plans`, counts.plans, totals.plans),
    ...(shape.activitiesPerPlan > 0
      ? {
          activities: assertDiluted(
            `${shape.key} activities`,
            counts.activities,
            totals.activities,
          ),
        }
      : {}),
  };

  // --- (b) and (c): the plan shape and the estimate, per count -----------------------------
  let addedMsTotal = 0;
  for (const row of warmRows.filter((r) => r.shape === shape.key)) {
    addedMsTotal += row.p95;
    if (row.seqScans !== '—' || row.estimated >= 100_000) anyFailure = true;
    const cold = coldRows.find((c) => c.shape === row.shape && c.name === row.name);
    planRows.push({ ...row, coldP95: cold?.p95 });
  }

  // --- (a): the routes, over SITTINGS so the spread is measured ----------------------------
  const routeP95 = { client: [], project: [] };
  for (let sitting = 0; sitting < SITTINGS; sitting += 1) {
    for (const [key, url] of [
      ['client', `${API}/api/v1/organizations/${slug}/clients/${ids.clientId}`],
      ['project', `${API}/api/v1/organizations/${slug}/projects/${ids.projectId}`],
    ]) {
      for (let i = 0; i < WARMUP; i += 1) await timeRoute(url);
      const samples = [];
      let data;
      for (let i = 0; i < REPS; i += 1) {
        const r = await timeRoute(url);
        samples.push(r.ms);
        data = r.data;
      }
      /*
        The counts must actually be in the body, or the route timings grade a response that does
        not carry the feature (ADR-0081's shape, in an instrument).

        **`client` expects ONE count, and this list said two until the M8 backend-performance
        review ran it.** `client.planCount` was withdrawn by FC-9 in the same commit that shipped
        this harness, and the expectation was not swept with it — so the first thing the harness
        did on a client route was throw, saying the response "carries no planCount" about a field
        the product deliberately does not send. Both `client.repository.ts`'s comment and
        `docs/TECH_DEBT.md` #342 name re-running this script as the FIRST step to reopening that
        decision, so the instrument prescribed for the re-verification could not start. An
        expectation left behind by the change it was meant to police, which is the register's own
        recurring shape one level out from the product.
      */
      const expected = key === 'client' ? ['projectCount'] : ['planCount', 'activityCount'];
      for (const field of expected) {
        if (typeof data[field] !== 'number') {
          throw new Error(
            `${shape.key}/${key}: the response carries no ${field} — these timings would grade the route WITHOUT the feature.`,
          );
        }
      }
      // The withdrawn count is pinned in the OTHER direction, so a reinstatement cannot be graded
      // by a run that quietly kept the old bar: if `planCount` comes back on a client, the harness
      // says so rather than measuring it under an expectation written for its absence.
      if (key === 'client' && data.planCount !== undefined) {
        throw new Error(
          `${shape.key}/client: the response carries planCount, which FC-9 withdrew (docs/TECH_DEBT.md #342). Re-arm the expectation above before grading it.`,
        );
      }
      samples.sort((a, b) => a - b);
      routeP95[key].push(quantile(samples, 0.95));
    }
  }

  const spreadOf = (xs) => Math.max(...xs) - Math.min(...xs);
  rows.push({
    shape,
    counts,
    totals,
    shares,
    clientP95: Math.max(...routeP95.client),
    clientSpread: spreadOf(routeP95.client),
    projectP95: Math.max(...routeP95.project),
    projectSpread: spreadOf(routeP95.project),
    addedMsTotal,
  });
  if (Math.max(...routeP95.client, ...routeP95.project) >= 50 || addedMsTotal > 25)
    anyFailure = true;
}

// --- (b), the regression limb: the LIST plan keeps its keyset index -------------------------
const listSql = `SELECT * FROM clients WHERE organization_id = '${orgId}'::uuid AND deleted_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 20`;
const listPlan = explain(listSql);
const listKeepsIndex = /clients_organization_id_created_at_id_idx/.test(listPlan.analyzed);

p('## (a) Route latency');
p();
p('| Shape | subject | client p95 | spread | project p95 | spread | added (sum of count p95) |');
p('| --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  p(
    `| \`${r.shape.key}\` | ${String(r.counts.projects)} proj / ${String(r.counts.plans)} plans / ${String(r.counts.activities)} act | ` +
      `${r.clientP95.toFixed(1)} ms | ${r.clientSpread.toFixed(1)} ms | ${r.projectP95.toFixed(1)} ms | ${r.projectSpread.toFixed(1)} ms | ${r.addedMsTotal.toFixed(2)} ms |`,
  );
}
p();
p(
  "**Dilution** — the subject's share of each table, which must stay under 33% or the harness refuses to judge:",
);
p();
p('| Shape | projects | plans | activities |');
p('| --- | --- | --- | --- |');
for (const r of rows) {
  const pct = (x) => (x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);
  p(
    `| \`${r.shape.key}\` | ${pct(r.shares.projects)} | ${pct(r.shares.plans)} | ${pct(r.shares.activities)} |`,
  );
}
p();
p(
  `Table totals at the end of the run: ${String(rows.at(-1).totals.projects)} projects, ${String(rows.at(-1).totals.plans)} plans, ${String(rows.at(-1).totals.activities)} activities.`,
);
p();

p('## (b) and (c) — plan shape and estimate, per count');
p();
p(
  '| Shape | Count | p95 (vacuumed) | p95 (cold) | estimate | index nodes | Seq Scan on a child table | JIT |',
);
p('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of planRows) {
  p(
    `| \`${r.shape}\` | \`${r.name}\` | ${r.p95.toFixed(2)} ms | ${r.coldP95 === undefined ? '—' : `${r.coldP95.toFixed(2)} ms`} | ${String(Math.round(r.estimated))} | ${r.nodes} | ${r.seqScans} | ${r.jit ? 'YES' : 'no'} |`,
  );
}
p();
p('**cold** = immediately after a bulk insert, before any `VACUUM`: every row pays a heap fetch');
p(
  'because the visibility map has no bits set. **vacuumed** is the state a deployed database sits in,',
);
p('and is what the bars are judged against. Both are printed because the true cost moves between');
p('them — every recalculation dirties every activity row in a plan (ADR-0144 §8).');
p();
p(
  `**The clients LIST plan keeps \`clients_organization_id_created_at_id_idx\`:** ${listKeepsIndex ? 'YES' : '**NO — FC-9(b) FAILS**'}`,
);
p();
p('```');
p(listPlan.analyzed.trim());
p('```');
p();

p('## Verdict');
p();
if (!listKeepsIndex) anyFailure = true;
p(
  anyFailure
    ? "**FAIL** — see the rows above. FC-9's withdrawal clause applies: the counts are withdrawn and the detail screens are enriched from fields already on the wire."
    : '**PASS** — every route p95 under 50 ms, every added cost under 25 ms, every count on an index node, every estimate under 100,000, and the list plan unchanged.',
);
p();
p('**What this does NOT establish.** One machine, one local PostgreSQL, one sitting pair. The');
p("`added` column is the SUM of the two counts' `EXPLAIN (ANALYZE)` execution times, which is the");
p('conservative end of a range — they are issued concurrently, so the true added wall-clock is');
p("between the max and the sum. And `project.activityCount`'s cost is partly a function of how");
p('recently the project was recalculated: the plan is an index-only scan, so it depends on the');
p('visibility map, and every recalculation rewrites every activity row in a plan (ADR-0144 §8');
p('measured 300 dirtied plans costing 130,380 heap fetches). This harness never recalculates.');

console.log(out.join('\n'));
await browser.close();
