import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { writeReading } from './output';
import { MIN_RUNS, summarise, type Summary } from './stats';

/**
 * **M0-T5 — the route code-splitting epic's P2 baseline, taken in the build container**
 * (`docs/specs/route-code-splitting/`, spec P2, CQ-4).
 *
 * Four paths, each timed `ROUTE_SPLIT_RUNS` times (default 7, never fewer than 5) against the
 * **production build**, under CDP network throttling:
 *
 * - `signInCold` — `/sign-in` in a fresh context (empty cache). P2: must improve by >= 10%.
 * - `planDeepLinkCold` — a bookmarked plan URL in a fresh, signed-in context. P2: must not regress
 *   by more than 10%.
 * - `planDeepLinkWarm` — the same URL visited a second time in one context, so the HTTP cache is
 *   primed. P2's "warm first-plan-open", not to regress by more than 5%.
 * - `planInApp` — from the organisation home, click through Clients -> client -> project -> plan.
 *   Timed from the first click to the diagram's ruler being visible, so it includes every screen a
 *   later split makes lazy. P3 and CQ-2's in-app 5% figure read this.
 *
 * **Re-run it unchanged after M1-M3** with a different `ROUTE_SPLIT_LABEL` (default `baseline`) and
 * compare the two JSON files. The harness reports numbers and spread; it deliberately does **not**
 * compute a verdict. The rule is the spec's: INDETERMINATE, not PASS, whenever `spreadPct` is
 * greater than or equal to the effect being judged.
 *
 * **What this is not.** It measures the container, not a planner's hardware (ADR-0128's warning),
 * and a container is the class of machine ADR-0127 D8 recorded as unreliable. Throttling is applied
 * to the measured page only; seeding runs unthrottled. `vite preview` may revalidate hashed assets
 * where nginx would serve them `immutable`, so the warm path is conservative: per-run request counts
 * and transfer bytes are recorded so a reader can see which it was.
 *
 * **LCP caveat.** The browser finalises LCP at first input or page hide, so the figure is the last
 * candidate seen after the page settled (`SETTLE_MS`), not a final value. On plan paths the LCP
 * element is not the diagram, so `readyMs` — when the ruler is visible — is the figure that means
 * "the plan is open".
 *
 * A harness, not a gate: it writes JSON and markdown to `measure-output/` and fails nothing except
 * on an empty or short population.
 */

/** Lighthouse's simulated 4G: 1.6 Mbps down, 750 kbps up, 150 ms round trip. */
const THROTTLE = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
} as const;

const VIEWPORT = { width: 1646, height: 1080 };
const SETTLE_MS = 1_500;
const RUNS = Math.max(Number(process.env.ROUTE_SPLIT_RUNS ?? '7'), MIN_RUNS);
const LABEL = process.env.ROUTE_SPLIT_LABEL ?? 'baseline';

interface Reading {
  /** Last `largest-contentful-paint` candidate, ms from navigation start (null: none observed). */
  lcpMs: number | null;
  fcpMs: number | null;
  /** When the screen's own readiness marker was visible, ms from the run's start. */
  readyMs: number;
  jsRequests: number;
  jsTransferBytes: number;
  allRequests: number;
  allTransferBytes: number;
}

interface Seeded {
  orgSlug: string;
  planUrl: string;
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>;
}

/** Installed in every document so LCP and FCP are observed from the first byte, not after load. */
const OBSERVERS = `
  window.__m = { lcp: null, fcp: null };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__m.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime;
  }).observe({ type: 'paint', buffered: true });
`;

async function throttledPage(context: BrowserContext): Promise<Page> {
  await context.addInitScript(OBSERVERS);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', THROTTLE);
  return page;
}

/** Sign up, create an organisation, a hierarchy and a seeded plan — unthrottled. */
async function seed(browser: Browser): Promise<Seeded> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const stamp = Date.now();
  const orgSlug = `split-co-${String(stamp)}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Split Tester');
  await page.getByLabel('Email').fill(`split-${String(stamp)}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Split Co ${String(stamp)}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Programme');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-03-02');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Programme', exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
  const planUrl = page.url();
  const planId = /\/plans\/([0-9a-f-]{36})/.exec(planUrl)?.[1];
  if (!planId) throw new Error(`no plan id in ${planUrl}`);

  // A plan with bars, so the diagram has something to paint. Needs the pen only for the UI; the
  // API accepts the request from the signed-in session as the other harnesses' seeders do.
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  const failures = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const bad: string[] = [];
      for (let lane = 0; lane < 12; lane += 1) {
        const res = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: `Activity ${String(lane + 1)}`,
            type: 'TASK',
            durationDays: 3,
            laneIndex: lane,
          }),
        });
        if (!res.ok) bad.push(`${String(res.status)} ${await res.text()}`);
      }
      const recalc = await fetch(`/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!recalc.ok) bad.push(`recalculate: ${String(recalc.status)}`);
      return bad;
    },
    { org: orgSlug, id: planId },
  );
  if (failures.length > 0) throw new Error(`seeding rejected: ${failures.join('; ')}`);
  await page.reload();
  await expect(page.getByTestId('tsld-ruler')).toBeVisible();

  const storageState = await context.storageState();
  await context.close();
  return { orgSlug, planUrl, storageState };
}

/** Read the observers and the resource timeline, counting only requests started after `since`. */
async function collect(page: Page, readyMs: number, since: number): Promise<Reading> {
  await page.waitForTimeout(SETTLE_MS);
  const raw = await page.evaluate((from: number) => {
    const m = (window as unknown as { __m: { lcp: number | null; fcp: number | null } }).__m;
    const res = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(
      (e) => e.startTime >= from,
    );
    const js = res.filter((e) =>
      /\.m?js(\?|$)/.test(new URL(e.name).pathname + new URL(e.name).search),
    );
    const sum = (xs: PerformanceResourceTiming[]) => xs.reduce((n, e) => n + e.transferSize, 0);
    return {
      lcp: m.lcp,
      fcp: m.fcp,
      jsRequests: js.length,
      jsBytes: sum(js),
      allRequests: res.length,
      allBytes: sum(res),
    };
  }, since);
  return {
    lcpMs: raw.lcp,
    fcpMs: raw.fcp,
    readyMs,
    jsRequests: raw.jsRequests,
    jsTransferBytes: raw.jsBytes,
    allRequests: raw.allRequests,
    allTransferBytes: raw.allBytes,
  };
}

const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());

async function signInCold(browser: Browser): Promise<Reading> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    const page = await throttledPage(context);
    await page.goto('/sign-in');
    await page.getByLabel('Email').waitFor({ state: 'visible' });
    return await collect(page, await now(page), 0);
  } finally {
    await context.close();
  }
}

async function planDeepLink(browser: Browser, seeded: Seeded, warm: boolean): Promise<Reading> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    storageState: seeded.storageState,
  });
  try {
    const page = await throttledPage(context);
    if (warm) {
      await page.goto(seeded.planUrl);
      await expect(page.getByTestId('tsld-ruler')).toBeVisible({ timeout: 120_000 });
      // Navigate away so the second visit is a fresh document load, not a reload that revalidates.
      await page.goto('about:blank');
    }
    await page.goto(seeded.planUrl);
    await page.getByTestId('tsld-ruler').waitFor({ state: 'visible', timeout: 120_000 });
    return await collect(page, await now(page), 0);
  } finally {
    await context.close();
  }
}

async function planInApp(browser: Browser, seeded: Seeded): Promise<Reading> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    storageState: seeded.storageState,
  });
  try {
    const page = await throttledPage(context);
    await page.goto(`/orgs/${seeded.orgSlug}`);
    await page.getByRole('link', { name: 'Clients', exact: true }).waitFor({ state: 'visible' });
    const t0 = await now(page);
    await page.getByRole('link', { name: 'Clients', exact: true }).click();
    await page.getByRole('link', { name: 'Northgate' }).click();
    await page.getByRole('link', { name: 'Riverside' }).click();
    await page.getByRole('link', { name: 'Programme', exact: true }).click();
    await page.getByTestId('tsld-ruler').waitFor({ state: 'visible', timeout: 120_000 });
    return await collect(page, (await now(page)) - t0, t0);
  } finally {
    await context.close();
  }
}

function column(
  readings: readonly Reading[],
  pick: (r: Reading) => number | null,
  label: string,
): Summary {
  const values = readings.map(pick);
  const present = values.filter((v): v is number => v !== null);
  if (present.length !== values.length) {
    throw new Error(`${label}: ${String(values.length - present.length)} run(s) observed no value`);
  }
  return summarise(label, present);
}

test('P2 baseline — four paths, repeat runs, spread reported', async ({ browser }) => {
  test.setTimeout(1_200_000);
  const seeded = await seed(browser);

  const paths: Record<string, (b: Browser) => Promise<Reading>> = {
    signInCold: (b) => signInCold(b),
    planDeepLinkCold: (b) => planDeepLink(b, seeded, false),
    planDeepLinkWarm: (b) => planDeepLink(b, seeded, true),
    planInApp: (b) => planInApp(b, seeded),
  };

  const results: Record<
    string,
    { runs: Reading[]; readyMs: Summary; lcpMs?: Summary; jsRequests: Summary }
  > = {};
  for (const [name, run] of Object.entries(paths)) {
    const runs: Reading[] = [];
    for (let i = 0; i < RUNS; i += 1) runs.push(await run(browser));
    results[name] = {
      runs,
      readyMs: column(runs, (r) => r.readyMs, `${name}.readyMs`),
      // LCP is reported where the path is a document load; the in-app path has no new navigation,
      // so its candidate is not the thing being timed.
      ...(name === 'planInApp' ? {} : { lcpMs: column(runs, (r) => r.lcpMs, `${name}.lcpMs`) }),
      jsRequests: column(runs, (r) => r.jsRequests, `${name}.jsRequests`),
    };
  }

  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty =
    execFileSync('git', ['status', '--porcelain', '--', '../../apps', '../../packages'], {
      encoding: 'utf8',
    }).trim() !== '';
  const machine = {
    platform: `${platform()} ${release()}`,
    cpus: `${String(cpus().length)} x ${cpus()[0]?.model ?? 'unknown'}`,
    memoryGiB: Math.round(totalmem() / 1024 ** 3),
    chromium: browser.version(),
    viewport: VIEWPORT,
    throttle: THROTTLE,
    settleMs: SETTLE_MS,
  };
  const document = {
    label: LABEL,
    buildSha: sha,
    workingTreeDirty: dirty,
    takenAt: new Date().toISOString(),
    runsPerPath: RUNS,
    machine,
    caveat:
      'Container reading, not a planner machine. The verdict is INDETERMINATE whenever spreadPct is >= the effect judged (spec P2).',
    paths: results,
  };
  const name = `route-splitting-${LABEL}`;
  const jsonPath = writeReading(name, 'json', JSON.stringify(document, null, 2));

  const f = (n: number): string => n.toFixed(0);
  const rows = Object.entries(results).map(([path, r]) => {
    const lcp = r.lcpMs
      ? `${f(r.lcpMs.median)} (${f(r.lcpMs.min)}-${f(r.lcpMs.max)}, ${r.lcpMs.spreadPct.toFixed(1)}%)`
      : 'n/a';
    return `| ${path} | ${f(r.readyMs.median)} (${f(r.readyMs.min)}-${f(r.readyMs.max)}, ${r.readyMs.spreadPct.toFixed(1)}%) | ${lcp} | ${f(r.jsRequests.median)} |`;
  });
  const markdown = [
    `# Route splitting timing — ${LABEL}`,
    '',
    `Build \`${sha}\`${dirty ? ' (working tree dirty)' : ''}, ${machine.cpus}, ${machine.memoryGiB} GiB, Chromium ${machine.chromium}, ${String(VIEWPORT.width)}x${String(VIEWPORT.height)}, ${String(RUNS)} runs per path.`,
    `Throttle: ${f((THROTTLE.downloadThroughput * 8) / 1024)} kbps down, ${THROTTLE.latency} ms RTT. Container reading; INDETERMINATE whenever spread >= effect.`,
    '',
    '| path | ready ms, median (min-max, spread) | LCP ms, median (min-max, spread) | JS requests (median) |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  const mdPath = writeReading(name, 'md', markdown);
  test.info().annotations.push({ type: 'output', description: `${jsonPath}, ${mdPath}` });
  expect(Object.keys(results)).toHaveLength(4);
});
