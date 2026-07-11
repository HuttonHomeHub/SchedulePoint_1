// Playwright driver for the TSLD prototype-at-scale spike (M0, ADR-0026).
// Loads the harness headless in Chromium at each activity count, runs the scripted
// pan/zoom benchmark, and prints fps + draw-time stats vs the ≥45/≥30 fps gate.
//
// Run from the repo root:  node prototypes/tsld-spike/bench.mjs
// (Chromium is pre-installed; PLAYWRIGHT_BROWSERS_PATH is configured.)
//
// NOTE: headless numbers are indicative, not device-authoritative — there is no GPU
// compositor and the runner is shared. The load-bearing signal is the per-frame CPU
// **draw time** for the culled viewport (portable across machines): if a continuously
// re-drawn frame stays well under the 16ms/22ms budget at 2,000 activities, the
// Canvas 2D architecture clears the bar and total count only affects cull/index cost.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
// @playwright/test is a devDependency of @repo/web, so resolve it from there rather
// than from this throwaway prototype (which has no package.json of its own).
const require = createRequire(join(here, '../../apps/web/'));
const { chromium } = require('@playwright/test');

// Serve the harness over HTTP — Chromium blocks ES-module imports over file:// (CORS).
const server = createServer(async (req, res) => {
  const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
  try {
    const body = await readFile(join(here, name));
    const type = name.endsWith('.js')
      ? 'text/javascript'
      : name.endsWith('.html')
        ? 'text/html'
        : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const pageUrl = (count) => `http://127.0.0.1:${port}/index.html?count=${count}`;
const COUNTS = [500, 2000];
const DURATION_MS = 4000;
const VIEWPORT = { width: 1440, height: 900 };

// The pinned @playwright/test build differs from the pre-installed browser, so point
// launch at the Chromium that IS present (per the environment's browser note) rather
// than the missing headless-shell build.
const glob = await import('node:fs').then((fs) =>
  fs.globSync
    ? fs.globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')
    : ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'],
);
const browser = await chromium.launch({ executablePath: glob[0] });
const results = [];
try {
  for (const count of COUNTS) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    await page.goto(pageUrl(count));
    await page.waitForFunction('typeof window.__bench === "function"');
    // Warm up one frame, then run the scripted continuous pan/zoom sweep.
    const stats = await page.evaluate((ms) => window.__bench(ms), DURATION_MS);
    const scene = await page.evaluate(() => window.__scene);
    results.push({ count, deps: scene.deps, ...stats });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

// The gate is judged on the PORTABLE metric: per-frame CPU draw time for the culled
// viewport. Headless fps is rAF-throttled (no GPU compositor) and only a floor, so it
// is reported as context, not the pass/fail signal. A frame budget of 16ms = 60fps;
// 22ms = 45fps. Pass = p95 draw comfortably under the 45fps budget with headroom.
const DRAW_BUDGET_MS = 16; // 60fps CPU budget — stricter than the ≥45/≥30 device gate
const line = (r) => {
  const pass = r.p95DrawMs <= DRAW_BUDGET_MS;
  return (
    `${String(r.count).padStart(5)} act · ${String(r.deps).padStart(5)} deps · ` +
    `draw med ${r.medianDrawMs}ms p95 ${r.p95DrawMs}ms (budget ≤${DRAW_BUDGET_MS}ms) → ${pass ? 'PASS' : 'REVIEW'} · ` +
    `headless fps floor: median ${r.medianFps} / slow-5% ${r.p5Fps} / min ${r.minFps}`
  );
};

console.log('\nTSLD prototype-at-scale spike — headless Chromium\n');
for (const r of results) console.log('  ' + line(r));
console.log(
  '\n  Verdict metric = per-frame CPU draw time for the culled viewport (portable).\n' +
    '  Headless fps is rAF-throttled with no GPU compositor → a floor, not the signal;\n' +
    '  real devices with GPU compositing sustain far higher fps at this draw cost.\n',
);

// Emit machine-readable JSON so the results can be pasted into ADR-0026.
console.log('JSON ' + JSON.stringify(results));
