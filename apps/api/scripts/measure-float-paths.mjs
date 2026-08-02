#!/usr/bin/env node
/**
 * **Measure one `GET …/schedule/float-paths` request** (F4 M0.5).
 *
 * Why this exists before any client work: unlike its two sibling read endpoints, float-paths is
 * **not a persisted read-model**. `ScheduleService.floatPaths` loads the graph and calls
 * `computeSchedule`, so **one request ≈ one CPM run**. The panel's fetch policy — fetch on open, or
 * behind an explicit control; what `staleTime` to hold — is a completely different decision at 20 ms
 * than at 2 s, and the plan gates M1.3 on this number rather than on a guess.
 *
 * That is the ADR-0065 lesson applied BEFORE the build instead of after: that epic shipped a feature
 * and then discovered the painter had been 4–6× over its budget the whole time, unmeasured.
 *
 * It reports `POST …/schedule/recalculate` on the same plan alongside, because the useful question
 * is not "how many milliseconds" in the abstract — it is "how does this compare to the write the
 * planner already presses a button for and waits on".
 *
 * Usage (against a running API with a seeded scale plan):
 *   node apps/api/scripts/measure-float-paths.mjs \
 *     --url http://localhost:3000 --org acme --email a@b.c --password ... --plan <uuid> [--runs 20]
 *
 * Caveats, stated rather than implied: a container or a shared CI runner is not a planner's machine
 * and not a production host. The absolute numbers are indicative; the RATIO to recalculate, and the
 * shape as the plan grows, are what the fetch policy should be read from.
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token?.startsWith('--')) continue;
  args.set(token.slice(2), process.argv[i + 1]);
}

const base = args.get('url') ?? 'http://localhost:3000';
const org = args.get('org');
const planId = args.get('plan');
const email = args.get('email');
const password = args.get('password');
const runs = Number(args.get('runs') ?? 20);

if (!org || !planId || !email || !password) {
  console.error('Missing --org / --plan / --email / --password. See the docblock.');
  process.exit(2);
}

let cookie = '';

async function call(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return res;
}

/** p50/p95 from a sorted-on-demand sample. Nearest-rank, so a 20-run p95 is the 19th value. */
function percentiles(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  return { p50: at(50), p95: at(95), min: sorted[0], max: sorted[sorted.length - 1] };
}

const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!signIn.ok) {
  console.error(`sign-in failed: ${String(signIn.status)}`);
  process.exit(1);
}
cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];

// The target matters: paths are computed INTO one activity, and the deepest one exercises the
// longest driving chain. Take the plan's last activity by early finish — the closest thing to
// "the project finish", which is also the panel's suggested default (CQ-2).
const listed = await call(
  `/api/v1/organizations/${org}/plans/${planId}/activities?limit=500&sort=earlyFinish:desc`,
);
if (!listed.ok) {
  console.error(`activity list failed: ${String(listed.status)}`);
  process.exit(1);
}
const activities = (await listed.json()).data;
const target = activities[0]?.id;
if (!target) {
  console.error('the plan has no activities');
  process.exit(1);
}

console.log(`plan ${planId} — ${String(activities.length)} activities listed, target ${target}`);

async function time(label, fn) {
  // One warm-up: the first call pays connection setup and any lazy Nest resolution, which is not
  // what a planner's second press costs.
  await fn();
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    const res = await fn();
    samples.push(performance.now() - started);
    if (!res.ok) {
      console.error(`${label} returned ${String(res.status)}`);
      process.exit(1);
    }
  }
  const { p50, p95, min, max } = percentiles(samples);
  console.log(
    `${label.padEnd(22)} p50 ${p50.toFixed(1).padStart(8)} ms   p95 ${p95.toFixed(1).padStart(8)} ms   (min ${min.toFixed(1)} / max ${max.toFixed(1)}, n=${String(runs)})`,
  );
  return p95;
}

const floatP95 = await time('float-paths', () =>
  call(`/api/v1/organizations/${org}/plans/${planId}/schedule/float-paths?target=${target}`),
);
const recalcP95 = await time('recalculate', () =>
  call(`/api/v1/organizations/${org}/plans/${planId}/schedule/recalculate`, { method: 'POST' }),
);

console.log(
  `\nfloat-paths is ${(floatP95 / recalcP95).toFixed(2)}× a recalculate at p95 on this plan.`,
);
console.log(
  'Read the ratio, not the absolute: this host is not a planner’s machine. Record the number,\n' +
    'the plan size and the hardware in docs/specs/float-paths-surface/implementation-plan.md (M0.5).',
);
