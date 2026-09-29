#!/usr/bin/env node
/**
 * M0 — is the un-virtualized activities panel actually slow, at 500 and 2,000 activities, against
 * bars committed BEFORE this file existed (`docs/specs/activities-panel-scale/m0-conditions.md`,
 * copied verbatim from the approved spec's §4.8). See that file for the limbs, the bars, the
 * verdict rule and the decision table this harness's output feeds mechanically — nobody re-argues
 * it once the numbers arrive.
 *
 *   node scripts/measure-activities-panel.mjs [--repeats 7] [--quick] [--state <path>]
 *                                             [--base <url>] [--api <url>]
 *                                             [--email <addr>] [--password <pass>]
 *
 * ## It refuses the dev server
 *
 * `--base` must serve the PRODUCTION build. React's development build is not what ships, and a
 * timing taken from it is void (spec §2 Error scenarios). This is checked by inspecting every
 * script tag's `src` for `/@vite/client` after the first navigation; the moment one is found this
 * throws rather than measuring anything.
 *
 * ## Prerequisites (all run by the operator; this file starts none of them)
 *
 *   1. A Postgres the API can reach — `scripts/e2e-local.sh --db-only` matches CI's shape, or any
 *      instance whose `DATABASE_URL` you export before step 2.
 *   2. The API, migrated and running on :3000:
 *        DATABASE_URL=… BETTER_AUTH_SECRET=… CORS_ORIGINS=http://localhost:4173 \
 *          pnpm --filter @repo/api exec nest start
 *      `CORS_ORIGINS` is required, not optional: the API's default trusts only the dev server's
 *      origin (:5173), so Better Auth refuses the preview origin's sign-up with `403 INVALID_ORIGIN`
 *      and the run dies waiting for the onboarding form (found on the first real run, 2026-09-28).
 *      (`nest start --watch` also works; a production `node dist/main.js` after `pnpm --filter
 *      @repo/api build` is closer to what a released image runs, if that distinction matters to
 *      the reading you are taking.)
 *   3. The web app's PRODUCTION build, served on :4173 — NOT `pnpm dev`:
 *        pnpm --filter @repo/web build && pnpm --filter @repo/web preview
 *      `vite preview`'s own proxy forwards `/api/*` to `VITE_API_URL` (default `http://localhost:3000`,
 *      the same default this file's `--api` flag uses for the seed-cli subprocess), so no separate
 *      proxy setup is needed as long as the API from step 2 is on the default port.
 *   4. `packages/seed`, `packages/seed-http` and `packages/types` built (`pnpm --filter @repo/types
 *      --filter @repo/seed --filter @repo/seed-http build`) — this file shells out to
 *      `schedulepoint-seed` (`apps/seed-cli`), which imports their compiled `dist/`.
 *
 * A first, cheap run to prove the wiring before committing to the full 7-repeat sweep (which seeds
 * a 2,000-activity plan and, at the API's DEFAULT 100-requests/60s throttle, costs on the order of
 * forty minutes the first time — the seed-cli's own printed estimate, not a number invented here):
 *
 *   node scripts/measure-activities-panel.mjs --quick
 *
 * `--quick` runs 1 repeat instead of 7, skips the 4x-CPU sensitivity pass and N1's narrow-viewport
 * limb, and — because a run that short cannot be judged — prints every limb `REPORTED_ONLY` rather
 * than a verdict a single repeat cannot support. It still seeds both scale tiers in full: there is
 * no cheaper stand-in for "what does a 2,000-row table actually render", which is the whole
 * question. Set `RATE_LIMIT_LIMIT` to a large value on the API process **for this measuring
 * instance only** (never in a shared or production environment — CLAUDE.md §14, and the seed-cli's
 * own `main.ts` comment on why it does not raise this itself) if forty minutes is more than you
 * want to spend once.
 *
 * ## State and re-runs
 *
 * The org, project and both plans' ids are written to `--state` (default
 * `.tmp/measure-activities-panel-state.json`) after the first successful run. A later invocation
 * reuses them — including the 2,000-activity plan, so a second reading does not re-pay the seeding
 * cost. Delete the file (or pass `--state` pointing somewhere empty) to seed fresh.
 *
 * ## What this file does NOT establish (stated rather than implied — ADR-0128's honesty rule)
 *
 * - It has **never been run**. It was written against the shipped component APIs (every selector
 *   below is grep-verified against `ActivitiesTable.tsx` / `data-table.tsx` / `TsldPanel.tsx` at
 *   the commit this file was committed beside), but a script that automates a real browser has
 *   failure modes no amount of reading catches — see `docs/specs/activities-panel-scale/m0-conditions.md`'s
 *   own "honest limits" for what the READING cannot show even once it exists. Run it with `--quick`
 *   first and read the output before trusting a full sweep.
 * - The container this session runs in cannot serve a display, so `--headed` is not offered — every
 *   run here is headless, and headless Chromium's DOM/layout/scripting cost is close enough to a
 *   real display's for E1/S1/I2/I3 (unlike Canvas 2D rasterisation, ADR-0128 D1) that this file
 *   treats it as usable, but that is REASONED rather than established, which is exactly why the
 *   spread limb and the `INDETERMINATE` verdict exist.
 * - CPU throttling via CDP `Emulation.setCPUThrottlingRate`, scrolling via CDP
 *   `Input.synthesizeScrollGesture`, and attribution via CDP `Performance.getMetrics` (limb A) are
 *   all used here for the first time in this repository. The scroll gesture is wrapped so a
 *   Chromium build without the experimental command falls back to an in-page rAF + `scrollBy`
 *   loop, and the printed environment header says which path ran. `Performance.getMetrics` returns
 *   cumulative counters since `Performance.enable`, never an absolute per-interaction cost, so limb
 *   A is a before/after delta captured on repeat 0 only — see `withAttribution`'s docblock for why
 *   that is a deliberate narrowing (REPORTED_ONLY diagnostics do not need seven repeats) rather than
 *   an oversight.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { judgeLimb, NothingToJudgeError } from './measure-activities-panel.judge.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};
const QUICK = argv.includes('--quick');

const BASE = flag('base', process.env.E2E_BASE_URL ?? 'http://localhost:4173');
const API = flag('api', process.env.MEASURE_API_URL ?? 'http://localhost:3000');
const EMAIL = flag('email', process.env.MEASURE_EMAIL ?? 'apscale@schedulepoint.test');
const PASSWORD = flag('password', process.env.MEASURE_PASSWORD ?? 'correct-horse-battery');
const REPEATS = Number(flag('repeats', QUICK ? '1' : '7'));
const STATE_PATH = resolve(
  flag('state', join(process.cwd(), '.tmp/measure-activities-panel-state.json')),
);

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

// ── Bars, from m0-conditions.md — never re-derived here, only imported by number ───────────────
const BAR_MS = 200; // CWV "good" INP (CLAUDE.md §15) — E1, I2, I3, I4's absolute limb.
const MIN_FPS = { 500: 45, 2000: 30 }; // ADR-0026 §9's floors — S1.

const PANEL_VIEWPORTS = [
  { label: '1646x1097@1.75', width: 1646, height: 1097, deviceScaleFactor: 1.75 },
  { label: '1920x1080@1', width: 1920, height: 1080, deviceScaleFactor: 1 },
];
const OVERFLOW_WIDTHS = [1280, 1646, 1920]; // Limb X — fact only, no verdict.
const NARROW_VIEWPORT = { width: 390, height: 844 };

// ── State (org/project/plan ids), so a re-run does not re-seed 2,000 activities ────────────────
function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

// ── Small formatting helpers ─────────────────────────────────────────────────────────────────
const ms = (n) => `${n.toFixed(1)} ms`;
const fps = (n) => `${n.toFixed(1)} fps`;

/**
 * Chromium headless needs an explicit executable on this session's image — the same lookup every
 * other `measure-*.mjs` in this directory uses.
 */
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];

// ── Auth + org/project setup (browser-driven, so the same session's cookies serve every fetch) ──

/** Sign in if the state names an org already onboarded; otherwise sign up and create one. */
/**
 * Centre a target in its scroller before clicking it. Playwright's own scroll-into-view stops as
 * soon as the element is inside the scrollport, which in the pinned-header table leaves it under
 * the sticky header or on the region's bottom edge, and the click then times out as "intercepted"
 * (the first real run, 2026-09-28). A person clicks what they can see; this puts it where they can.
 */
async function centre(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
}

/** The setup session's cookies, handed to every measuring context (set in `main`). */
let AUTH_STATE;

async function ensureSignedIn(page, state) {
  if (state.orgSlug) {
    await page.goto(`${BASE}/sign-in`);
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/orgs\//, { timeout: 20_000 });
    return state.orgSlug;
  }

  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Activities Panel Scale');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Organisation name').fill(`Activities Panel Scale ${Date.now()}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await page.waitForURL(/\/orgs\/([^/]+)/, { timeout: 20_000 });
  const match = /\/orgs\/([^/]+)/.exec(page.url());
  if (!match?.[1]) throw new Error(`could not read the org slug from ${page.url()}`);
  return match[1];
}

/** POST through the signed-in page's own cookies — the ADR-0066 rule: the public REST API only. */
async function apiPost(page, path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(`/api/v1${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await r.json().catch(() => null);
      return { status: r.status, json };
    },
    { path, body },
  );
}

async function ensureClientAndProject(page, orgSlug, state) {
  if (state.projectId) return { clientId: state.clientId, projectId: state.projectId };

  const client = await apiPost(page, `/organizations/${orgSlug}/clients`, {
    name: 'Activities Panel Scale',
  });
  if (client.status !== 201) {
    throw new Error(`could not create client: ${client.status} ${JSON.stringify(client.json)}`);
  }
  const clientId = client.json.data.id;

  const project = await apiPost(page, `/organizations/${orgSlug}/clients/${clientId}/projects`, {
    name: 'Panel scale',
  });
  if (project.status !== 201) {
    throw new Error(`could not create project: ${project.status} ${JSON.stringify(project.json)}`);
  }
  return { clientId, projectId: project.json.data.id };
}

/**
 * Seed (or reuse) one scale plan via `schedulepoint-seed`, then recalculate it explicitly.
 *
 * Recalculation is NOT left to the seeder: a REUSED plan (this run's second-and-later invocation)
 * skips the seeder's own recalculate entirely, and `m0-conditions.md`'s non-vacuity refusal exists
 * for exactly that case (spec §2 Error scenarios — "the scale tier lands uncalculated").
 */
function seedScalePlan({ orgSlug, projectId, activities }) {
  const seedName = `scale-${String(activities)}`;
  const out = join(tmpdir(), `sp-seed-${seedName}-${String(Date.now())}.json`);
  console.error(
    `Seeding ${seedName} (schedulepoint-seed --tier scale --activities ${String(activities)})…`,
  );
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@repo/seed-cli',
      'seed',
      '--',
      '--url',
      API,
      '--org',
      orgSlug,
      '--project',
      projectId,
      '--email',
      EMAIL,
      '--password',
      PASSWORD,
      '--tier',
      'scale',
      '--activities',
      String(activities),
      '--out',
      out,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  const report = JSON.parse(readFileSync(out, 'utf8'));
  const plan = report.plans.find((p) => p.seedName === seedName);
  if (!plan) throw new Error(`seed report has no ${seedName} plan: ${JSON.stringify(report)}`);
  if (plan.planId === null && !plan.alreadyExists) {
    throw new Error(`seeding ${seedName} failed: ${JSON.stringify(plan)}`);
  }
  return plan;
}

async function recalculate(page, orgSlug, planId) {
  const result = await apiPost(
    page,
    `/organizations/${orgSlug}/plans/${planId}/schedule/recalculate`,
    {},
  );
  if (result.status >= 300) {
    throw new Error(
      `recalculate ${planId} failed: ${result.status} ${JSON.stringify(result.json)}`,
    );
  }
}

/**
 * The plan's true activity count from the API's own list — leaves AND WBS summaries, which is
 * what the table renders. The non-vacuity check (spec §2: "rendered row count ≠ plan row count")
 * compares against THIS, never against the `--activities` leaf count seed-cli was given, because a
 * scale plan's summaries are additional rows the table also renders.
 */
/* eslint-disable no-undef -- this callback runs in the PAGE, whose globals are `fetch`/`URL`/`location`. */
async function activityCount(page, orgSlug, planId) {
  return page.evaluate(
    async ({ orgSlug, planId }) => {
      let total = 0;
      let cursor;
      for (;;) {
        const url = new URL(
          `/api/v1/organizations/${orgSlug}/plans/${planId}/activities`,
          location.origin,
        );
        // 100 is the API's page ceiling (`common/dto/pagination-query.dto.ts` `@Max(100)`); 200 was
        // refused with a 422 on the first real run, and `body.data` was undefined.
        url.searchParams.set('limit', '100');
        if (cursor) url.searchParams.set('cursor', cursor);
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) throw new Error(`activity list ${String(r.status)}: ${await r.text()}`);
        const body = await r.json();
        total += body.data.length;
        cursor = body.meta?.nextCursor ?? null;
        if (!cursor) break;
      }
      return total;
    },
    { orgSlug, planId },
  );
}
/* eslint-enable no-undef */

// ── Browser-side probes (serialised into the page — `document`/`window` are the PAGE's globals) ─
/* eslint-disable no-undef */

/** Refuses a dev-server build. Checked once per navigation. */
function findsDevClient() {
  return [...document.scripts].some((s) => s.src.includes('/@vite/client'));
}

/**
 * Non-vacuity: the table REPRESENTS every row, and the schedule has actually run.
 *
 * **Changed for M3 (ADR-0165), 2026-09-29.** Before windowing "represents" meant "renders": every
 * activity was a `<tr>`. A windowed table renders ~50 rows and declares the rest through
 * `aria-rowcount` (header + rows) with `aria-hidden` spacer rows around the window, so the check reads
 * the declared count when present and excludes spacers from what it counts. The bars and the verdict
 * rule are untouched; only this probe learnt the new shape, and without the change every M3 run would
 * throw on repeat 0.
 */
function nonVacuityProbe() {
  const table = document.querySelector('table');
  const bodyRows = table ? [...table.querySelectorAll('tbody tr:not([aria-hidden="true"])')] : [];
  const declared = Number(table?.getAttribute('aria-rowcount'));
  const rowsRendered = Number.isFinite(declared) && declared > 0 ? declared - 1 : bodyRows.length;
  const headers = table
    ? [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    : [];
  const floatColumnIndex = headers.indexOf('Float left');
  const floatCells =
    floatColumnIndex === -1
      ? []
      : bodyRows.map((tr) => tr.children[floatColumnIndex]?.textContent?.trim());
  return {
    rowsRendered,
    rowsInDom: bodyRows.length,
    floatColumnFound: floatColumnIndex !== -1,
    allFloatCellsDash: floatCells.length > 0 && floatCells.every((c) => c === '—'),
  };
}

/** Region horizontal overflow (limb X) — a fact, not a verdict. */
function overflowProbe() {
  const region = document.querySelector('[role="region"][aria-label="Activities"]');
  if (!region) return null;
  return { scrollWidth: region.scrollWidth, clientWidth: region.clientWidth };
}

/* eslint-enable no-undef */

/**
 * Run an interaction once, and read back the Event Timing `duration` it produced.
 *
 * `durationThreshold: 16` is the API's own floor (below it an interaction is not reported at all —
 * `m0-conditions.md`'s "a missing entry is recorded as < 16 ms, never as 0"), so a `null` result
 * here means exactly that, and the caller substitutes 15 (a value that is honestly `< 16` and
 * cannot itself be mistaken for a real measured duration at the 16 ms boundary).
 */
/* eslint-disable no-undef -- the `page.evaluate` callbacks below run in the PAGE, not in Node. */
async function measureEventTiming(page, act) {
  await page.evaluate(() => {
    window.__spEntries = [];
    window.__spObserver?.disconnect();
    window.__spObserver = new PerformanceObserver((list) => {
      window.__spEntries.push(...list.getEntries().map((e) => e.duration));
    });
    window.__spObserver.observe({ type: 'event', durationThreshold: 16, buffered: false });
  });
  await act();
  // Event Timing entries can arrive a little after the interaction settles (they wait for the
  // next paint plus processing); this is comfortably inside CLAUDE.md §15's own 200 ms budget.
  await page.waitForTimeout(300);
  const durations = await page.evaluate(() => window.__spEntries ?? []);
  return durations.length > 0 ? Math.max(...durations) : null;
}
/* eslint-enable no-undef */

/** CPU throttle via CDP. `1` is untouched; anything else is a rate Chromium slows scripts by. */
async function setCpu(session, rate) {
  await session.send('Emulation.setCPUThrottlingRate', { rate });
}

/**
 * Limb A — attribution. `Performance.getMetrics` returns CUMULATIVE counters since the domain was
 * enabled, so a per-limb figure is a before/after delta around one interaction, never the absolute
 * value. `REPORTED_ONLY` throughout (m0-conditions.md: "it chooses the remedy family, and never a
 * verdict") — it exists to say whether a slow limb is script, layout or style-recalc bound, which
 * decides M2 (render isolation, a script-cost fix) versus M3 (windowing, a layout-cost fix), not to
 * be judged against a bar of its own.
 *
 * Captured on **repeat 0 only**, for E1/S1/I2/I3/I4 — not every repeat, because seven CDP snapshots
 * a limb buys no diagnostic value a `REPORTED_ONLY` breakdown does not already have from one, and
 * the non-vacuity checks that gate repeat 0 already make it the repeat most worth trusting.
 */
async function getPerfMetrics(session) {
  const { metrics } = await session.send('Performance.getMetrics');
  const map = {};
  for (const m of metrics) map[m.name] = m.value;
  return map;
}
const ATTRIBUTION_KEYS = ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
function diffPerfMetrics(before, after) {
  const out = {};
  for (const key of ATTRIBUTION_KEYS) out[key] = (after[key] ?? 0) - (before[key] ?? 0);
  return out;
}
/** Wrap one interaction with a before/after `Performance.getMetrics` delta (seconds, CDP's unit). */
async function withAttribution(session, act) {
  const before = await getPerfMetrics(session);
  const result = await act();
  const after = await getPerfMetrics(session);
  return { result, attribution: diffPerfMetrics(before, after) };
}

/**
 * Scroll the region for ~3s and report mean fps / dropped-frame % from requestAnimationFrame
 * intervals. Tries the experimental CDP gesture first; on any failure it falls back to an in-page
 * rAF + `scrollBy` loop, and the caller is told which path ran.
 */
/* eslint-disable no-undef -- the `page.evaluate` callbacks below run in the PAGE, not in Node. */
async function measureScroll(page, session, regionSelector) {
  const box = await page.locator(regionSelector).boundingBox();
  if (!box) throw new Error(`scroll region ${regionSelector} has no bounding box`);

  const startRaf = await page.evaluate(() => {
    window.__spFrames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__spFrames.push(t - last);
      last = t;
      if (window.__spScrolling) requestAnimationFrame(tick);
    };
    window.__spScrolling = true;
    requestAnimationFrame(tick);
    return true;
  });
  if (!startRaf) throw new Error('could not start the rAF sampler');

  let usedGesture = true;
  try {
    await session.send('Input.synthesizeScrollGesture', {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      xDistance: 0,
      yDistance: -2000,
      repeatCount: 6,
      repeatDelayMs: 250,
      speed: 2000,
    });
  } catch (error) {
    usedGesture = false;
    console.error(`  (Input.synthesizeScrollGesture unavailable, falling back: ${error.message})`);
    await page.evaluate(
      async ({ selector }) => {
        const el = document.querySelector(selector);
        const deadline = performance.now() + 3000;
        const step = () => {
          el.scrollBy(0, 24);
          if (performance.now() < deadline) requestAnimationFrame(step);
        };
        await new Promise((resolveStep) => {
          requestAnimationFrame(() => {
            step();
            setTimeout(resolveStep, 3000);
          });
        });
      },
      { selector: regionSelector },
    );
  }

  await page.evaluate(() => {
    window.__spScrolling = false;
  });
  await page.waitForTimeout(100);
  const intervals = await page.evaluate(() => window.__spFrames ?? []);
  const dropped = intervals.filter((i) => i > 16.7 * 1.5).length;
  const meanInterval = intervals.length
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : NaN;
  return {
    fps: Number.isFinite(meanInterval) && meanInterval > 0 ? 1000 / meanInterval : NaN,
    droppedPct: intervals.length ? (dropped / intervals.length) * 100 : NaN,
    usedGesture,
  };
}
/* eslint-enable no-undef */

// ── One plan, one viewport: run every limb REPEATS times ───────────────────────────────────────

async function measurePlan({ browser, orgSlug, planId, expectedRowCount, viewport, cpuRate }) {
  const context = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable'); // limb A — required before any getMetrics call.
  if (cpuRate !== 1) await setCpu(session, cpuRate);

  const results = { E1: [], S1_fps: [], I2: [], I3: [], I4: [], I4_collapsed: [] };
  const attribution = {}; // limb A, repeat 0 only — see `withAttribution`'s docblock.
  let rowsRendered = null;

  try {
    await page.goto(`${BASE}/orgs/${orgSlug}/plans/${planId}`);
    if (await page.evaluate(findsDevClient)) {
      throw new Error(
        `${BASE} served the DEV client (/@vite/client) — this must be a PRODUCTION build. ` +
          "See this file's header for the required `pnpm --filter @repo/web build && preview` step.",
      );
    }
    await page.waitForLoadState('networkidle');

    for (let repeat = 0; repeat < REPEATS; repeat += 1) {
      const captureAttribution = repeat === 0;

      // ── E1: expand ──────────────────────────────────────────────────────────────────────────
      const collapseBtn = page.getByRole('button', { name: 'Collapse activities panel' });
      if (await collapseBtn.isVisible().catch(() => false)) {
        await collapseBtn.click();
        await page.getByRole('button', { name: 'Expand activities panel' }).waitFor();
      }
      const e1Act = () =>
        measureEventTiming(page, () =>
          page.getByRole('button', { name: 'Expand activities panel' }).click(),
        );
      const expandDuration = captureAttribution
        ? await withAttribution(session, e1Act).then(({ result, attribution: a }) => {
            attribution.E1 = a;
            return result;
          })
        : await e1Act();
      results.E1.push(expandDuration ?? 15);
      await page.getByRole('table').waitFor({ timeout: 10_000 });

      if (repeat === 0) {
        // Wait for the list to finish loading before judging it. At 4x CPU the probe used to run
        // while the activity list was still arriving and counted 3 rows of 2,160, which aborted both
        // the M0 run and the first M3 run before their 1920 passes (m0-measurement.md, "What stopped
        // the run"). A timeout here still falls through to the probe, which then throws as before.
        await page
          .waitForFunction(
            (expected) => {
              const table = document.querySelector('table');
              const declared = Number(table?.getAttribute('aria-rowcount'));
              const n =
                Number.isFinite(declared) && declared > 0
                  ? declared - 1
                  : (table?.querySelectorAll('tbody tr:not([aria-hidden="true"])').length ?? 0);
              return n === expected;
            },
            expectedRowCount,
            { timeout: 120_000 },
          )
          .catch(() => undefined);
        const probe = await page.evaluate(nonVacuityProbe);
        rowsRendered = probe.rowsRendered;
        if (rowsRendered !== expectedRowCount) {
          throw new Error(
            `NON-VACUITY FAILED — the table rendered ${String(rowsRendered)} rows, the plan's ` +
              `activity list holds ${String(expectedRowCount)}. This is not a table of every ` +
              'activity, so it cannot be the thing this harness exists to measure.',
          );
        }
        if (!probe.floatColumnFound) {
          throw new Error('NON-VACUITY FAILED — no "Float left" column was found.');
        }
        if (probe.allFloatCellsDash) {
          throw new Error(
            'NON-VACUITY FAILED — every "Float left" cell reads "—": the plan has not been ' +
              'recalculated, so this would measure a cheaper (empty) table than a real one.',
          );
        }
      }

      // ── S1: scroll ──────────────────────────────────────────────────────────────────────────
      const s1Act = () => measureScroll(page, session, '[role="region"][aria-label="Activities"]');
      const scroll = captureAttribution
        ? await withAttribution(session, s1Act).then(({ result, attribution: a }) => {
            attribution.S1 = a;
            return result;
          })
        : await s1Act();
      results.S1_fps.push(scroll.fps);

      // ── I2: checkbox toggle at row ≈ N/2 ────────────────────────────────────────────────────
      const checkboxes = page.getByRole('checkbox', { name: /^Select / });
      const checkboxCount = await checkboxes.count();
      if (checkboxCount > 0) {
        const mid = checkboxes.nth(Math.floor(checkboxCount / 2));
        await centre(mid);
        const i2Act = () => measureEventTiming(page, () => mid.click());
        const d = captureAttribution
          ? await withAttribution(session, i2Act).then(({ result, attribution: a }) => {
              attribution.I2 = a;
              return result;
            })
          : await i2Act();
        results.I2.push(d ?? 15);
        // Toggle back, so the next repeat starts from the same state. Re-centred first: the first
        // click opened the bulk-assign bar above the table, which moved the row.
        await centre(mid);
        await mid.click();
      }

      // ── I3: row menu at row ≈ N/2 ────────────────────────────────────────────────────────────
      const menuButtons = page.getByRole('button', { name: /^Actions for / });
      const menuCount = await menuButtons.count();
      if (menuCount > 0) {
        const midMenu = menuButtons.nth(Math.floor(menuCount / 2));
        await centre(midMenu);
        const i3Act = () => measureEventTiming(page, () => midMenu.click());
        const d = captureAttribution
          ? await withAttribution(session, i3Act).then(({ result, attribution: a }) => {
              attribution.I3 = a;
              return result;
            })
          : await i3Act();
        results.I3.push(d ?? 15);
        await page.keyboard.press('Escape');
      }

      // ── I4: canvas selection, panel expanded, with a collapsed control ─────────────────────
      const listbox = page.getByRole('listbox', { name: 'Activities in the diagram' });
      await listbox.focus();
      const i4Act = () => measureEventTiming(page, () => page.keyboard.press('ArrowDown'));
      const expandedD = captureAttribution
        ? await withAttribution(session, i4Act).then(({ result, attribution: a }) => {
            attribution.I4 = a;
            return result;
          })
        : await i4Act();
      results.I4.push(expandedD ?? 15);

      await collapseBtn.click().catch(() => undefined);
      await listbox.focus();
      const collapsedD = await measureEventTiming(page, () => page.keyboard.press('ArrowDown'));
      results.I4_collapsed.push(collapsedD ?? 15);
    }
  } finally {
    await context.close();
  }

  return { results, rowsRendered, attribution };
}

async function measureOverflow(browser, orgSlug, planId) {
  const facts = {};
  for (const width of OVERFLOW_WIDTHS) {
    const context = await browser.newContext({
      storageState: AUTH_STATE,
      viewport: { width, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/orgs/${orgSlug}/plans/${planId}`);
    await page.waitForLoadState('networkidle');
    const collapseBtn = page.getByRole('button', { name: 'Collapse activities panel' });
    if (!(await collapseBtn.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Expand activities panel' }).click();
    }
    await page.getByRole('table').waitFor({ timeout: 10_000 });
    facts[width] = await page.evaluate(overflowProbe);
    await context.close();
  }
  return facts;
}

/** N1: total long-task time while the narrow single-pane workspace opens with the hidden pane mounted. */
/* eslint-disable no-undef -- `addInitScript`/`evaluate` callbacks below run in the PAGE. */
async function measureNarrowOpen(browser, orgSlug, planId) {
  const context = await browser.newContext({ storageState: AUTH_STATE, viewport: NARROW_VIEWPORT });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__spLongTasks = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__spLongTasks += entry.duration;
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      window.__spLongTasks = null; // longtask unsupported — recorded as such, never as 0.
    }
  });
  await page.goto(`${BASE}/orgs/${orgSlug}/plans/${planId}`);
  await page.waitForLoadState('networkidle');
  const total = await page.evaluate(() => window.__spLongTasks);
  await context.close();
  return total;
}
/* eslint-enable no-undef */

// ── Main ─────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const state = loadState();
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

  const setupPage = await (await browser.newContext()).newPage();
  const orgSlug = await ensureSignedIn(setupPage, state);
  // Every measuring context below is a fresh `newContext()`, which starts with no cookies. Without
  // the setup session's storage it lands on /sign-in and waits for a panel that is not there (the
  // first real run's failure, 2026-09-28), so the signed-in state is handed to each one.
  AUTH_STATE = await setupPage.context().storageState();
  const { clientId, projectId } = await ensureClientAndProject(setupPage, orgSlug, state);
  state.orgSlug = orgSlug;
  state.clientId = clientId;
  state.projectId = projectId;
  saveState(state);

  const scaleActivities = [500, 2000];
  const plans = {};
  const rowCounts = {};
  for (const activities of scaleActivities) {
    const key = `plan${String(activities)}`;
    if (state[key]) {
      plans[activities] = state[key];
    } else {
      const seeded = seedScalePlan({ orgSlug, projectId, activities });
      plans[activities] = seeded.planId;
      state[key] = seeded.planId;
      saveState(state);
    }
    await recalculate(setupPage, orgSlug, plans[activities]);
    // The plan's list length (leaves + WBS summaries) is what the table renders — NOT the
    // `--activities` leaf count seed-cli was given, which a scale plan's summaries sit on top of.
    rowCounts[activities] = await activityCount(setupPage, orgSlug, plans[activities]);
  }

  const chromiumVersion = browser.version();
  const hardwareConcurrency = await setupPage.evaluate(() => navigator.hardwareConcurrency);
  await setupPage.context().close();

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    // Not a git checkout (or git is unavailable) — recorded as "unknown" rather than guessed.
  }

  console.log('');
  console.log('M0 — activities panel at plan scale');
  console.log(`  commit               ${commit}`);
  console.log(`  chromium             ${chromiumVersion} (headless)`);
  console.log(`  hardwareConcurrency  ${String(hardwareConcurrency)}`);
  console.log(`  base                 ${BASE}`);
  console.log(
    `  repeats              ${String(REPEATS)}${QUICK ? '  (--quick: REPORTED_ONLY throughout)' : ''}`,
  );
  console.log('');

  const cpuRates = QUICK ? [1] : [1, 4];
  const output = {
    commit,
    chromium: chromiumVersion,
    hardwareConcurrency,
    base: BASE,
    repeats: REPEATS,
    quick: QUICK,
    runs: [],
  };

  for (const activities of scaleActivities) {
    const planId = plans[activities];
    console.log(`## scale-${String(activities)} (plan ${planId})`);
    for (const viewport of PANEL_VIEWPORTS) {
      for (const cpuRate of cpuRates) {
        const gated = !QUICK && cpuRate === 1;
        console.log(
          `  — ${viewport.label} @ ${String(cpuRate)}x CPU ${gated ? '(judged)' : '(reported only)'}`,
        );
        const { results, rowsRendered, attribution } = await measurePlan({
          browser,
          orgSlug,
          planId,
          expectedRowCount: rowCounts[activities],
          viewport,
          cpuRate,
        });

        const printLimb = (label, values, bar, direction) => {
          let judged;
          try {
            judged = judgeLimb({ values, bar, direction, gated });
          } catch (error) {
            if (error instanceof NothingToJudgeError) {
              console.log(`    ${label}  ${error.message}`);
              return { label, error: error.message };
            }
            throw error;
          }
          console.log(
            `    ${label}  median ${direction === 'max' ? ms(judged.median) : fps(judged.median)}  ` +
              `[${direction === 'max' ? ms(judged.min) : fps(judged.min)}, ` +
              `${direction === 'max' ? ms(judged.max) : fps(judged.max)}]  ` +
              `bar ${String(judged.bar)}${direction === 'max' ? 'ms' : 'fps'}  ${judged.verdict}` +
              (judged.indeterminateReason ? `\n      — ${judged.indeterminateReason}` : ''),
          );
          // The repeats in order, so an outlier can be placed (repeat 0 also carries limb A's CDP
          // capture). Printed, never judged.
          console.log(`      repeats: ${values.map((v) => String(v)).join(', ')}`);
          return { label, ...judged, values };
        };

        const limbBar = MIN_FPS[activities] ?? MIN_FPS[2000];
        const e1 = printLimb('E1 expand              ', results.E1, BAR_MS, 'max');
        const s1 = printLimb('S1 scroll              ', results.S1_fps, limbBar, 'min');
        const i2 = printLimb('I2 checkbox            ', results.I2, BAR_MS, 'max');
        const i3 = printLimb('I3 row menu            ', results.I3, BAR_MS, 'max');
        const i4 = printLimb('I4 select (expanded)   ', results.I4, BAR_MS, 'max');
        // The collapsed run is the CONTROL and never gated — spec §4.8: "the delta is reported as
        // the panel's tax", `REPORTED_ONLY` regardless of CPU rate.
        let i4Collapsed;
        try {
          i4Collapsed = judgeLimb({
            values: results.I4_collapsed,
            bar: BAR_MS,
            direction: 'max',
            gated: false,
          });
        } catch (error) {
          if (!(error instanceof NothingToJudgeError)) throw error;
          i4Collapsed = null;
        }
        const i4Delta = i4 && !i4.error && i4Collapsed ? i4.median - i4Collapsed.median : null;
        console.log(
          `    I4 select (collapsed, control)  median ${
            i4Collapsed ? ms(i4Collapsed.median) : 'n/a'
          }  REPORTED_ONLY` +
            (i4Delta === null ? '' : `\n      panel's tax (expanded − collapsed): ${ms(i4Delta)}`),
        );

        // ── A: attribution (REPORTED_ONLY, repeat 0) — chooses a remedy family, never a verdict ──
        console.log(
          '    A attribution (repeat 0, seconds; REPORTED_ONLY — chooses the remedy family)',
        );
        for (const [limb, deltas] of Object.entries(attribution)) {
          console.log(
            `      ${limb}  ` +
              ATTRIBUTION_KEYS.map((k) => `${k} ${deltas[k].toFixed(4)}`).join('  '),
          );
        }

        output.runs.push({
          activities,
          viewport: viewport.label,
          cpuRate,
          rowsRendered,
          E1: e1,
          S1: s1,
          I2: i2,
          I3: i3,
          I4: i4,
          I4_collapsedControl: i4Collapsed,
          I4_tax_ms: i4Delta,
          A_attribution: attribution,
        });
        console.log('');
      }
    }

    if (!QUICK) {
      console.log('  — N1 narrow open (390x844), REPORTED_ONLY');
      const n1 = await measureNarrowOpen(browser, orgSlug, planId);
      console.log(`    total long-task time: ${n1 === null ? 'longtask unsupported' : ms(n1)}`);
      output.runs.push({ activities, limb: 'N1', longTaskMs: n1 });
      console.log('');
    }
  }

  console.log('## X — horizontal overflow (fact, not a verdict)');
  // Measured once, on the larger plan — the region's own width does not depend on row count.
  const overflow = await measureOverflow(browser, orgSlug, plans[2000]);
  for (const [width, fact] of Object.entries(overflow)) {
    console.log(
      `  ${width}px  ${
        fact
          ? `scrollWidth ${String(fact.scrollWidth)} / clientWidth ${String(fact.clientWidth)} — ` +
            `${fact.scrollWidth > fact.clientWidth ? 'OVERFLOWS' : 'fits'}`
          : 'region not found'
      }`,
    );
  }
  output.overflow = overflow;

  await browser.close();

  console.log('');
  console.log('--- paste-ready JSON for m0-measurement.md -------------------------------------');
  console.log(JSON.stringify(output, null, 1));
}

main().catch((error) => {
  console.error('');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
