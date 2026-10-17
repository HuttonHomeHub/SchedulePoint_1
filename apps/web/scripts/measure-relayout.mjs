#!/usr/bin/env node
/**
 * **Re-layout quality: the benchmark, in one command** (`docs/specs/relayout-quality`, plan M0,
 * `docs/TECH_DEBT.md` #382). Bars: `docs/specs/relayout-quality/conditions.md`, committed alone
 * before this file took a reading.
 *
 *   scripts/e2e-local.sh measure:relayout            (from the repo root: brings Postgres up, migrates)
 *   pnpm --filter @repo/web measure:relayout         (when the database is already up and migrated)
 *
 * It starts the API (:3000) and the Vite dev server (:5173) itself and stops them at the end, so
 * nothing may be listening on either port. It needs a migrated Postgres (`DATABASE_URL`, default the
 * `app_test` one `e2e-local.sh` creates), the Playwright Chromium (`PLAYWRIGHT_CHROMIUM_PATH`, default
 * the `/opt/pw-browsers` lookup the other harnesses use), and `@repo/*` packages built
 * (`pnpm --filter "./packages/*" build`).
 *
 * ## What it does, in order
 *
 * 1. **Self-tests** the counters (bends, critical spine, travel) on hand-built cases. A counter that
 *    cannot count a known case is not measuring a layout.
 * 2. **Captures the corpus** through the public REST API, as an ordinary Planner (ADR-0066): signs up,
 *    makes an organisation / client / project, seeds `--tier all` and one generated scale plan, then
 *    reads every plan back and maps it with the canvas's OWN code (`toRenderActivities` with the
 *    `'visual'` source, `toRenderEdges`, `computeLaneArrangement`). Controls throw on vacuity.
 *    Written to `scripts/fixtures/relayout-corpus.json` (commit it: later runs score fixed inputs).
 * 3. **Scores** every plan in headless Chromium with the repo's IBM Plex Sans loaded and the product's
 *    own `textWidthTable`: the hand layout, Tidy, today's Re-layout, and any lever asked for. The
 *    search is the product's `handleOptimiseRequest` (the function the worker runs).
 * 4. **Agrees with the dialog (FC-R0)**: signs in through the real UI, opens Arrange on the reference
 *    and fixture plans, reads the figures the dialog shows, and requires them to equal this script's
 *    for the same plans. Nothing else here means anything until they agree.
 * 5. **Judges** FC-R0..R9 and writes `relayout-<commit>.json` and `.md` under `--out`.
 *
 * Exit code 1 when a control throws, when FC-R0 disagrees, or when any condition FAILS; 0 otherwise.
 *
 * ## Options
 *
 *   --skip-capture        Score the committed corpus. Starts no servers, so FC-R0 is NOT RUN.
 *   --skip-agree          Take no dialog reading (FC-R0 NOT RUN).
 *   --plant-error         Add one crossing to this script's copy of the reference plan's figures, to
 *                         prove FC-R0 goes red (run once, expect exit 1 and a FAIL on FC-R0).
 *   --budget=seed,current Which row budgets to try for Re-layout (default both). `seed` is today's.
 *   --starts=0,1,2,3      Which start seeds to try (default 0). 1-3 are the prototypes in
 *                         relayout-start-prototypes.ts; `--frontier` is shorthand for all four.
 *   --candidate=current:0 What FC-R2..R6 judge: budget:starts (default current:0, the M1 lever).
 *                         `seed:0` is today's, so every FC-R2 comparison is against itself.
 *   --product=today|m1    Which Re-layout the dialog runs now, for FC-R0 (default today; m1 after M1).
 *   --runs=2              Searches per layout (timing spread, and the repeatability check).
 *   --only=a,b            Score only these seed names.
 *   --scale-leaves=N      Leaves in the generated plan (default: the largest N <= 300 whose WBS
 *                         summaries keep the DRAWN count within the 300 the search is offered at).
 *   --write-baseline      Record Tidy's lane digests and today's vectors as the committed baseline
 *                         (FC-R8): run it ONCE on unmodified code, then commit the file.
 *   --base=origin/main    The revision FC-R9 diffs against.
 *   --out=<dir>           Where the reports go (default .tmp/relayout).
 *   --self-test           Run step 1 and stop.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';
import { build } from 'esbuild';

// ── Arguments ────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const list = (s) => s.split(',').filter((x) => x !== '');

const FRONTIER = has('frontier');
const BUDGETS = list(opt('budget', 'seed,current'));
const STARTS = (FRONTIER ? ['0', '1', '2', '3'] : list(opt('starts', '0'))).map(Number);
const [CAND_BUDGET, CAND_STARTS] = opt('candidate', 'current:0').split(':');
const CANDIDATE = { budget: CAND_BUDGET, starts: list(CAND_STARTS ?? '0').map(Number) };
const PRODUCT = opt('product', 'today');
const RUNS = Number(opt('runs', '2'));
const ONLY = list(opt('only', ''));
const BASE_REV = opt('base', 'origin/main');
const SKIP_CAPTURE = has('skip-capture');
const SKIP_AGREE = has('skip-agree') || SKIP_CAPTURE;
const PLANT_ERROR = has('plant-error');
const WRITE_BASELINE = has('write-baseline');
if (
  !['seed', 'current'].includes(CANDIDATE.budget) ||
  BUDGETS.some((b) => !['seed', 'current'].includes(b))
) {
  throw new Error('--budget and --candidate take `seed` or `current`');
}
if (!['today', 'm1'].includes(PRODUCT)) throw new Error('--product takes `today` or `m1`');

const WEB = 'http://localhost:5173';
const API_HEALTH = 'http://localhost:3000/api/v1/health';
const HERE = process.cwd();
const REPO = resolve(HERE, '../..');
const CORPUS_PATH = join(HERE, 'scripts/fixtures/relayout-corpus.json');
const BASELINE_PATH = join(HERE, 'scripts/fixtures/relayout-baseline.json');
const OUT_DIR = resolve(opt('out', join(HERE, '.tmp/relayout')));
mkdirSync(OUT_DIR, { recursive: true });
const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();

const say = (s) => process.stderr.write(`${s}\n`);
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ── Bundles ──────────────────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'sp-relayout-'));
const common = {
  bundle: true,
  format: 'esm',
  logLevel: 'warning',
  // Product modules read `import.meta.env.VITE_*` at load; outside Vite that object is undefined.
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
};

async function bundleNode() {
  const entry = join(tmp, 'node-entry.ts');
  writeFileSync(
    entry,
    `export { selfTest } from ${JSON.stringify(`${HERE}/scripts/relayout-metrics.ts`)};
export { buildCorpusPlan } from ${JSON.stringify(`${HERE}/scripts/relayout-scene.ts`)};
export { judge, table, REFERENCE_SEED, FIXTURE_SEED } from ${JSON.stringify(`${HERE}/scripts/relayout-verdicts.ts`)};
export { loadSpecs } from ${JSON.stringify(`${REPO}/apps/seed-cli/src/specs.ts`)};
export { scaleSpec, scaleShapeOf } from ${JSON.stringify(`${REPO}/packages/seed/dist/index.js`)};
export { netpointReferencePlan } from ${JSON.stringify(`${REPO}/apps/seed-cli/src/references/netpoint-power-plant.ts`)};
`,
  );
  const outfile = join(tmp, 'node-bundle.mjs');
  await build({
    ...common,
    // `loadFixture` finds the conformance fixtures by `new URL('../fixtures/…', import.meta.url)`.
    // Bundled into a temp directory that URL points at /tmp/fixtures, so it is pinned to a file in
    // the package's own `src/` instead; no other module in this bundle reads `import.meta.url`.
    define: {
      ...common.define,
      'import.meta.url': JSON.stringify(
        pathToFileURL(join(REPO, 'packages/engine-conformance/src/load.ts')).href,
      ),
    },
    entryPoints: [entry],
    platform: 'node',
    outfile,
    absWorkingDir: HERE,
  });
  return import(pathToFileURL(outfile).href);
}

async function bundleBrowser() {
  const outfile = join(tmp, 'bench-bundle.mjs');
  await build({
    ...common,
    entryPoints: [join(HERE, 'scripts/relayout-bench.ts')],
    platform: 'browser',
    target: 'chrome120',
    outfile,
    absWorkingDir: HERE,
  });
  return outfile;
}

// ── Servers ──────────────────────────────────────────────────────────────────────────────────
const servers = [];

async function waitFor(url, label, ms = 180_000) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.status < 500) return;
    } catch {
      // not up yet
    }
    if (Date.now() > until)
      throw new Error(`${label} did not come up at ${url} within ${ms / 1000} s`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function refuseBusyPorts() {
  for (const url of [API_HEALTH, WEB]) {
    const busy = await fetch(url, { signal: AbortSignal.timeout(2000) }).then(
      () => true,
      () => false,
    );
    if (busy) {
      throw new Error(
        `${url} already answers. This script starts its own API and dev server with its own ` +
          "environment, and Playwright-style reuse would measure somebody else's. Stop it and re-run " +
          "(pkill -f 'vite.js'; pkill -f 'dist/main'; pkill -f 'nest start').",
      );
    }
  }
}

function start(name, command, args, cwd, env) {
  const log = openSync(join(OUT_DIR, `${name}.log`), 'w');
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', log, log],
    detached: true,
  });
  closeSync(log);
  servers.push(child);
  child.on('exit', (code) => {
    if (code !== null && code !== 0 && !stopping)
      say(`${name} exited with ${code}; see ${OUT_DIR}/${name}.log`);
  });
}

let stopping = false;
function stopServers() {
  stopping = true;
  for (const s of servers) {
    try {
      process.kill(-s.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopServers();
    process.exit(130);
  });
}

async function startServers() {
  await refuseBusyPorts();
  process.env.DATABASE_URL ??= 'postgresql://app:app@localhost:5432/app_test?schema=public';
  process.env.BETTER_AUTH_SECRET ??= 'local-e2e-secret-at-least-32-characters-long';
  say('Starting the API (:3000) and the dev server (:5173)…');
  start('api', 'pnpm', ['--filter', '@repo/api', 'exec', 'nest', 'start'], REPO, {
    LOG_LEVEL: 'silent',
    // The pen is enforced, as in the arrange journey: the dialog's offer depends on the real gate.
    // The seeder's own recalculation runs after it has released the pen and is refused 423 here, so
    // `recalculateHoldingPen` redoes it through the same public endpoint, holding the pen as the web
    // does; the seeder is left alone because a privileged path would make it stop testing the product.
    PLAN_EDIT_LOCK_ENFORCED: 'true',
    // Seeding ~40 plans is thousands of writes from one client; this instance is the harness's own.
    RATE_LIMIT_LIMIT: '100000',
  });
  start('web', 'pnpm', ['dev'], HERE, {
    VITE_CANVAS_AUTHORING: 'true',
    VITE_TSLD_EDITING: 'true',
    VITE_PLAN_EDIT_LOCK: 'true',
    VITE_SCHEDULE_INTERCHANGE: 'true',
  });
  await Promise.all([waitFor(API_HEALTH, 'the API'), waitFor(WEB, 'the dev server')]);
}

// ── Capture ──────────────────────────────────────────────────────────────────────────────────
const stamp = Date.now();
const ACCOUNT = {
  email: `relayout-${stamp}@example.com`,
  password: 'correct-horse-battery',
  name: 'Relayout Bench',
};

/** Largest N <= 300 whose generated plan keeps its DRAWN count (leaves + summaries) within 300. */
function scaleLeaves(node) {
  const asked = opt('scale-leaves', '');
  if (asked !== '') return Number(asked);
  for (let n = 300; n >= 12; n -= 1) {
    if (node.scaleSpec({ activities: n }).activities.length <= 300) return n;
  }
  throw new Error('no scale size keeps the drawn count within 300');
}

/** A stable digest of a scene: activity ids are UUIDs that differ per seeding, so rank replaces them. */
function sceneDigest(plan) {
  const ranked = [...plan.activities].sort(
    (a, b) =>
      (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) ||
      String(a.code ?? '').localeCompare(String(a.code ?? '')) ||
      String(a.drawnStart).localeCompare(String(b.drawnStart)),
  );
  const rank = new Map(ranked.map((a, i) => [a.id, i]));
  return sha(
    JSON.stringify({
      dataDate: plan.dataDate,
      calendar: plan.calendar,
      activities: ranked.map(({ id, ...rest }) => ({ ...rest, id: rank.get(id) })),
      edges: plan.edges
        .map((e) => ({
          ...e,
          id: undefined,
          predecessorId: rank.get(e.predecessorId),
          successorId: rank.get(e.successorId),
        }))
        .sort((a, b) => a.predecessorId - b.predecessorId || a.successorId - b.successorId),
    }),
  );
}

async function readPlan(client, org, report) {
  const base = `/api/v1/organizations/${org}`;
  const plan = await client.get(`${base}/plans/${report.planId}`);
  let calendar = null;
  if (plan.calendarId) {
    const c = await client.get(`${base}/calendars/${plan.calendarId}`);
    // Exactly `use-plan-workspace-model.ts`: the weekday mask and each exception's FIRST date.
    calendar = {
      workingWeekdays: c.workingWeekdays,
      exceptions: (c.exceptions ?? []).map((e) => [e.date, e.isWorking]),
    };
  }
  const all = async (path) => {
    const rows = [];
    let cursor = null;
    for (;;) {
      const sep = path.includes('?') ? '&' : '?';
      const page = await client.getPage(
        `${path}${sep}limit=100${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
      );
      rows.push(...page.rows);
      if (!page.meta.hasMore || page.meta.nextCursor === null) return rows;
      cursor = page.meta.nextCursor;
    }
  };
  const activities = await all(`${base}/plans/${report.planId}/activities`);
  const dependencies = await all(`${base}/plans/${report.planId}/dependencies`);
  return {
    plan,
    raw: {
      seedName: report.seedName,
      planName: plan.name,
      dataDate: plan.plannedStart ?? null,
      calendar,
      activities,
      dependencies,
    },
  };
}

async function capture(node) {
  const { SeedClient, PenHolder } = await import(
    pathToFileURL(join(REPO, 'packages/seed-http/dist/index.js')).href
  );
  const client = new SeedClient({ baseUrl: WEB, concurrency: 6 });
  await client.authenticate({
    email: ACCOUNT.email,
    password: ACCOUNT.password,
    signUpName: ACCOUNT.name,
  });
  const org = await client.post('/api/v1/organizations', { name: `Relayout Bench ${stamp}` });
  const slug = org.slug;
  const cl = await client.post(`/api/v1/organizations/${slug}/clients`, { name: 'Relayout' });
  const pr = await client.post(`/api/v1/organizations/${slug}/clients/${cl.id}/projects`, {
    name: 'Corpus',
  });

  const leaves = scaleLeaves(node);
  const seed = (tierArgs, label) => {
    const out = join(tmp, `seed-${label}.json`);
    say(`Seeding ${label}…`);
    execFileSync(
      'pnpm',
      [
        '--filter',
        '@repo/seed-cli',
        'seed',
        '--',
        '--url',
        WEB,
        '--org',
        slug,
        '--project',
        pr.id,
        '--email',
        ACCOUNT.email,
        '--password',
        ACCOUNT.password,
        ...tierArgs,
        '--out',
        out,
      ],
      { cwd: REPO, stdio: ['ignore', 'inherit', 'inherit'] },
    );
    return JSON.parse(readFileSync(out, 'utf8'));
  };
  const reports = [
    ...seed(['--tier', 'all'], 'the catalogue (--tier all)').plans,
    ...seed(['--tier', 'scale', '--activities', String(leaves)], `scale-${leaves}`).plans,
  ];

  // Control 0: every plan is scheduled. The seeder's recalculation is refused while the pen is
  // enforced (see `startServers`), so it is redone here; a failure stops the capture, because
  // unscheduled plans carry no dates and would be scored as if they were.
  const recalcFailures = [];
  for (const report of reports) {
    if (report.planId === null) continue;
    try {
      await PenHolder.withPen(client, slug, report.planId, () =>
        client.post(
          `/api/v1/organizations/${slug}/plans/${report.planId}/schedule/recalculate`,
          {},
        ),
      );
    } catch (error) {
      recalcFailures.push(`${report.seedName}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (recalcFailures.length > 0) {
    throw new Error(`CAPTURE CONTROL: recalculation failed on\n  ${recalcFailures.join('\n  ')}`);
  }

  // Control 1: the seeder made every plan the builders produce, plus the scale plan.
  const specs = [...node.loadSpecs('all'), node.scaleSpec({ activities: leaves })];
  const unseeded = reports.filter((r) => r.planId === null).map((r) => r.seedName);
  if (unseeded.length > 0) throw new Error(`CAPTURE CONTROL: not seeded: ${unseeded.join(', ')}`);
  if (reports.length !== specs.length) {
    throw new Error(
      `CAPTURE CONTROL: the catalogue builds ${specs.length} plans, the seeder reported ${reports.length}`,
    );
  }

  const plans = [];
  const undated = [];
  for (const report of reports) {
    const spec = specs.find((s) => s.seedName === report.seedName);
    if (!spec) throw new Error(`CAPTURE CONTROL: no spec for ${report.seedName}`);
    const { raw } = await readPlan(client, slug, report);
    // Control 2: nothing the spec has was dropped on the way.
    if (raw.activities.length !== spec.activities.length) {
      throw new Error(
        `CAPTURE CONTROL: ${report.seedName} has ${raw.activities.length} activities over the API, ${spec.activities.length} in its spec`,
      );
    }
    const planned = node.buildCorpusPlan(raw);
    if (planned === null) {
      undated.push(report.seedName);
      continue;
    }
    // Control 3: a plan that was never scheduled draws nothing and would score as vacuously good.
    if (planned.drawn === 0) {
      throw new Error(
        `CAPTURE CONTROL: ${report.seedName} draws 0 activities (was it recalculated?)`,
      );
    }
    plans.push({ ...planned, digest: sceneDigest(planned) });
    say(`  ${report.seedName}: ${planned.drawn} drawn, ${planned.edges.length} links`);
  }

  // Control 4: the reference plan's rows are the picture's rows (`netpoint-power-plant.ts`).
  const ref = plans.find((p) => p.seedName === node.REFERENCE_SEED);
  if (!ref) throw new Error('CAPTURE CONTROL: the reference plan is not in the corpus');
  const refSpec = node.netpointReferencePlan();
  const laneByName = new Map(ref.activities.map((a) => [a.label, a.laneIndex]));
  const wrong = refSpec.activities.filter((a) => laneByName.get(a.name) !== a.laneIndex);
  if (wrong.length > 0) {
    throw new Error(
      `CAPTURE CONTROL: the reference plan's lanes differ from its source on ${wrong.length} activities, e.g. ${wrong[0].name}`,
    );
  }

  const corpus = {
    capturedAt: new Date().toISOString(),
    commit,
    scaleLeaves: leaves,
    undated,
    plans,
  };
  mkdirSync(dirname(CORPUS_PATH), { recursive: true });
  writeFileSync(CORPUS_PATH, `${JSON.stringify(corpus)}\n`, 'utf8');
  say(`Corpus: ${plans.length} plans written to ${CORPUS_PATH} (commit it).`);
  return { corpus, slug, planIds: Object.fromEntries(reports.map((r) => [r.seedName, r.planId])) };
}

// ── Scoring (headless Chromium) ──────────────────────────────────────────────────────────────
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];

async function openBench(bundle) {
  const browser = await chromium.launch({ executablePath: chromiumPath || undefined });
  const font = readFileSync(join(HERE, 'src/assets/fonts/ibm-plex-sans-latin.woff2')).toString(
    'base64',
  );
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  await page.setContent(
    `<style>@font-face{font-family:'IBM Plex Sans';font-weight:400 700;src:url(data:font/woff2;base64,${font}) format('woff2')}</style><p style="font-family:'IBM Plex Sans'">x</p>`,
  );
  await page.addScriptTag({ path: bundle, type: 'module' });
  await page.waitForFunction(() => typeof globalThis.relayoutBench === 'object');
  // The face must be loaded before any width is taken, or every width is the fallback face's.
  const loaded = await page.evaluate(async () => {
    await globalThis.document.fonts.load("11px 'IBM Plex Sans'");
    await globalThis.document.fonts.load("600 11px 'IBM Plex Sans'");
    await globalThis.document.fonts.load("italic 11px 'IBM Plex Sans'");
    return globalThis.document.fonts.check("11px 'IBM Plex Sans'");
  });
  if (!loaded)
    throw new Error("IBM Plex Sans did not load; every width would be the fallback face's");
  return { browser, page };
}

const benchOptions = (runs, reverseUpTo) => ({
  budgets: BUDGETS,
  starts: STARTS,
  runs,
  reverseUpTo,
});

async function scoreAll(page, plans) {
  const results = [];
  for (const plan of plans) {
    say(`Scoring ${plan.seedName} (${plan.drawn} drawn)…`);
    const result = await page.evaluate(
      ([p, o]) => globalThis.relayoutBench.scorePlan(p, o),
      [plan, benchOptions(RUNS, 150)],
    );
    results.push(result);
  }
  return results;
}

// ── FC-R0: the dialog ────────────────────────────────────────────────────────────────────────
const change = (before, after) => (before === after ? String(after) : `${before} → ${after}`);

function dialogFigures(result, run) {
  const b = result.hand.objective;
  const a = run.measure.objective;
  return {
    'Activities moved': String(run.moved),
    Lanes: change(b.rows, a.rows),
    Overlaps: change(b.overlaps, a.overlaps),
    'Links behind bars': change(b.occluded, a.occluded),
    Crossings: change(b.crossings, a.crossings),
  };
}

async function readDialog(page, slug, planId) {
  await page.goto(`${WEB}/orgs/${slug}/plans/${planId}`);
  const stop = page.getByRole('button', { name: 'Stop editing' });
  const startEdit = page.getByRole('button', { name: 'Start editing' });
  await startEdit.or(stop).first().waitFor({ timeout: 30_000 });
  if (!(await stop.isVisible())) {
    await startEdit.click();
    await stop.waitFor({ timeout: 15_000 });
  }
  await page.locator('[data-toolbar-item="auto-arrange"]').click();
  const dialog = page.getByRole('dialog', { name: 'Arrange the diagram' });
  await dialog.waitFor();
  // Ready is any sentence but the computing one; the figures are read only once it is up.
  await dialog
    .getByRole('status')
    .filter({ hasText: /ready|arranged|packed/ })
    .waitFor({ timeout: 300_000 });
  const read = async (name) => {
    const card = dialog.getByRole('radio', { name, exact: true });
    const figures = {};
    const cells = card.locator('dl > div');
    const n = await cells.count();
    for (let i = 0; i < n; i += 1) {
      figures[(await cells.nth(i).locator('dt').innerText()).trim()] = (
        await cells.nth(i).locator('dd').innerText()
      ).trim();
    }
    return figures;
  };
  const out = { tidy: await read('Tidy'), relayout: await read('Re-layout') };
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  return out;
}

async function agreement(node, benchPage, session) {
  const lines = [];
  let agree = true;
  for (const seedName of [node.REFERENCE_SEED, node.FIXTURE_SEED]) {
    // The LIVE plan, read fresh: the corpus's ids are from capture time and the optimiser breaks
    // ties on id, so only this reading is the one the dialog is looking at.
    const planId = session.planIds[seedName];
    const { raw } = await readPlan(session.client, session.slug, { seedName, planId });
    const plan = node.buildCorpusPlan(raw);
    const result = await benchPage.evaluate(
      ([p, o]) => globalThis.relayoutBench.scorePlan(p, o),
      [plan, { budgets: ['seed', 'current'], starts: [0], runs: 1, reverseUpTo: 0 }],
    );
    const productRun =
      PRODUCT === 'm1'
        ? result.variants.find((v) => v.budget === 'current' && v.start === 0)
        : result.today;
    if (!productRun) throw new Error(`no ${PRODUCT} Re-layout run for ${seedName}`);
    const mine = {
      tidy: dialogFigures(result, result.tidy),
      relayout: dialogFigures(result, productRun),
    };
    if (PLANT_ERROR && seedName === node.REFERENCE_SEED) {
      mine.relayout.Crossings = change(
        result.hand.objective.crossings,
        productRun.measure.objective.crossings + 1,
      );
    }
    const theirs = await readDialog(session.page, session.slug, planId);
    for (const card of ['tidy', 'relayout']) {
      const keys = Object.keys(mine[card]);
      // Vacuity: a dialog that showed nothing would "agree" with an empty comparison.
      if (Object.keys(theirs[card]).length !== keys.length) {
        throw new Error(`FC-R0 CONTROL: the ${card} card shows ${JSON.stringify(theirs[card])}`);
      }
      for (const k of keys) {
        const ok = mine[card][k] === theirs[card][k];
        agree &&= ok;
        lines.push(
          `${ok ? 'AGREE   ' : 'DISAGREE'} ${seedName} ${card} ${k}: bench ${mine[card][k]} | dialog ${theirs[card][k]}`,
        );
      }
    }
  }
  return { agree, lines };
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
const node = await bundleNode();
const done = node.selfTest();
say(`Self-test: ${done.length} counter cases agree.`);
// Loading the catalogue reads the conformance fixture from disk, which broke once the bundle
// lived in /tmp; doing it here makes `--self-test` catch a path that only resolves in-repo.
say(`Self-test: ${node.loadSpecs('all').length} catalogue specs load from the bundle.`);
if (has('self-test')) process.exit(0);

let exitCode = 0;
try {
  const bundle = await bundleBrowser();
  let corpus;
  let session = null;
  if (SKIP_CAPTURE) {
    if (!existsSync(CORPUS_PATH))
      throw new Error(`no corpus at ${CORPUS_PATH}; run without --skip-capture`);
    corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  } else {
    await startServers();
    const captured = await capture(node);
    corpus = captured.corpus;
    session = { slug: captured.slug, planIds: captured.planIds };
  }

  const plans = corpus.plans.filter((p) => ONLY.length === 0 || ONLY.includes(p.seedName));
  const { browser, page } = await openBench(bundle);
  let results;
  let agree = null;
  try {
    results = await scoreAll(page, plans);
    if (!SKIP_AGREE && session) {
      const { SeedClient } = await import(
        pathToFileURL(join(REPO, 'packages/seed-http/dist/index.js')).href
      );
      session.client = new SeedClient({ baseUrl: WEB });
      await session.client.authenticate({ email: ACCOUNT.email, password: ACCOUNT.password });
      const ui = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await ui.goto(`${WEB}/sign-in`);
      await ui.getByLabel('Email').fill(ACCOUNT.email);
      await ui.getByLabel('Password').fill(ACCOUNT.password);
      await ui.getByRole('button', { name: /sign in/i }).click();
      await ui.waitForURL(/\/orgs\//, { timeout: 30_000 });
      session.page = ui;
      agree = await agreement(node, page, session);
    }
  } finally {
    await browser.close();
  }

  const tidyDigests = {};
  for (const r of results) {
    if (r.tidy)
      tidyDigests[r.seedName] = sha(
        JSON.stringify([...r.tidy.lanes].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
      );
  }
  if (WRITE_BASELINE) {
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify({ commit, tidy: tidyDigests, today: Object.fromEntries(results.map((r) => [r.seedName, r.today.measure.objective])) }, null, 2)}\n`,
    );
    say(`Baseline written to ${BASELINE_PATH} (commit it).`);
  }
  const baseline = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : null;
  let protectedChanges = null;
  try {
    protectedChanges = execFileSync('git', ['diff', '--name-only', `${BASE_REV}...HEAD`], {
      cwd: REPO,
    })
      .toString()
      .split('\n')
      .filter((f) => f.startsWith('apps/api/') || f.startsWith('packages/layout/src/'));
  } catch {
    protectedChanges = null;
  }

  const verdicts = node.judge({
    plans: results,
    candidate: CANDIDATE,
    baselineTidy: baseline?.tidy ?? null,
    tidyDigests,
    agreement: agree,
    protectedChanges,
  });

  const header = [
    `# Re-layout quality benchmark`,
    '',
    `- commit \`${commit}\`, ${new Date().toISOString()}`,
    `- command: \`node scripts/measure-relayout.mjs ${argv.join(' ')}\``,
    `- candidate ${CANDIDATE.budget}:${CANDIDATE.starts.join(',')}; budgets ${BUDGETS.join(',')}; starts ${STARTS.join(',')}; runs ${RUNS}; product ${PRODUCT}`,
    `- corpus captured ${corpus.capturedAt} at \`${corpus.commit}\`, ${corpus.plans.length} plans, scale plan ${corpus.scaleLeaves} leaves`,
    `- conditions: docs/specs/relayout-quality/conditions.md`,
    '',
  ];
  const md = [
    ...header,
    '## Verdicts',
    '',
    ...verdicts.flatMap((v) => [
      `### ${v.id}: ${v.status}`,
      '',
      ...v.detail.map((d) => `- ${d}`),
      '',
    ]),
    '## Figures',
    '',
    node.table(results, CANDIDATE),
    '',
  ].join('\n');
  const stem = join(OUT_DIR, `relayout-${commit.slice(0, 8)}`);
  writeFileSync(
    `${stem}.json`,
    `${JSON.stringify({ commit, args: argv, verdicts, results }, null, 1)}\n`,
  );
  writeFileSync(`${stem}.md`, md);
  process.stdout.write(`${md}\n`);
  say(`Reports: ${stem}.json and ${stem}.md`);

  if (verdicts.some((v) => v.status === 'FAIL')) exitCode = 1;
} catch (error) {
  say(error instanceof Error ? (error.stack ?? error.message) : String(error));
  exitCode = 1;
} finally {
  stopServers();
}
process.exit(exitCode);
