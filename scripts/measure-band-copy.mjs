#!/usr/bin/env node
/**
 * W5 **M2-T4** — what does duplicating a WBS band actually cost?
 *
 * `docs/specs/activity-copy-paste/` sets the set-size cap at a **provisional** 200 and defers the
 * real number to this measurement. Shipping the provisional figure would be the exact failure
 * ADR-0058 and ADR-0073 C1/C3.0 exist to prevent: a number asserted in a spec, copied into a
 * constant, and never checked against the thing it claims to bound.
 *
 * **What it measures, and why that shape.** A band duplicate is what the client composite issues:
 * N `POST …/activities` in parent-before-child order, then M `POST …/dependencies` for the internal
 * edges — **sequentially**. Sequential is not a simplification of the real thing; it IS the real
 * thing, because every dependency create runs inside a transaction under `lockPlanForWrite(planId)`
 * (`apps/api/src/modules/dependencies/dependencies.service.ts:213-222`), so concurrent creates on
 * one plan serialise on that advisory lock anyway. Measuring a fan-out would measure lock waiting.
 *
 * **Against a real API with the pen enforced.** The pen is taken once for the whole composite, as
 * the product does; without it every write is a 423 and the numbers would describe nothing. The
 * plan is built through the same public REST surface (ADR-0066's rule), so what is timed is what a
 * planner's browser would issue.
 *
 * **What it deliberately does not claim.** These are server-side round trips from this machine to
 * an API on this machine. A planner's latency includes a real network, which this cannot see and
 * must not pretend to — the number to read here is the *shape* (how the cost grows with the band)
 * and the per-request p95, not a promise about anybody's wall clock.
 *
 * **The first run's two alarming numbers were both this script's own fault, and finding out why is
 * most of what it now measures.** It reported a 63.5 s wall clock for the 60/90 band against p50/p95
 * per-request figures of 19-37 ms — 151 requests that should sum to about four seconds — and a
 * partial paste of 100 activities where 122 were expected. Neither was a product defect:
 *
 * 1. The partial-paste check read `client.lastMeta?.nextCursor`, a property `SeedClient` **has never
 *    had** (`grep -rn 'lastMeta' packages/seed-http/src/` returns nothing), so the optional chain
 *    yielded `undefined`, paging stopped after the first page, and `limit=100` reported exactly 100.
 *    A false partial paste is the worst possible failure for this script, because a partial paste is
 *    the condition that triggers Milestone B.
 * 2. The wall clock was the **API's own rate limiter throttling the measurement**, and the shape of
 *    that limit is not what it looks like from the config. `RATE_LIMIT_LIMIT`/`RATE_LIMIT_TTL` read
 *    as "100 requests per 60 s" (`apps/api/src/config/env.validation.ts:88-89`), but
 *    `ThrottlerGuard.generateKey` (`dist/throttler.guard.js:148-150`) hashes the **class and handler
 *    names** into the counter key
 *    alongside the tracker (the IP), so the real bound is 100 per 60 s **per route handler** per IP.
 *    Building a 60/90 band spends 61 on the activity-create handler and 90 on the dependency-create
 *    handler; copying it spends the same again, so undrained the two handlers saw 122 and 180 inside
 *    one window and `SeedClient` paid the 429 back-off ladder `[1s, 5s, 15s, 30s, 61s]`
 *    (`packages/seed-http/src/client.ts` 429 branch) — 1+5+15+30 = 51 s of sleeping, which with ~4 s
 *    of real work is the missing wall clock almost exactly. The percentiles missed it because only a
 *    couple of requests hit the wall.
 *
 *    That per-handler detail was **established rather than assumed**, and getting it wrong would have
 *    set the cap wrongly in both directions. `node -e` firing 150 concurrent `GET /api/v1/version`
 *    returned `{200: 100, 429: 50}` — so the limiter is live — while the drained 151-request copy
 *    below returns zero 429s, which is only consistent with a per-handler key. Registered in
 *    `scripts/dependency-claims.json` so a `@nestjs/throttler` bump re-opens it (ADR-0076).
 *
 * So the timed section now starts from a **drained** rate-limit window, and 429s inside it are
 * counted and reported rather than silently absorbed. That second number is the one that decides the
 * cap, because the web client has no back-off at all (`apps/web/src/lib/api/client.ts:60` throws on
 * any non-2xx) — a 429 there aborts the composite mid-flight and leaves a **partial paste**.
 *
 * Usage — with an API already running and a database migrated:
 *
 *   node scripts/measure-band-copy.mjs \
 *     --api http://localhost:3000/api/v1 \
 *     --email dev@example.com --password 'correct horse battery staple'
 *
 * Sizes default to the spec's two cases (15/21 and 60/90) and can be overridden with --sizes.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const { SeedClient, PenHolder } = await import(
  path.join(here, '../packages/seed-http/dist/index.js')
);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

// The ORIGIN, not the versioned prefix: `SeedClient` composes `/api/auth/...` itself and every
// caller prefixes `/api/v1` on its own paths (`packages/seed-http/src/pen.ts:75`). Passing the
// prefixed URL yields `/api/v1/api/auth/...` and a 404 — checked by running it.
const API = arg('api', 'http://localhost:3000');
const EMAIL = arg('email', 'measure-band-copy@example.com');
const PASSWORD = arg('password', 'measure-band-copy-password-1');
/**
 * `activities:links` pairs. The spec names 15:21 and 60:90; 40:58 is added because it is the
 * interesting one — `1 + 40 + 58 = 99` requests sits one below the 100/60 s throttle, so the pair
 * either side of it shows where the limiter starts to bite rather than merely that it does.
 */
const SIZES = arg('sizes', '15:21,40:58,60:90')
  .split(',')
  .map((pair) => {
    const [a, l] = pair.split(':').map(Number);
    return { activities: a, links: l };
  });

/**
 * Read every page of a cursor-paginated list. `limit` is capped at 100 by the API, which this
 * script found by asking for 200 and getting a 422 — so the cap is respected rather than assumed.
 *
 * Uses `getPage`, which returns `meta` beside the rows. The previous version invented a `lastMeta`
 * property on `SeedClient` and therefore always stopped after one page (see the file docblock); the
 * `hasMore` guard below is the fix, and the `nextCursor === null` guard beside it is the thing that
 * makes a server bug a terminating loop rather than an infinite one.
 */
async function listAll(client, path) {
  const out = [];
  let cursor = null;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const { rows, meta } = await client.getPage(
      `${path}${sep}limit=100${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
    );
    out.push(...rows);
    if (!meta.hasMore || meta.nextCursor === null || rows.length === 0) break;
    cursor = meta.nextCursor;
  }
  return out;
}

/**
 * Wait until the API's rate-limit window has rolled over, so the section that follows starts with a
 * full budget.
 *
 * Without this the timed copy pays off the source build's throttle debt and the wall clock describes
 * this script rather than the product — which is exactly what the first run reported. `ttl` is the
 * server's `RATE_LIMIT_TTL` (60 s by default); the extra second is for clock skew between the two
 * processes, and the whole thing is skipped when nothing has been spent.
 */
async function drainRateLimitWindow(spentSinceWindowStart, ttlSeconds) {
  if (spentSinceWindowStart === 0) return;
  const ms = (ttlSeconds + 1) * 1000;
  process.stdout.write(
    `  draining the ${String(ttlSeconds)}s rate-limit window (${String(spentSinceWindowStart)} ` +
      'requests spent building)…\n',
  );
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** p-th percentile of a sorted-in-place copy. Nearest-rank, so it never invents a value. */
function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/** The server's `RATE_LIMIT_TTL`, in seconds (`apps/api/src/config/env.validation.ts:88`). */
const RATE_LIMIT_TTL_S = Number(arg('rate-limit-ttl', '60'));

/**
 * Every request the client settles, so a 429 inside the timed section is **counted rather than
 * silently absorbed**. The client retries a 429 transparently, which is right for a seeder and
 * would have hidden the single most important thing this script has to report.
 */
let requestsBuilt = 0;
let throttledInTimedSection = 0;
let timing = false;

const client = new SeedClient({
  baseUrl: API,
  onRequest: ({ status }) => {
    requestsBuilt += 1;
    if (timing && status === 429) throttledInTimedSection += 1;
  },
});
await client.authenticate({
  email: EMAIL,
  password: PASSWORD,
  signUpName: 'Band copy measurement',
});

/**
 * Bootstrap an organisation → client → project → plan to measure in.
 *
 * The org's **slug is derived server-side** from the name (`organizations.service.ts:52`) and the
 * DTO refuses one in the body, so it is read back off the response rather than chosen here. Every
 * shape below was read from `packages/seed-http/src/runner.ts`, which is the working precedent —
 * guessing them cost two failed runs.
 */
const org = await client.post('/api/v1/organizations', {
  name: `Band copy measurement ${String(Date.now())}`,
});
const orgSlug = org.slug;
const clientRow = await client.post(`/api/v1/organizations/${orgSlug}/clients`, {
  name: 'Measurement',
});
// A project is created UNDER its client, exactly as a plan is created under its project
// (`client-projects.controller.ts:36`). The flat `/projects` route is read-only.
const project = await client.post(
  `/api/v1/organizations/${orgSlug}/clients/${clientRow.id}/projects`,
  { name: 'Band copy' },
);
const projectId = project.id;

const results = [];

for (const size of SIZES) {
  // Plans are created UNDER the project, and the data date is `plannedStart` on this DTO
  // (`create-plan.dto.ts:55`, `runner.ts:179-182`).
  const plan = await client.post(`/api/v1/organizations/${orgSlug}/projects/${projectId}/plans`, {
    name: `Band ${String(size.activities)}x${String(size.links)}`,
    plannedStart: '2026-01-05',
  });
  const planId = plan.id;
  const base = `/api/v1/organizations/${orgSlug}/plans/${planId}`;

  await PenHolder.withPen(client, orgSlug, planId, async () => {
    // ---- Build the source band -------------------------------------------------------------
    const summary = await client.post(`${base}/activities`, {
      name: 'Level 2',
      type: 'WBS_SUMMARY',
      durationDays: 0,
    });
    const members = [];
    for (let i = 0; i < size.activities; i += 1) {
      const row = await client.post(`${base}/activities`, {
        name: `Member ${String(i)}`,
        type: 'TASK',
        durationDays: 2,
        laneIndex: i,
        parentId: summary.id,
      });
      members.push(row);
    }
    // A chain plus extra edges until the requested link count is reached. Every edge stays INSIDE
    // the band, because only internal edges are cloned — measuring external ones would inflate the
    // source build without changing what the copy does.
    const sourceEdges = [];
    const addEdge = async (from, to) => {
      await client.post(`${base}/dependencies`, {
        predecessorId: from.id,
        successorId: to.id,
        type: 'FS',
      });
      sourceEdges.push({ predecessorId: from.id, successorId: to.id });
    };
    for (let i = 0; sourceEdges.length < size.links && i + 1 < members.length; i += 1) {
      await addEdge(members[i], members[i + 1]);
    }
    for (let gap = 2; sourceEdges.length < size.links; gap += 1) {
      for (let i = 0; sourceEdges.length < size.links && i + gap < members.length; i += 1) {
        await addEdge(members[i], members[i + gap]);
      }
      if (gap > members.length) break;
    }

    // ---- Time the duplicate ----------------------------------------------------------------
    // Exactly the request sequence `duplicateActivities` issues: the summary, then its members in
    // parent-before-child order, then the internal links — one at a time.
    //
    // The window is drained first so this measures the COPY and not the build's throttle debt. The
    // pen is held across the wait, which is the honest arrangement: `PenHolder` heartbeats, and a
    // planner who has a band selected holds the pen while they decide to duplicate it too.
    await drainRateLimitWindow(requestsBuilt, RATE_LIMIT_TTL_S);
    requestsBuilt = 0;
    throttledInTimedSection = 0;
    timing = true;

    const createMs = [];
    const linkMs = [];
    const wallStart = Date.now();

    const t0 = Date.now();
    const clonedSummary = await client.post(`${base}/activities`, {
      name: 'Level 2 (copy)',
      type: 'WBS_SUMMARY',
      durationDays: 0,
    });
    createMs.push(Date.now() - t0);

    const idMap = new Map();
    for (const [i, member] of members.entries()) {
      const t = Date.now();
      const row = await client.post(`${base}/activities`, {
        name: `Member ${String(i)} (copy)`,
        type: 'TASK',
        durationDays: 2,
        laneIndex: size.activities + i,
        parentId: clonedSummary.id,
      });
      createMs.push(Date.now() - t);
      idMap.set(member.id, row.id);
    }

    // The internal edges, held from when they were built. Reading them back would put an untimed
    // pagination round trip inside the section this script exists to time.
    for (const edge of sourceEdges) {
      const t = Date.now();
      await client.post(`${base}/dependencies`, {
        predecessorId: idMap.get(edge.predecessorId),
        successorId: idMap.get(edge.successorId),
        type: 'FS',
      });
      linkMs.push(Date.now() - t);
    }

    const wallMs = Date.now() - wallStart;
    timing = false;
    // Did everything land that should have? A partial paste is the failure that triggers Milestone
    // B, so it is checked rather than assumed absent — and, since the first run, checked with a
    // pager that can actually see past row 100.
    const after = await listAll(client, `${base}/activities`);
    results.push({
      size,
      wallMs,
      creates: createMs.length,
      links: linkMs.length,
      throttled: throttledInTimedSection,
      createP50: percentile(createMs, 50),
      createP95: percentile(createMs, 95),
      createMax: percentile(createMs, 100),
      linkP50: percentile(linkMs, 50),
      linkP95: percentile(linkMs, 95),
      linkMax: percentile(linkMs, 100),
      activitiesAfter: after.length,
      expectedAfter: (size.activities + 1) * 2,
    });
  });
}

const rows = results.map((r) => ({
  band: `${String(r.size.activities)} activities / ${String(r.links)} links`,
  requests: r.creates + r.links,
  'wall clock': `${String(r.wallMs)} ms`,
  'create p50/p95/max': `${String(r.createP50)} / ${String(r.createP95)} / ${String(r.createMax)} ms`,
  'link p50/p95/max': `${String(r.linkP50)} / ${String(r.linkP95)} / ${String(r.linkMax)} ms`,
  '429s': r.throttled,
  partial: r.activitiesAfter === r.expectedAfter ? 'no' : `YES (${String(r.activitiesAfter)})`,
}));
console.table(rows);

for (const r of results) {
  const requests = r.creates + r.links;
  process.stdout.write(
    `${String(r.size.activities)}/${String(r.links)}: ${String(requests)} requests, ` +
      `${(r.wallMs / requests).toFixed(1)} ms/request average, ` +
      `${String(r.throttled)} rate-limited\n`,
  );
}
process.stdout.write(
  '\nRead the SHAPE, not the wall clock: these are loopback round trips, so a planner sees ' +
    'this plus their own network per request.\n' +
    `The 429 column is the one that decides the cap: the API allows 100 requests / ` +
    `${String(RATE_LIMIT_TTL_S)}s per ROUTE HANDLER per IP, and the WEB client has no back-off — ` +
    'a 429 there aborts the composite and leaves a partial paste.\n',
);
