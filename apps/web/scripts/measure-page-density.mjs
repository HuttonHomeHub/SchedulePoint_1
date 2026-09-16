/**
 * Density M0 for the per-page scope: measure these screens at REALISTIC volume.
 *
 * The first pass measured a 1–3 row fixture and found every table at exactly 100% of the viewport.
 * That is a fact about the fixture, not the design (ADR-0113: the problem statement went stale
 * because of a state the product had been put into). The product owner has said density is in
 * scope, so the numbers have to come from a library that could plausibly exist.
 *
 * Volumes are deliberately at the low end of real, not at the measured ceiling: ADR-0053 M4
 * profiled calendars and resources at 5,000 rows, but nobody has ever estimated what a real
 * organisation holds, and a fixture tuned to make a point is the number-tuned-to-the-answer this
 * repository keeps recording. 120/80/80 is "a mid-sized contractor", and it is stated as an
 * assumption rather than presented as a finding.
 *
 * Seeds through the PUBLIC REST API for the ADR-0066 reason: a fixture assembled any other way
 * reuses the assembly it is meant to be testing.
 */
import { chromium } from '@playwright/test';
import { globSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const WIDTH = Number(process.env.WIDTH ?? '1646');
const SLUG = process.env.SLUG;
const EMAIL = process.env.EMAIL;
if (!SLUG || !EMAIL) throw new Error('SLUG and EMAIL are required');

const CLIENTS = Number(process.env.CLIENTS ?? '120');
const CALENDARS = Number(process.env.CALENDARS ?? '80');
const RESOURCES = Number(process.env.RESOURCES ?? '80');

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/sign-in`);
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByLabel(/password/i).fill('correct-horse-battery');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/\/orgs\//, { timeout: 20000 });

const seeded = await page.evaluate(
  async ({ org, clients, calendars, resources }) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    // The global throttler is 100 requests / 60 s (ADR-0051 added it). A fixture big enough to
    // measure density is bigger than that, so the seeder waits the window out rather than
    // seeding round the write path with SQL — the ADR-0066 rule: a fixture assembled another way
    // reuses the assembly it is meant to be exercising.
    const post = async (path, body) => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const r = await fetch(`/api/v1/organizations/${org}${path}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.status === 429) {
          await sleep(6000);
          continue;
        }
        // A name collision means a previous run already made this row — the fixture is
        // idempotent so a throttled, half-finished run can simply be re-run.
        if (r.status === 409) return null;
        if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
        return (await r.json()).data;
      }
      throw new Error(`${path}: still throttled after 12 attempts`);
    };
    // Names drawn to the length a real one has — a fixture of "Client 1" measures a column width
    // nobody will ever see. These are the shapes a UK contractor's list actually holds.
    const stems = [
      'Bellway',
      'Barratt',
      'Taylor Wimpey',
      'Persimmon',
      'Redrow',
      'Berkeley',
      'Countryside',
      'Crest Nicholson',
      'Bloor',
      'Miller',
      'Keepmoat',
      'Vistry',
    ];
    const kinds = ['Homes', 'Developments', 'Regeneration', 'Estates', 'Partnerships', 'Living'];
    const made = { clients: 0, calendars: 0, resources: 0 };
    for (let i = 0; i < clients; i += 1) {
      const name = `${stems[i % stems.length]} ${kinds[Math.floor(i / stems.length) % kinds.length]} ${i + 1}`;
      await post('/clients', {
        name,
        // Half carry a description, half do not — the column's real state is mixed, and a fixture
        // where every row has one measures a wrap that most rows never do.
        ...(i % 2 === 0
          ? {
              description:
                'Framework contractor — residential and mixed-use schemes across the north west',
            }
          : {}),
      });
      made.clients += 1;
    }
    for (let i = 0; i < calendars; i += 1) {
      await post('/calendars', { name: `Site calendar ${i + 1}`, workingWeekdays: 62 });
      made.calendars += 1;
    }
    const RKINDS = ['LABOUR', 'EQUIPMENT', 'MATERIAL'];
    for (let i = 0; i < resources; i += 1) {
      await post('/resources', { name: `Resource ${i + 1}`, kind: RKINDS[i % 3] });
      made.resources += 1;
    }
    return made;
  },
  { org: SLUG, clients: CLIENTS, calendars: CALENDARS, resources: RESOURCES },
);
console.error(`seeded ${JSON.stringify(seeded)}`);

const probe = () => {
  const main = document.querySelector('main');
  const h1 = document.querySelector('h1');
  const t = document.querySelector('table');
  const rows = t ? [...t.querySelectorAll('tbody tr')] : [];
  const heights = rows.slice(0, 40).map((r) => Math.round(r.getBoundingClientRect().height));
  const tally = {};
  for (const h of heights) tally[h] = (tally[h] ?? 0) + 1;
  const firstRow = rows[0];
  const tableTop = t ? Math.round(t.getBoundingClientRect().top) : null;
  // How much of the first screenful is chrome before a single row of data appears.
  const firstRowTop = firstRow ? Math.round(firstRow.getBoundingClientRect().top) : null;
  const vh = window.innerHeight;
  return {
    rows: rows.length,
    rowHeights: tally,
    tableTop,
    firstRowTop,
    chromeShare: firstRowTop == null ? null : Math.round((firstRowTop / vh) * 100),
    rowsInFirstScreen:
      firstRowTop == null
        ? null
        : rows.filter((r) => r.getBoundingClientRect().bottom <= vh).length,
    mainScrollHeight: main?.scrollHeight ?? null,
    mainClientHeight: main?.clientHeight ?? null,
    screensTall: main ? +(main.scrollHeight / main.clientHeight).toFixed(2) : null,
    h1Top: h1 ? Math.round(h1.getBoundingClientRect().top) : null,
  };
};

const PAGES = [
  ['clients', `/orgs/${SLUG}/clients`],
  ['calendars', `/orgs/${SLUG}/calendars`],
  ['resources', `/orgs/${SLUG}/resources`],
  ['members', `/orgs/${SLUG}/members`],
  ['audit-log', `/orgs/${SLUG}/audit-log`],
];
const out = {};
for (const [name, path] of PAGES) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  out[name] = await page.evaluate(probe);
  await page.screenshot({ path: `.screenshots/${WIDTH}/dense-${name}.png` });
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
