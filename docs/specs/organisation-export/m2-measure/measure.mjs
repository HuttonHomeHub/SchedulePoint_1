// Measures one organisation export (ADR-0194 M2-T4): wall time, bytes, peak API RSS delta, event-loop
// delay (from eld-preload.cjs, loaded into the API process) and the latency of an ordinary read
// (GET …/plans/:planId/activities?limit=100) with no export running and while one runs.
//
//   ELD_FILE=/tmp/eld.json node measure.mjs <baseUrl> <apiPid> <orgSlug> <readPlanId> <email>
//
// The API must have been started with the same ELD_FILE and `--require ./eld-preload.cjs`. The password
// is the fixture's (`correct-horse-battery`). One run uses one of the route's three-per-ten-minutes
// requests, so restart the API between runs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [base, pidArg, orgSlug, planId, email] = process.argv.slice(2);
const pid = Number(pidArg);
const ELD = process.env.ELD_FILE;
const origin = 'http://localhost:5173';
let cookie = '';

async function signIn() {
  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email, password: 'correct-horse-battery' }),
  });
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!res.ok) throw new Error(`sign-in ${res.status}`);
}

const rssMb = () => {
  const line = readFileSync(`/proc/${pid}/status`, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('VmRSS'));
  return Math.round(Number(line.split(/\s+/)[1]) / 1024);
};

// The sampler rewrites ELD every 100 ms; a `.reset` file asks it to start a new window.
async function resetEld() {
  writeFileSync(`${ELD}.reset`, '');
  for (let i = 0; i < 50 && existsSync(`${ELD}.reset`); i += 1) await sleep(20);
  await sleep(150);
}
async function eld() {
  await sleep(250);
  return JSON.parse(readFileSync(ELD, 'utf8'));
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const summary = (ms) => ({
  n: ms.length,
  p50: Math.round(percentile(ms, 50)),
  p95: Math.round(percentile(ms, 95)),
  max: Math.round(Math.max(...ms)),
});

const readUrl = `${base}/api/v1/organizations/${orgSlug}/plans/${planId}/activities?limit=100`;

async function readLoop(signal) {
  const latencies = [];
  while (!signal.stopped) {
    const start = performance.now();
    const res = await fetch(readUrl, { headers: { cookie, origin } });
    await res.arrayBuffer();
    if (res.status !== 200) throw new Error(`ordinary read ${res.status}`);
    latencies.push(performance.now() - start);
    await sleep(25);
  }
  return latencies;
}

await signIn();
for (let i = 0; i < 5; i += 1) {
  await (await fetch(readUrl, { headers: { cookie, origin } })).arrayBuffer();
}
const idleSignal = { stopped: false };
const idleRun = readLoop(idleSignal);
await sleep(8000);
idleSignal.stopped = true;
const idleReads = await idleRun;
const idleLoop = await eld();
await resetEld();
const rssBefore = rssMb();

const signal = { stopped: false };
const reads = readLoop(signal);
let peakRss = rssBefore;
const peak = { heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, arrayBuffersMb: 0 };
const sampler = setInterval(() => {
  peakRss = Math.max(peakRss, rssMb());
  try {
    const now = JSON.parse(readFileSync(ELD, 'utf8'));
    for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], now[key] ?? 0);
  } catch {
    // The sampler was mid-write; the next tick reads it.
  }
}, 100);

const started = performance.now();
const res = await fetch(`${base}/api/v1/organizations/${orgSlug}/export`, {
  method: 'POST',
  headers: { cookie, origin },
});
const headersAt = performance.now() - started;
let bytes = 0;
for await (const chunk of res.body) bytes += chunk.length;
const wallMs = performance.now() - started;
signal.stopped = true;
clearInterval(sampler);
const duringReads = await reads;
const loop = await eld();

const window = (w) => ({ samples: w.samples, mean: w.mean, p50: w.p50, p99: w.p99, max: w.max });
console.log(
  JSON.stringify(
    {
      status: res.status,
      wallSeconds: Math.round(wallMs / 100) / 10,
      headersMs: Math.round(headersAt),
      bytes,
      megabytes: Math.round(bytes / 104857.6) / 10,
      rssBeforeMb: rssBefore,
      rssPeakMb: peakRss,
      rssDeltaMb: peakRss - rssBefore,
      rssAfterMb: rssMb(),
      peakMemoryMb: peak,
      eventLoopMs: window(loop),
      eventLoopIdleMs: window(idleLoop),
      readIdle: summary(idleReads),
      readDuringExport: summary(duringReads),
    },
    null,
    2,
  ),
);
