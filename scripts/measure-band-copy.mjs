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

const API = arg('api', 'http://localhost:3000/api/v1');
const EMAIL = arg('email', 'measure-band-copy@example.com');
const PASSWORD = arg('password', 'measure-band-copy-password-1');
/** `activities:links` pairs. The spec names 15:21 and 60:90. */
const SIZES = arg('sizes', '15:21,60:90')
  .split(',')
  .map((pair) => {
    const [a, l] = pair.split(':').map(Number);
    return { activities: a, links: l };
  });

/** p-th percentile of a sorted-in-place copy. Nearest-rank, so it never invents a value. */
function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

const client = new SeedClient({ baseUrl: API });
await client.authenticate({
  email: EMAIL,
  password: PASSWORD,
  signUpName: 'Band copy measurement',
});

/** Bootstrap an organisation → client → project → plan to measure in. */
const orgSlug = `band-copy-${String(Date.now())}`;
await client.post('/organizations', { name: 'Band copy measurement', slug: orgSlug });
const clientRow = await client.post(`/organizations/${orgSlug}/clients`, { name: 'Measurement' });
const project = await client.post(`/organizations/${orgSlug}/projects`, {
  clientId: clientRow.data.id,
  name: 'Band copy',
});

const results = [];

for (const size of SIZES) {
  const plan = await client.post(`/organizations/${orgSlug}/plans`, {
    projectId: project.data.id,
    name: `Band ${String(size.activities)}x${String(size.links)}`,
    dataDate: '2026-01-05',
  });
  const planId = plan.data.id;
  const base = `/organizations/${orgSlug}/plans/${planId}`;

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
        parentId: summary.data.id,
      });
      members.push(row.data);
    }
    // A chain plus extra edges until the requested link count is reached. Every edge stays INSIDE
    // the band, because only internal edges are cloned — measuring external ones would inflate the
    // source build without changing what the copy does.
    let made = 0;
    for (let i = 0; made < size.links && i + 1 < members.length; i += 1) {
      await client.post(`${base}/dependencies`, {
        predecessorId: members[i].id,
        successorId: members[i + 1].id,
        type: 'FS',
      });
      made += 1;
    }
    for (let gap = 2; made < size.links; gap += 1) {
      for (let i = 0; made < size.links && i + gap < members.length; i += 1) {
        await client.post(`${base}/dependencies`, {
          predecessorId: members[i].id,
          successorId: members[i + gap].id,
          type: 'FS',
        });
        made += 1;
      }
      if (gap > members.length) break;
    }

    // ---- Time the duplicate ----------------------------------------------------------------
    // Exactly the request sequence `duplicateActivities` issues: the summary, then its members in
    // parent-before-child order, then the internal links — one at a time.
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
        parentId: clonedSummary.data.id,
      });
      createMs.push(Date.now() - t);
      idMap.set(member.id, row.data.id);
    }

    const edges = await client.get(`${base}/dependencies?limit=200`);
    const internal = edges.data.filter(
      (d) => idMap.has(d.predecessor.id) && idMap.has(d.successor.id),
    );
    for (const edge of internal) {
      const t = Date.now();
      await client.post(`${base}/dependencies`, {
        predecessorId: idMap.get(edge.predecessor.id),
        successorId: idMap.get(edge.successor.id),
        type: edge.type,
        lagMinutes: edge.lagMinutes,
        lagCalendar: edge.lagCalendar,
      });
      linkMs.push(Date.now() - t);
    }

    const wallMs = Date.now() - wallStart;
    // Did anything land that should not have? A partial paste is the failure that triggers
    // Milestone B, so it is checked rather than assumed absent.
    const after = await client.get(`${base}/activities?limit=500`);
    results.push({
      size,
      wallMs,
      creates: createMs.length,
      links: linkMs.length,
      createP50: percentile(createMs, 50),
      createP95: percentile(createMs, 95),
      linkP50: percentile(linkMs, 50),
      linkP95: percentile(linkMs, 95),
      activitiesAfter: after.data.length,
      expectedAfter: (size.activities + 1) * 2,
    });
  });
}

const rows = results.map((r) => ({
  band: `${String(r.size.activities)} activities / ${String(r.links)} links`,
  'wall clock': `${String(r.wallMs)} ms`,
  'create p50/p95': `${String(r.createP50)} / ${String(r.createP95)} ms`,
  'link p50/p95': `${String(r.linkP50)} / ${String(r.linkP95)} ms`,
  partial: r.activitiesAfter === r.expectedAfter ? 'no' : `YES (${String(r.activitiesAfter)})`,
}));
console.table(rows);

for (const r of results) {
  const perActivity = r.wallMs / (r.creates + r.links);
  process.stdout.write(
    `${String(r.size.activities)}/${String(r.links)}: ${String(r.creates + r.links)} requests, ` +
      `${perActivity.toFixed(1)} ms/request average\n`,
  );
}
process.stdout.write(
  '\nRead the SHAPE, not the wall clock: these are loopback round trips, so a planner sees ' +
    'this plus their own network per request.\n',
);
