import { test as base, expect, type Browser, type BrowserContext } from '@playwright/test';

/**
 * The journeys' `test`: the stock one plus a guard that fails a test which met an API 429
 * (docs/TECH_DEBT.md #361, ADR-0175).
 *
 * ## Why this exists
 *
 * The API's `ThrottlerGuard` refuses more than 100 requests per 60 s from one IP **to one handler**,
 * and a suite runs every test from one IP against one API process. When a handler's bucket is spent
 * nothing says so: `GET /api/v1/me` answers 429, the session hook yields no user, every screen draws
 * its signed-out half (correctly), and the journey then waits out its timeout on a heading the
 * product is right not to draw. The report names that heading. Every journey config also starts the
 * API with `LOG_LEVEL: 'silent'`, so the server's own warning is not there either.
 *
 * ## What it does
 *
 * An auto fixture listens for `response` on the test's context and on every context the test opens
 * with `browser.newContext()`, records any 429 under `/api/`, and **at teardown** fails the test
 * naming the throttler, the method, the path and when. It fails even a test that otherwise passed:
 * a retry that happened to get through is a near-miss, not a pass.
 *
 * Teardown rather than the moment of the 429, because a `response` listener cannot abort a running
 * test body and throwing inside it is an unhandled runner error, not a test failure. The test still
 * waits out its current expectation. A test that otherwise passed fails with the 429 as its only
 * error; one that also failed an expectation carries the 429 as a second error, after the symptom.
 *
 * ## The stated gap
 *
 * `APIRequestContext` (`page.request`, the `request` fixture) emits no `response` event, so a 429 on
 * one of those calls is not seen. Those calls assert their own status. In-page `fetch` (including
 * `page.evaluate`) is covered, and so is a context opened by `browser.newContext()` — and a page from
 * `browser.newPage()`, which calls `this.newContext()` (playwright-core 1.63.0, `coreBundle.js`).
 * A context opened in `beforeAll`/`afterAll` is outside the test's scope and is not watched, and a
 * response still in flight when the test body ends (an unawaited autosave or poll) can be missed.
 *
 * ## Opting out
 *
 * `test.use({ allowRateLimited: true })`, inside the one `describe` that provokes a 429 on purpose.
 * Never file-wide: a suite that opts out wholesale has blinded itself to the next real one.
 *
 * ## The census
 *
 * `E2E_THROTTLE_CENSUS=1` prints, when the worker finishes, the peak number of requests per
 * `METHOD path-template` in any rolling 60 s window, highest first. That is the quantity a bucket
 * limits, so it is what a limit raise or a suite slimming should be sized from. Each worker prints
 * its own tally, which is the whole suite under the `workers: 1` the API-backed configs use. With
 * several local workers sharing one IP each tally understates the bucket, and route-fulfilled
 * (mocked) responses are counted too, which overstates it for specs that mock.
 */

/** The window `ThrottlerGuard` counts in (`RATE_LIMIT_TTL`'s default). */
const THROTTLE_WINDOW_MS = 60_000;

/** How many census lines to print: past this the tail is noise, not a candidate. */
const CENSUS_TOP = 10;

export interface RateLimitHit {
  method: string;
  path: string;
  /** Milliseconds since the test started. */
  atMs: number;
  /** The envelope's `error.code`, when the body could still be read. */
  code: string | undefined;
}

export interface RateLimitTracker {
  /** Responses seen with status 429 under `/api/`, in arrival order (once their bodies are read). */
  hits(): Promise<RateLimitHit[]>;
  /** The error `throttleGuard` throws, or `undefined` when no 429 was seen. */
  failure(): Promise<Error | undefined>;
}

export function formatRateLimitFailure(hits: readonly RateLimitHit[]): string {
  const first = hits[0];
  if (!first) {
    return '';
  }
  const perRoute = new Map<string, number>();
  for (const hit of hits) {
    const key = `${hit.method} ${hit.path}`;
    perRoute.set(key, (perRoute.get(key) ?? 0) + 1);
  }
  const head =
    `API rate limit hit: 429 ${first.code ?? 'RATE_LIMITED'} on ${first.method} ${first.path} ` +
    `at +${(first.atMs / 1000).toFixed(1)}s (ThrottlerGuard, per IP per handler; 100 per ` +
    `${THROTTLE_WINDOW_MS / 1000}s unless the suite's webServer sets RATE_LIMIT_LIMIT / ` +
    `RATE_LIMIT_TTL). The screen failure above is a symptom.`;
  if (perRoute.size === 1 && hits.length === 1) {
    return head;
  }
  const counts = [...perRoute.entries()].map(([route, n]) => `${route} x${n}`).join(', ');
  return `${head} ${hits.length} refused in all: ${counts}.`;
}

/**
 * Collapses the segments that vary per entity so one handler is one key: UUIDs, cuids and bare
 * numbers become `:id`. A census keyed on raw paths would list every plan as its own handler.
 */
export function templatePath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
      /^c[a-z0-9]{24}$/.test(segment) ||
      /^\d+$/.test(segment)
        ? ':id'
        : segment,
    )
    .join('/');
}

/** The most requests that fall in any one rolling window of `windowMs`, over sorted `times`. */
export function peakInWindow(times: readonly number[], windowMs: number): number {
  let peak = 0;
  let start = 0;
  for (let end = 0; end < times.length; end += 1) {
    while ((times[end] ?? 0) - (times[start] ?? 0) >= windowMs) {
      start += 1;
    }
    peak = Math.max(peak, end - start + 1);
  }
  return peak;
}

const censusEnabled = process.env['E2E_THROTTLE_CENSUS'] === '1';

/** Request timestamps per `METHOD path-template`, for the lifetime of this worker process. */
const censusTimes = new Map<string, number[]>();

function recordCensus(method: string, path: string): void {
  const key = `${method} ${templatePath(path)}`;
  const times = censusTimes.get(key);
  if (times) {
    times.push(Date.now());
  } else {
    censusTimes.set(key, [Date.now()]);
  }
}

function printCensus(): void {
  const rows = [...censusTimes.entries()]
    .map(([key, times]) => ({ key, peak: peakInWindow(times, THROTTLE_WINDOW_MS) }))
    .sort((a, b) => b.peak - a.peak || a.key.localeCompare(b.key))
    .slice(0, CENSUS_TOP);
  if (rows.length === 0) {
    return;
  }
  const lines = rows.map((row) => `  ${String(row.peak).padStart(4)}  ${row.key}`);
  process.stdout.write(
    `[throttle census] peak requests per ${THROTTLE_WINDOW_MS / 1000}s, per handler:\n${lines.join('\n')}\n`,
  );
}

function track(startedAt: number): {
  tracker: RateLimitTracker;
  attach: (context: BrowserContext) => void;
} {
  const pending: Promise<RateLimitHit | undefined>[] = [];

  const attach = (context: BrowserContext): void => {
    context.on('response', (response) => {
      const { pathname } = new URL(response.url());
      if (!pathname.startsWith('/api/')) {
        return;
      }
      const method = response.request().method();
      if (censusEnabled) {
        recordCensus(method, pathname);
      }
      if (response.status() !== 429) {
        return;
      }
      const atMs = Date.now() - startedAt;
      pending.push(
        // The body is read only to name the code; a context that closed first still counts as a hit.
        response
          .json()
          .then((body: unknown) => {
            const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
            return {
              method,
              path: pathname,
              atMs,
              code: typeof code === 'string' ? code : undefined,
            };
          })
          .catch(() => ({ method, path: pathname, atMs, code: undefined })),
      );
    });
  };
  const hits = async (): Promise<RateLimitHit[]> => {
    const settled = await Promise.all(pending);
    return settled.filter((hit): hit is RateLimitHit => hit !== undefined);
  };

  const tracker: RateLimitTracker = {
    hits,
    async failure() {
      const seen = await hits();
      return seen.length === 0 ? undefined : new Error(formatRateLimitFailure(seen));
    },
  };
  return { tracker, attach };
}

interface TestFixtures {
  /** True for the one test that provokes a 429 on purpose; see the docblock. */
  allowRateLimited: boolean;
  /** The 429s this test's contexts have seen so far. Auto-started by `throttleGuard`. */
  rateLimits: RateLimitTracker;
  throttleGuard: void;
}

interface WorkerFixtures {
  throttleCensus: void;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  allowRateLimited: [false, { option: true }],

  // `provide`, not `use`: the react-hooks rule reads a call named `use` as the React hook.
  rateLimits: async ({ context, browser }, provide) => {
    const { tracker, attach } = track(Date.now());
    attach(context);
    // Wrapped for this test only, so a multi-actor journey's second context is watched without
    // touching its call sites. The browser is shared by the worker's tests, so what was there
    // (a prototype method, so normally no own property at all) is put back in `finally`.
    const own = Object.getOwnPropertyDescriptor(browser, 'newContext');
    const open = browser.newContext.bind(browser);
    browser.newContext = async (...args: Parameters<Browser['newContext']>) => {
      const created = await open(...args);
      attach(created);
      return created;
    };
    try {
      await provide(tracker);
    } finally {
      if (own) {
        Object.defineProperty(browser, 'newContext', own);
      } else {
        delete (browser as { newContext?: unknown }).newContext;
      }
    }
  },

  throttleGuard: [
    async ({ rateLimits, allowRateLimited }, provide) => {
      await provide();
      const failure = await rateLimits.failure();
      if (failure && !allowRateLimited) {
        throw failure;
      }
    },
    { auto: true },
  ],

  throttleCensus: [
    // Playwright parses this first parameter and refuses anything but a destructuring pattern.
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      await provide();
      if (censusEnabled) {
        printCensus();
      }
    },
    { scope: 'worker', auto: true },
  ],
});

export { expect };
