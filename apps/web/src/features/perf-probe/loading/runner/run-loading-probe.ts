import { isCodeEntry, tally, type TimingRecord } from '../model/classify';
import type { CacheControlReading, Limb, LimbName, LoadingReading } from '../model/limb';
import { LOADING_MARKER_KEY, readMarker, type LoadingMarker } from '../model/marker';
import { describeBrowser } from '../model/report';

import { APP_VERSION } from '@/config/env';
import { readDeviceFacts } from '@/features/perf-probe/model/device';

/**
 * The plan-screen loading probe's state machine (`docs/TECH_DEBT.md` #433).
 *
 * **Everything it reads is the browser's own record of what it already did**: Resource Timing for
 * the files, Navigation Timing for how the document was loaded. It makes no API request, writes
 * nothing on the server and loads plan-screen **code**, never a plan (ADR-0086 D1) — the loaders
 * are the ones a bookmarked plan URL calls at boot, through the router's one exported function.
 *
 * **Three limbs across two navigations**, carried in a `sessionStorage` marker:
 *
 * 1. `reload`  — the page reloads itself, then asks for the plan screen's code.
 * 2. `revisit` — it navigates to a different URL of the same screen (a fresh document load with the
 *    cache primed, which is the path `measure-route-splitting` actually measured; #433 called it a
 *    "refresh" and it was not one), and asks again.
 * 3. `network` — it fetches every file it saw with `no-store`: what the same files cost when
 *    nothing is cached, standing in for a first visit.
 *
 * Every browser, cache and timing API is reached through {@link ProbeEnv}, so the machine is
 * assertable from fakes. The real environment is {@link browserEnv}.
 */

export const REVISIT_URL = '/staff?reading=revisit';

/** Enough for a development build's unbundled modules. The default is 250. */
const RESOURCE_BUFFER = 3000;
/** How long to wait for the browser to publish timing entries it has already finished. */
const SETTLE_POLLS = 40;
const SETTLE_INTERVAL_MS = 50;

export interface ProbeEnv {
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  readonly origin: string;
  readonly development: boolean;
  readonly userAgent: string;
  readonly webVersion: string;
  /** Epoch milliseconds. */
  now(): number;
  /** The `performance.now()` clock, which Resource Timing's `startTime` is on. */
  perfNow(): number;
  newRunId(): string;
  /** `PerformanceNavigationTiming.type` of this document, or undefined if not exposed. */
  navigationType(): string | undefined;
  resourceEntries(): TimingRecord[];
  setResourceBufferSize(size: number): void;
  /** Subscribes to `resourcetimingbufferfull`; returns the unsubscribe. */
  onResourceBufferFull(handler: () => void): () => void;
  /** The router's `preloadPlanDeepLinkChunks`, imported lazily by the real environment. */
  preloadPlanChunks(): Promise<unknown>;
  reload(): void;
  assign(url: string): void;
  /** GET with `cache: 'no-store'`, body consumed. */
  fetchNoStore(url: string): Promise<void>;
  /** HEAD with `cache: 'no-store'`; the `cache-control` header, or null if none was sent. */
  headCacheControl(url: string): Promise<string | null>;
  delay(ms: number): Promise<void>;
}

export type ResumeResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'discarded'; readonly reason: 'malformed' | 'expired' }
  | { readonly kind: 'navigating' }
  | { readonly kind: 'done'; readonly reading: LoadingReading }
  | { readonly kind: 'failed'; readonly message: string };

/** Begin a press: leave the marker, then reload. The page does the rest on its next mount. */
export function startLoadingProbe(env: ProbeEnv): void {
  const marker: LoadingMarker = {
    v: 1,
    runId: env.newRunId(),
    startedAt: env.now(),
    step: 'reload',
  };
  env.storage.setItem(LOADING_MARKER_KEY, JSON.stringify(marker));
  env.reload();
}

/**
 * What this document's one resume answered, kept for the document's life.
 *
 * **Keyed on the storage object, never on the marker.** Two mounts of the same effect (React's
 * development double-invoke) must not each measure and each navigate, and the second must get the
 * FIRST's answer: the last step removes the marker before it measures anything, so a second call
 * that looked the marker up again found nothing, answered "none", and the section — which keeps the
 * later answer — rendered idle while the real reading was thrown away. A document only ever runs
 * one step (the next one is a new document, and a new module), so one slot is enough.
 */
const resumed = new WeakMap<object, Promise<ResumeResult>>();

export function resumeLoadingProbe(env: ProbeEnv): Promise<ResumeResult> {
  const prior = resumed.get(env.storage);
  if (prior !== undefined) return prior;
  const read = readMarker(env.storage, env.now());
  if (read.kind === 'none') return Promise.resolve({ kind: 'none' });
  if (read.kind === 'discarded') {
    env.storage.removeItem(LOADING_MARKER_KEY);
    return Promise.resolve({ kind: 'discarded', reason: read.reason });
  }
  const started = step(env, read.marker);
  resumed.set(env.storage, started);
  return started;
}

async function step(env: ProbeEnv, marker: LoadingMarker): Promise<ResumeResult> {
  try {
    if (marker.step === 'reload') {
      const { limb, urls } = await measureLimb(env, 'reload', 'reload');
      const next: LoadingMarker = {
        v: 1,
        runId: marker.runId,
        startedAt: marker.startedAt,
        step: 'revisit',
        reload: limb,
        urls,
      };
      env.storage.setItem(LOADING_MARKER_KEY, JSON.stringify(next));
      env.assign(REVISIT_URL);
      return { kind: 'navigating' };
    }

    // The marker is removed before the last step, so a failure inside it cannot loop the page.
    env.storage.removeItem(LOADING_MARKER_KEY);
    const reload = marker.reload;
    if (reload === undefined) return { kind: 'failed', message: 'The first reading was lost.' };
    const revisit = await measureLimb(env, 'revisit', 'navigate');
    const urls = [...new Set([...(marker.urls ?? []), ...revisit.urls])];
    const network = await measureNetwork(env, urls);
    const cacheControl = await readCacheControl(env, urls);
    return {
      kind: 'done',
      reading: {
        takenAt: new Date(env.now()).toISOString(),
        development: env.development,
        browser: describeBrowser(env.userAgent),
        webVersion: env.webVersion,
        apiVersion: null,
        reload,
        revisit: revisit.limb,
        network,
        cacheControl,
      },
    };
  } catch (error) {
    // Never swallowed: a probe that fails must say so rather than leave a half-written reading.
    env.storage.removeItem(LOADING_MARKER_KEY);
    return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}

async function measureLimb(
  env: ProbeEnv,
  name: LimbName,
  expectedType: string,
): Promise<{ limb: Limb; urls: string[] }> {
  const observedType = env.navigationType();
  // A navigation of another type measures something else, and the cache rules differ between them.
  if (observedType !== expectedType) {
    return {
      limb: {
        name,
        status: 'not-taken',
        reason:
          observedType === undefined
            ? `this browser did not report how the page was loaded, so a ${expectedType} cannot be confirmed`
            : `the page was loaded by "${observedType}", not "${expectedType}"`,
      },
      urls: [],
    };
  }

  const entriesBefore = env.resourceEntries().length;
  env.setResourceBufferSize(RESOURCE_BUFFER);
  let bufferFull = false;
  const unsubscribe = env.onResourceBufferFull(() => {
    bufferFull = true;
  });
  const asked = env.perfNow();
  try {
    await env.preloadPlanChunks();
    // The browser publishes a finished entry on a later task, so wait for the count to hold still.
    let last = -1;
    await settle(env, () => {
      const count = env.resourceEntries().length;
      const stable = count === last;
      last = count;
      return stable;
    });
  } finally {
    unsubscribe();
  }
  const readyMs = env.perfNow() - asked;

  const code = env.resourceEntries().filter((e) => isCodeEntry(e, env.origin));
  const urls = [...new Set(code.map((e) => e.name))];
  const requestedAfter = code.filter((e) => (e.startTime ?? 0) >= asked).length;
  const counts = tally(code);

  if (bufferFull) {
    return {
      limb: {
        name,
        status: 'incomplete',
        tally: counts,
        readyMs,
        reason: 'the browser’s timing buffer filled, so some files are missing from the count',
      },
      urls,
    };
  }
  if (requestedAfter === 0) {
    // `lazyRouteComponent` resolves rather than rejects when a chunk fails, so a failure is only
    // visible as the absence of the requests it would have made.
    return {
      limb: {
        name,
        status: 'incomplete',
        tally: counts,
        readyMs,
        reason:
          'no plan-screen file was requested after the probe asked for them, which is also what a file that failed to download looks like',
      },
      urls,
    };
  }
  return {
    limb: {
      name,
      status: 'taken',
      tally: counts,
      readyMs,
      // Entries made before the probe raised the buffer may have been dropped; the files the probe
      // asked for itself could not have been.
      ...(entriesBefore >= 250
        ? {
            note: 'the browser’s timing buffer was already full when the probe started, so some boot files may be missing; the plan-screen files are counted in full',
          }
        : {}),
    },
    urls,
  };
}

async function measureNetwork(env: ProbeEnv, urls: readonly string[]): Promise<Limb> {
  const name: LimbName = 'network';
  if (urls.length === 0) {
    return { name, status: 'not-taken', reason: 'no code file was observed to fetch' };
  }
  const wanted = new Set(urls);
  const started = env.perfNow();
  let bufferFull = false;
  const unsubscribe = env.onResourceBufferFull(() => {
    bufferFull = true;
  });
  env.setResourceBufferSize(RESOURCE_BUFFER);
  let readyMs: number;
  const mine = (): TimingRecord[] =>
    env.resourceEntries().filter((e) => wanted.has(e.name) && (e.startTime ?? 0) >= started);
  try {
    await Promise.all(urls.map((url) => env.fetchNoStore(url)));
    readyMs = env.perfNow() - started;
    await settle(env, () => mine().length >= urls.length);
  } finally {
    unsubscribe();
  }

  const entries = mine();
  const counts = tally(entries);
  if (bufferFull || entries.length < urls.length) {
    return {
      name,
      status: 'incomplete',
      tally: counts,
      readyMs,
      reason: `the browser published ${String(entries.length)} of ${String(urls.length)} timing entries`,
    };
  }
  return { name, status: 'taken', tally: counts, readyMs };
}

async function readCacheControl(
  env: ProbeEnv,
  urls: readonly string[],
): Promise<CacheControlReading> {
  // A hashed chunk is the file whose caching the question is about; a development server has none.
  const url = urls.find((u) => u.includes('/assets/')) ?? urls[0];
  if (url === undefined) return { status: 'failed', reason: 'no code file was observed' };
  try {
    return { status: 'read', value: await env.headCacheControl(url), url };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Poll until `done()` or the budget is spent. The browser publishes finished entries on a later task. */
async function settle(env: ProbeEnv, done: () => boolean): Promise<void> {
  await env.delay(0);
  for (let i = 0; i < SETTLE_POLLS && !done(); i += 1) {
    await env.delay(SETTLE_INTERVAL_MS);
  }
}

export function browserEnv(): ProbeEnv {
  return {
    storage: window.sessionStorage,
    origin: window.location.origin,
    development: import.meta.env.DEV,
    userAgent: readDeviceFacts().userAgent,
    webVersion: APP_VERSION,
    now: () => Date.now(),
    perfNow: () => performance.now(),
    newRunId: () => crypto.randomUUID(),
    navigationType: () => {
      const nav = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      return nav?.type;
    },
    resourceEntries: () =>
      (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((e) => ({
        name: e.name,
        nextHopProtocol: e.nextHopProtocol,
        transferSize: e.transferSize,
        encodedBodySize: e.encodedBodySize,
        decodedBodySize: e.decodedBodySize,
        // Absent before Chromium 109 / Firefox 129 / Safari 16.4; undefined is "not exposed".
        responseStatus: (e as { responseStatus?: number }).responseStatus,
        startTime: e.startTime,
      })),
    setResourceBufferSize: (size) => {
      performance.setResourceTimingBufferSize(size);
    },
    onResourceBufferFull: (handler) => {
      performance.addEventListener('resourcetimingbufferfull', handler);
      return () => {
        performance.removeEventListener('resourcetimingbufferfull', handler);
      };
    },
    preloadPlanChunks: async () => {
      // Dynamic, so the router (already in the entry chunk) is reached from this lazy chunk by one
      // edge and nothing in the staff chunk imports it.
      const { preloadPlanDeepLinkChunks } = await import('@/app/router');
      return preloadPlanDeepLinkChunks();
    },
    reload: () => {
      window.location.reload();
    },
    assign: (url) => {
      window.location.assign(url);
    },
    fetchNoStore: async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      await response.arrayBuffer();
    },
    headCacheControl: async (url) => {
      const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      return response.headers.get('cache-control');
    },
    delay: (ms) =>
      new Promise((resolve) => {
        window.setTimeout(resolve, ms);
      }),
  };
}
