#!/usr/bin/env node
/**
 * **Measure one `GET …/schedule/health-check/critical-path-test` request** (health M6-T0).
 *
 * The route runs `computeSchedule` TWICE — a control pass and a perturbed pass — so its throttle
 * must be its own measured number, never `FLOAT_PATHS_THROTTLE` (sized for one pass at 540
 * activities). The falsification condition and the derivation formula were committed to
 * `docs/specs/schedule-health-check/m6-measurement.md` BEFORE this script first ran.
 *
 * Adapted from `measure-float-paths.mjs`: same seeded-plan approach, same warm-up, same
 * nearest-rank percentiles, and `POST …/schedule/recalculate` measured alongside on the same plan
 * — because the useful question is the RATIO to the write a planner already waits on, not an
 * absolute on a CI-class host.
 *
 * Usage (against a running API with a seeded scale plan):
 *   node apps/api/scripts/measure-critical-path-test.mjs \
 *     --url http://localhost:3000 --org acme --email a@b.c --password ... --plan <uuid> [--runs 20]
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
const origin = args.get('origin') ?? 'http://localhost:5173';

async function call(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', origin, cookie, ...(init.headers ?? {}) },
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

// Better Auth applies CSRF/origin checks; a bare fetch is 403 without the Origin header.
const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin },
  body: JSON.stringify({ email, password }),
});
if (!signIn.ok) {
  console.error(`sign-in failed: ${String(signIn.status)}`);
  process.exit(1);
}
cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];

async function time(label, fn) {
  // One warm-up: the first call pays connection setup and lazy Nest resolution.
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

// NOTE the run budget: the route's own throttle applies to this script too. Sign-in is per-run
// fresh, so keep `--runs` under the route's limit per minute or stagger the loop.
const cptP95 = await time('critical-path-test', () =>
  call(`/api/v1/organizations/${org}/plans/${planId}/schedule/health-check/critical-path-test`),
);
const recalcP95 = await time('recalculate', () =>
  call(`/api/v1/organizations/${org}/plans/${planId}/schedule/recalculate`, { method: 'POST' }),
);

console.log(
  `\ncritical-path-test is ${(cptP95 / recalcP95).toFixed(2)}× a recalculate at p95 on this plan.`,
);
console.log(
  'Derive the throttle from the committed formula in m6-measurement.md; record the numbers there.',
);
