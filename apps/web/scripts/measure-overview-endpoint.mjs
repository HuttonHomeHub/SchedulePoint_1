/**
 * M0-T4 of the organisation landing: FC-2 (the endpoint's p50/p95) and FC-3 (no JIT cliff).
 *
 * `GET …/overview` has NEVER been measured. ADR-0098's index migration measured the
 * recently-changed QUERY exhaustively and closes with "**The endpoint was not measured, only this
 * query.**" — so there is no baseline for the thing a reader actually waits for, and this epic
 * proposes to add work to it. This takes one.
 *
 * **What it seeds, and where it bypasses the product** (ADR-0081). The four organisation shapes are
 * ADR-0098's own, taken from
 * `prisma/migrations/20260818220000_overview_recently_changed_indexes/migration.sql:16-20` rather
 * than invented — a benchmark over shapes somebody chose to be convenient says nothing. Clients,
 * projects and the organisations themselves are created through the public REST API; **the plans,
 * activities and dependencies are bulk-inserted in SQL**, because 3,000 plans × 40 activities is
 * ~123,000 REST writes and a harness that takes three hours is a harness nobody re-runs. Those rows
 * are therefore NOT proof that a write path works — nothing here claims they are. They exist to give
 * the planner a table to plan against, which is what FC-2 and FC-3 are about.
 *
 * **FC-3 is an ESTIMATE condition and that is deliberate.** The migration's own finding is that JIT
 * began firing on a small tenant *because a different tenant grew* — a per-execution cost of ~195 ms
 * that is never cached. A timing on one database structurally cannot see that, so the condition is
 * on `EXPLAIN`'s estimated total cost against `jit_above_cost` (100,000) and on the absence of a
 * `JIT:` node, both read from the REAL query text (extracted from `overview.repository.ts`, never
 * paraphrased — a paraphrase measures the paraphrase).
 *
 * Run with both dev servers up:
 *   PLAYWRIGHT_CHROMIUM_PATH=… node scripts/measure-overview-endpoint.mjs > /tmp/m0-endpoint.md
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';
const REPS = Number(process.env.REPS ?? '30');
const WARMUP = 5;
/**
 * The benchmark PACES itself, and that is a finding rather than a workaround.
 *
 * `/api/v1/*` sits behind the global throttler — `RATE_LIMIT_LIMIT=100` per `RATE_LIMIT_TTL=60`
 * seconds per IP (`app.module.ts:99-104`, `.env:28-29`). The first run of this harness fired
 * (30 + 5) × 4 = 140 requests as fast as they would go and the THIRD shape came back `429
 * RATE_LIMITED`, having measured two shapes and refused the one the epic most needs.
 *
 * It is not retried. A benchmark that silently retries a 429 reports the latency of a request that
 * was refused once and accepted later, which is not a latency anybody experiences. It is paced
 * instead, at an interval derived from the configured limit with 10% of headroom, and the interval
 * is printed in the report so a reader can see the number was not taken back-to-back.
 */
const RATE_LIMIT = Number(process.env.RATE_LIMIT_LIMIT ?? '100');
const RATE_TTL_MS = Number(process.env.RATE_LIMIT_TTL ?? '60') * 1000;
const MIN_INTERVAL_MS = Math.ceil((RATE_TTL_MS / RATE_LIMIT) * 1.1);
const tag = String(Date.now());
const out = [];
const p = (s = '') => out.push(s);

/** ADR-0098's four shapes, verbatim from the index migration's own measurement table. */
const SHAPES = [
  { key: 'typical', label: 'typical installation', plans: 16, activities: 180 },
  { key: 'scale', label: 'scale tier (ADR-0066)', plans: 10, activities: 2000 },
  { key: 'breadth', label: 'breadth', plans: 459, activities: 40 },
  { key: 'xl', label: 'extra-large', plans: 3000, activities: 40 },
];

function psqlUrl() {
  const url = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/app?schema=public';
  return url.replace(/[?&]schema=[^&]*/, '');
}
const psql = (sql) =>
  execFileSync('psql', [psqlUrl(), '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

/**
 * **The queries are EXTRACTED from `overview.repository.ts`, not copied into this file.**
 *
 * This was a hand-copy with a docblock saying "if that file changes, this must be re-copied, and
 * the harness says so in its output rather than relying on somebody remembering". It did not say
 * so, and nobody remembered: M2 added `p.schedule_computed_at` to the real query and the copy here
 * was never updated, so **FC-3 was grading a query the endpoint no longer ran** — silently, with a
 * green verdict, in the harness whose whole premise is that a paraphrase measures the paraphrase.
 * Found by opening the file rather than by anything failing.
 *
 * So the drift class is removed instead of being warned about (ADR-0058: replace vigilance with
 * something computed). The extractor reads the tagged template out of the named method and
 * substitutes the Prisma binds with literals; it THROWS rather than returning something plausible
 * if it cannot find the method or the template, because a harness that silently measures nothing is
 * the failure mode this repository keeps recording.
 */
const REPO_SOURCE = readFileSync(
  new URL('../../api/src/modules/overview/overview.repository.ts', import.meta.url),
  'utf8',
);

/**
 * The `$queryRaw` tagged template inside one method, as written. `${...}` placeholders are left in
 * place for the caller to substitute — none of them contains a backtick, so finding the closing
 * backtick is unambiguous, and the assertions below are what prove that held.
 */
function extractSql(methodName) {
  const at = REPO_SOURCE.indexOf(`async ${methodName}(`);
  if (at === -1) throw new Error(`FC-3 cannot find ${methodName} — it was renamed or removed`);
  const rawAt = REPO_SOURCE.indexOf('$queryRaw', at);
  if (rawAt === -1) throw new Error(`FC-3 found ${methodName} but no $queryRaw in it`);
  const open = REPO_SOURCE.indexOf('`', rawAt);
  const close = REPO_SOURCE.indexOf('`', open + 1);
  if (open === -1 || close === -1) throw new Error(`FC-3 could not bound ${methodName}'s template`);
  const sql = REPO_SOURCE.slice(open + 1, close);
  // Non-vacuity: a one-line result means the bounding went wrong and every EXPLAIN below would
  // grade a fragment. Cheaper to fail here than to publish a number nobody can trust.
  if (sql.split('\n').length < 10 || !/SELECT/i.test(sql)) {
    throw new Error(`FC-3 extracted something too small to be ${methodName}'s query`);
  }
  return sql;
}

/** The recently-changed query, extracted, with its two binds replaced by literals. */
const recentlyChangedSql = (orgId, take) =>
  extractSql('findRecentlyChanged')
    // QUOTED, because Prisma binds the parameter and the source therefore reads
    // `${organizationId}::uuid` with no quotes of its own. The hand-copy this replaced had baked
    // them in, which is precisely the kind of detail a copy silently owns and an extractor must
    // restate — the first run failed on `trailing junk after numeric literal`.
    .replace('${organizationId}', `'${orgId}'`)
    .replace('${take}', String(take));

/**
 * The M3 standing query, extracted the same way. `planIds` is a Prisma array bind, which becomes a
 * literal `uuid[]` here; the ids are the ones the endpoint would pass — the recently-changed page.
 */
const planStandingSql = (orgId, planIds) =>
  extractSql('findPlanStanding')
    .replace('${organizationId}', `'${orgId}'`)
    .replace('${[...planIds]}', `ARRAY[${planIds.map((id) => `'${id}'`).join(',')}]`);

/**
 * Bulk-inserts one shape. Everything is generated in ONE statement per table so the cost is the
 * database's rather than the round trips'; `updated_at` is spread over the preceding hours so
 * `ORDER BY changed_at DESC` has something to order and the LIMIT is not satisfied by the first
 * page it reads.
 */
function seedShape(orgId, projectId, userId, shape) {
  psql(`
    INSERT INTO plans (id, organization_id, project_id, name, planned_start, updated_at, created_at, created_by, updated_by, status)
    SELECT gen_random_uuid(), '${orgId}'::uuid, '${projectId}'::uuid,
           'Bench plan ' || g, DATE '2026-01-05',
           now() - (g || ' minutes')::interval, now(), '${userId}', '${userId}', 'DRAFT'::"PlanStatus"
      FROM generate_series(1, ${String(shape.plans)}) g;

    INSERT INTO activities (id, organization_id, plan_id, name, updated_at, created_at, created_by, updated_by)
    SELECT gen_random_uuid(), '${orgId}'::uuid, p.id,
           'Activity ' || a, now() - (a || ' seconds')::interval, now(), '${userId}', '${userId}'
      FROM plans p
      CROSS JOIN generate_series(1, ${String(shape.activities)}) a
     WHERE p.organization_id = '${orgId}'::uuid;

    ANALYZE plans;
    ANALYZE activities;
  `);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/sign-up`);
await page.getByLabel('Full name').fill('Ada Lovelace');
await page.getByLabel('Email').fill(`m0-bench-${tag}@example.com`);
await page.getByLabel('Password').fill('correct-horse-battery');
await page.getByRole('button', { name: /create an account/i }).click();
await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
await page.getByLabel('Organisation name').fill(`Bench typical ${tag}`);
await page.getByRole('button', { name: /create organisation/i }).click();
await page.waitForURL(/\/orgs\/[^/]+$/);
const firstSlug = new URL(page.url()).pathname.split('/')[2];

// One organisation per shape, each created through the public API, each with its own client and
// project — so the shapes cannot contaminate one another's plan counts.
const orgs = await page.evaluate(
  async ({ shapes, firstSlug, tag }) => {
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
    for (const [i, shape] of shapes.entries()) {
      const slug =
        i === 0
          ? firstSlug
          : (await call('POST', '/organizations', { name: `Bench ${shape.key} ${tag}` })).slug;
      const client = await call('POST', `/organizations/${slug}/clients`, { name: 'Bench Client' });
      const project = await call('POST', `/organizations/${slug}/clients/${client.id}/projects`, {
        name: 'Bench Project',
      });
      made.push({ key: shape.key, slug, projectId: project.id });
    }
    return made;
  },
  { shapes: SHAPES, firstSlug, tag },
);

const userId = psql(
  `SELECT id FROM users WHERE email = 'm0-bench-${tag}@example.com' LIMIT 1`,
).trim();
if (userId === '')
  throw new Error('Could not resolve the benchmark user id — nothing below would be attributable.');

p('# M0-T4 — `GET …/overview`, measured for the first time');
p();
p(`- **Taken:** ${new Date().toISOString()}`);
p(`- **Reps:** ${String(REPS)} after ${String(WARMUP)} warm-up, per shape`);
p(
  `- **Paced:** one request per ${String(MIN_INTERVAL_MS)} ms — the endpoint is behind the global ${String(RATE_LIMIT)}/${String(RATE_TTL_MS / 1000)} s throttle, so these are NOT back-to-back`,
);
p(`- **Shapes:** ADR-0098's own, from the index migration's measurement table`);
p(
  `- **Seeding:** organisations/clients/projects via the REST API; plans and activities bulk-inserted in SQL (see the docblock)`,
);
p();

const results = [];
for (const shape of SHAPES) {
  const org = orgs.find((o) => o.key === shape.key);
  const orgId = psql(`SELECT id FROM organizations WHERE slug = '${org.slug}' LIMIT 1`).trim();
  process.stderr.write(
    `seeding ${shape.key} (${String(shape.plans)} × ${String(shape.activities)})…\n`,
  );
  seedShape(orgId, org.projectId, userId, shape);

  // Non-vacuity, checked BEFORE the timings: a benchmark over an organisation whose rows failed to
  // land reports the fastest number the endpoint can produce and says nothing about the case it
  // exists for (ADR-0143 FC-0's lesson, and ADR-0128's `throw rather than judge`).
  const planCount = Number(
    psql(
      `SELECT count(*) FROM plans WHERE organization_id = '${orgId}'::uuid AND deleted_at IS NULL`,
    ),
  );
  const actCount = Number(
    psql(
      `SELECT count(*) FROM activities WHERE organization_id = '${orgId}'::uuid AND deleted_at IS NULL`,
    ),
  );
  if (planCount < shape.plans || actCount < shape.plans * shape.activities) {
    throw new Error(
      `${shape.key}: seeded ${String(planCount)} plans / ${String(actCount)} activities, expected ${String(shape.plans)} / ${String(shape.plans * shape.activities)}. Timing this would measure an empty organisation.`,
    );
  }

  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const url = `${API}/api/v1/organizations/${org.slug}/overview`;
  let nextAllowedAt = 0;
  const timeOne = async () => {
    const wait = nextAllowedAt - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
    const t0 = performance.now();
    const r = await fetch(url, { headers: { cookie: cookieHeader } });
    const body = await r.json();
    if (r.status === 429) {
      throw new Error(
        `${url}: 429 RATE_LIMITED despite pacing at ${String(MIN_INTERVAL_MS)} ms. The sample is refused rather than retried — a retried 429 measures a latency nobody experiences.`,
      );
    }
    if (!r.ok) throw new Error(`${url}: ${String(r.status)} ${JSON.stringify(body)}`);
    return { ms: performance.now() - t0, rows: body.data.recentlyChanged.length };
  };

  let rows = 0;
  for (let i = 0; i < WARMUP; i += 1) rows = (await timeOne()).rows;
  if (rows === 0) {
    throw new Error(
      `${shape.key}: the endpoint returned 0 recently-changed rows over ${String(planCount)} plans — the timings would be of an empty answer.`,
    );
  }
  const samples = [];
  for (let i = 0; i < REPS; i += 1) samples.push((await timeOne()).ms);
  samples.sort((a, b) => a - b);
  const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];

  // FC-3: the ESTIMATE, not the timing. `EXPLAIN` without ANALYZE never executes, so it cannot be
  // contaminated by a warm cache.
  const plan = psql(`EXPLAIN (FORMAT JSON) ${recentlyChangedSql(orgId, 8)}`);
  const estimated = JSON.parse(plan)[0].Plan['Total Cost'];
  const analyzed = psql(`EXPLAIN (ANALYZE, BUFFERS) ${recentlyChangedSql(orgId, 8)}`);
  const jit = /^\s*JIT:/m.test(analyzed);

  /**
   * **M3's standing query, graded at the same four shapes.** The milestone's own risk note says R2
   * "is bounded by ≤ 13 plans and is expected to be cheap — **expected is not measured**", and that
   * if JIT fires at any shape the milestone stops and M4's `database-architect` engagement is
   * brought forward. So it is EXPLAINed here rather than argued about.
   *
   * The ids are the page the endpoint would actually pass: the same eight the recently-changed
   * query returns, taken FROM that query rather than invented, so the aggregate is graded over the
   * plans it will really be handed.
   */
  const standingIds = psql(
    `SELECT string_agg(plan_id::text, ',') FROM (${recentlyChangedSql(orgId, 8)}) q`,
  )
    .trim()
    .split(',')
    .filter(Boolean);
  if (standingIds.length === 0) {
    throw new Error(
      `${shape.key}: no plan ids for the standing query — it would grade an empty IN`,
    );
  }
  const standingPlan = psql(`EXPLAIN (FORMAT JSON) ${planStandingSql(orgId, standingIds)}`);
  const standingEstimated = JSON.parse(standingPlan)[0].Plan['Total Cost'];
  const standingAnalyzed = psql(
    `EXPLAIN (ANALYZE, BUFFERS) ${planStandingSql(orgId, standingIds)}`,
  );
  const standingJit = /^\s*JIT:/m.test(standingAnalyzed);

  results.push({
    shape,
    planCount,
    actCount,
    rows,
    p50: at(0.5),
    p95: at(0.95),
    min: samples[0],
    max: samples[samples.length - 1],
    estimated,
    jit,
    analyzed,
    standingIds: standingIds.length,
    standingEstimated,
    standingJit,
    standingAnalyzed,
  });
}

p('## FC-2 — endpoint latency (bar: p95 < 200 ms)');
p();
p('| Shape | Plans | Activities | Rows returned | p50 | **p95** | min–max | Verdict |');
p('| ----- | ----: | ---------: | ------------: | --: | ------: | ------- | ------- |');
for (const r of results) {
  const verdict = r.p95 < 200 ? '**PASS**' : '**FAIL**';
  p(
    `| ${r.shape.label} | ${String(r.planCount)} | ${String(r.actCount)} | ${String(r.rows)} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.min.toFixed(1)}–${r.max.toFixed(1)} | ${verdict} |`,
  );
}
p();
p(
  'The min–max column is the run-to-run spread. A later delta smaller than it is **INDETERMINATE**, not a pass (ADR-0128).',
);
p();

p('## FC-3 — no JIT cliff (bar: no `JIT:` node, estimated total cost < 100,000)');
p();
p('| Shape | Estimated total cost | `jit_above_cost` | `JIT:` node? | Verdict |');
p('| ----- | -------------------: | ---------------: | ------------ | ------- |');
for (const r of results) {
  const ok = !r.jit && r.estimated < 100000;
  p(
    `| ${r.shape.label} | ${String(Math.round(r.estimated))} | 100000 | ${r.jit ? '**yes**' : 'no'} | ${ok ? '**PASS**' : '**FAIL**'} |`,
  );
}
p();
p('## FC-3 (M3) — the standing query, same bar');
p();
p('| Shape | Plans graded | Estimated total cost | `JIT:` node? | Verdict |');
p('| ----- | -----------: | -------------------: | ------------ | ------- |');
for (const r of results) {
  const ok = !r.standingJit && r.standingEstimated < 100000;
  p(
    `| ${r.shape.label} | ${String(r.standingIds)} | ${String(Math.round(r.standingEstimated))} | ${r.standingJit ? '**yes**' : 'no'} | ${ok ? '**PASS**' : '**FAIL**'} |`,
  );
}
p();
p(
  'The standing read is bounded by the recently-changed page (≤ 8 plans), so its cost should be ' +
    'flat across shapes. A cost that tracks the shape means the aggregate is not using the ' +
    'plan-id filter, which is the failure the milestone stops on.',
);
p();

p('## `EXPLAIN (ANALYZE, BUFFERS)` per shape');
p();
for (const r of results) {
  p(`### ${r.shape.label}`);
  p();
  p('```');
  p(r.analyzed.trim());
  p('```');
  p();
}

console.log(out.join('\n'));
await browser.close();
