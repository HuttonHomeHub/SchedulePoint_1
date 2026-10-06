import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimingRecord } from '../model/classify';
import { LOADING_MARKER_KEY, type LoadingMarker } from '../model/marker';

import {
  REVISIT_URL,
  resumeLoadingProbe,
  startLoadingProbe,
  type ProbeEnv,
} from './run-loading-probe';

class FakeStorage {
  readonly data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => {
    this.data.set(k, v);
  };
  removeItem = (k: string): void => {
    this.data.delete(k);
  };
}

const ORIGIN = 'https://sp.test';
const code = (n: number, over: Partial<TimingRecord> = {}): TimingRecord => ({
  name: `${ORIGIN}/assets/chunk-${String(n)}.js`,
  nextHopProtocol: 'h2',
  transferSize: 0,
  encodedBodySize: 1000,
  decodedBodySize: 3000,
  responseStatus: 200,
  startTime: 0,
  ...over,
});

interface Harness {
  env: ProbeEnv;
  storage: FakeStorage;
  calls: string[];
  /** Entries visible to `resourceEntries`; the preload appends `afterPreload` to it. */
  entries: TimingRecord[];
  setNav(type: string | undefined): void;
  clock: { t: number; wall: number };
}

function harness(opts: { afterPreload?: TimingRecord[]; fetchEntries?: boolean } = {}): Harness {
  const storage = new FakeStorage();
  const calls: string[] = [];
  const entries: TimingRecord[] = [code(0), code(1)];
  let nav: string | undefined = 'reload';
  const clock = { t: 100, wall: 1_000_000 };
  const afterPreload = opts.afterPreload ?? [
    code(2, { startTime: 110 }),
    code(3, { startTime: 110 }),
  ];
  const env: ProbeEnv = {
    storage,
    origin: ORIGIN,
    development: false,
    userAgent: 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36',
    webVersion: '9.9.9',
    now: () => clock.wall,
    perfNow: () => clock.t,
    newRunId: () => 'run-1',
    navigationType: () => nav,
    resourceEntries: () => [...entries],
    setResourceBufferSize: (n) => calls.push(`buffer:${String(n)}`),
    onResourceBufferFull: () => () => undefined,
    preloadPlanChunks: () => {
      calls.push('preload');
      clock.t += 30;
      entries.push(...afterPreload);
      return Promise.resolve();
    },
    reload: () => calls.push('reload'),
    assign: (u) => calls.push(`assign:${u}`),
    fetchNoStore: (url) => {
      calls.push(`fetch:${url}`);
      if (opts.fetchEntries !== false) {
        entries.push({ ...code(0), name: url, transferSize: 1300, startTime: clock.t + 1 });
      }
      return Promise.resolve();
    },
    headCacheControl: () => {
      calls.push('head');
      return Promise.resolve('public, max-age=31536000, immutable');
    },
    delay: () => Promise.resolve(),
  };
  return {
    env,
    storage,
    calls,
    entries,
    setNav: (t) => {
      nav = t;
    },
    clock,
  };
}

const marker = (over: Partial<LoadingMarker>): string =>
  JSON.stringify({ v: 1, runId: 'run-1', startedAt: 1_000_000 - 1000, step: 'reload', ...over });

describe('startLoadingProbe', () => {
  it('leaves a reload-step marker and reloads', () => {
    const h = harness();
    startLoadingProbe(h.env);
    expect(JSON.parse(h.storage.getItem(LOADING_MARKER_KEY) ?? 'null')).toEqual({
      v: 1,
      runId: 'run-1',
      startedAt: 1_000_000,
      step: 'reload',
    });
    expect(h.calls).toEqual(['reload']);
  });
});

describe('resumeLoadingProbe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing and touches no browser API when no press is pending', async () => {
    const h = harness();
    expect(await resumeLoadingProbe(h.env)).toEqual({ kind: 'none' });
    expect(h.calls).toEqual([]);
  });

  it('discards a stale marker, removes it, and measures nothing', async () => {
    const h = harness();
    h.storage.setItem(LOADING_MARKER_KEY, marker({ startedAt: 1 }));
    expect(await resumeLoadingProbe(h.env)).toEqual({ kind: 'discarded', reason: 'expired' });
    expect(h.storage.getItem(LOADING_MARKER_KEY)).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it('discards a malformed marker', async () => {
    const h = harness();
    h.storage.setItem(LOADING_MARKER_KEY, '{oops');
    expect(await resumeLoadingProbe(h.env)).toEqual({ kind: 'discarded', reason: 'malformed' });
    expect(h.storage.getItem(LOADING_MARKER_KEY)).toBeNull();
  });

  it('reload step: raises the buffer, asks for the plan chunks, stores the limb and navigates', async () => {
    const h = harness();
    h.storage.setItem(LOADING_MARKER_KEY, marker({ step: 'reload' }));
    expect(await resumeLoadingProbe(h.env)).toEqual({ kind: 'navigating' });
    expect(h.calls).toEqual(['buffer:3000', 'preload', `assign:${REVISIT_URL}`]);
    const stored = JSON.parse(h.storage.getItem(LOADING_MARKER_KEY) ?? 'null') as LoadingMarker;
    expect(stored.step).toBe('revisit');
    expect(stored.reload).toMatchObject({
      name: 'reload',
      status: 'taken',
      readyMs: 30,
      tally: { observed: 4, cache: 4 },
    });
    expect(stored.urls).toHaveLength(4);
  });

  it('reload step: a page that was not reloaded is not taken, and says what it was', async () => {
    const h = harness();
    h.setNav('navigate');
    h.storage.setItem(LOADING_MARKER_KEY, marker({ step: 'reload' }));
    await resumeLoadingProbe(h.env);
    expect(h.calls).toEqual([`assign:${REVISIT_URL}`]);
    const stored = JSON.parse(h.storage.getItem(LOADING_MARKER_KEY) ?? 'null') as LoadingMarker;
    expect(stored.reload).toEqual({
      name: 'reload',
      status: 'not-taken',
      reason: 'the page was loaded by "navigate", not "reload"',
    });
  });

  it('reports a browser that does not say how the page loaded as not taken, not as taken', async () => {
    const h = harness();
    h.setNav(undefined);
    h.storage.setItem(LOADING_MARKER_KEY, marker({ step: 'reload' }));
    await resumeLoadingProbe(h.env);
    const stored = JSON.parse(h.storage.getItem(LOADING_MARKER_KEY) ?? 'null') as LoadingMarker;
    expect(stored.reload?.status).toBe('not-taken');
  });

  it('reload step: files the browser never requested after the ask are incomplete, not fast', async () => {
    const h = harness({ afterPreload: [] });
    h.storage.setItem(LOADING_MARKER_KEY, marker({ step: 'reload' }));
    await resumeLoadingProbe(h.env);
    const stored = JSON.parse(h.storage.getItem(LOADING_MARKER_KEY) ?? 'null') as LoadingMarker;
    expect(stored.reload?.status).toBe('incomplete');
  });

  describe('revisit step', () => {
    const reloadLimb = {
      name: 'reload',
      status: 'taken',
      readyMs: 10,
      tally: {
        observed: 2,
        cache: 2,
        revalidated: 0,
        downloaded: 0,
        notExposed: 0,
        heuristic: 0,
        protocols: [],
      },
    };

    it('measures the revisit, the network limb and the header, then clears the marker', async () => {
      const h = harness();
      h.setNav('navigate');
      h.storage.setItem(
        LOADING_MARKER_KEY,
        marker({
          step: 'revisit',
          reload: reloadLimb as never,
          urls: [`${ORIGIN}/assets/chunk-0.js`],
        }),
      );
      const result = await resumeLoadingProbe(h.env);
      expect(result.kind).toBe('done');
      if (result.kind !== 'done') return;
      expect(result.reading.reload).toEqual(reloadLimb);
      expect(result.reading.revisit).toMatchObject({ status: 'taken', tally: { observed: 4 } });
      expect(result.reading.network).toMatchObject({
        status: 'taken',
        tally: { observed: 4, downloaded: 4 },
      });
      expect(result.reading.cacheControl).toEqual({
        status: 'read',
        value: 'public, max-age=31536000, immutable',
        url: `${ORIGIN}/assets/chunk-0.js`,
      });
      expect(result.reading.browser).toBe('Chrome 130');
      expect(result.reading.webVersion).toBe('9.9.9');
      expect(h.storage.getItem(LOADING_MARKER_KEY)).toBeNull();
      // Nothing but the plan chunk set, the file fetches and the one HEAD: no API path, ever.
      expect(h.calls.filter((c) => c.includes('/api/'))).toEqual([]);
      expect(h.calls.filter((c) => c === 'head')).toHaveLength(1);
    });

    it('never fetches a marker URL that is not a same-origin code file', async () => {
      // sessionStorage is writable by anything running in the tab, and the network limb sends
      // credentialed GETs to every URL it is given. A crafted marker must not steer them.
      const h = harness();
      h.setNav('navigate');
      h.storage.setItem(
        LOADING_MARKER_KEY,
        marker({
          step: 'revisit',
          reload: reloadLimb as never,
          urls: [
            `${ORIGIN}/api/v1/auth/sign-out`,
            'https://evil.test/assets/x.js',
            `${ORIGIN}/assets/logo.png`,
            `${ORIGIN}/assets/chunk-0.js`,
          ],
        }),
      );
      await resumeLoadingProbe(h.env);
      const fetched = h.calls.filter((c) => c.startsWith('fetch:')).map((c) => c.slice(6));
      expect(fetched).not.toContain(`${ORIGIN}/api/v1/auth/sign-out`);
      expect(fetched).not.toContain('https://evil.test/assets/x.js');
      expect(fetched).not.toContain(`${ORIGIN}/assets/logo.png`);
      expect(fetched).toContain(`${ORIGIN}/assets/chunk-0.js`);
    });

    it('does not take the revisit limb when the page was reloaded instead of navigated to', async () => {
      const h = harness();
      h.setNav('reload');
      h.storage.setItem(
        LOADING_MARKER_KEY,
        marker({ step: 'revisit', reload: reloadLimb as never, urls: [] }),
      );
      const result = await resumeLoadingProbe(h.env);
      if (result.kind !== 'done') throw new Error('expected done');
      expect(result.reading.revisit).toMatchObject({ status: 'not-taken' });
      expect(result.reading.network).toEqual({
        name: 'network',
        status: 'not-taken',
        reason: 'no code file was observed to fetch',
      });
      expect(result.reading.cacheControl.status).toBe('failed');
    });

    it('reports the network limb incomplete when the browser published fewer entries than files', async () => {
      const h = harness({ fetchEntries: false });
      h.setNav('navigate');
      h.storage.setItem(
        LOADING_MARKER_KEY,
        marker({ step: 'revisit', reload: reloadLimb as never, urls: [] }),
      );
      const result = await resumeLoadingProbe(h.env);
      if (result.kind !== 'done') throw new Error('expected done');
      expect(result.reading.network.status).toBe('incomplete');
    });

    it('never leaves a marker behind when the last step throws', async () => {
      const h = harness();
      h.setNav('navigate');
      h.env.preloadPlanChunks = () => Promise.reject(new Error('boom'));
      h.storage.setItem(
        LOADING_MARKER_KEY,
        marker({ step: 'revisit', reload: reloadLimb as never, urls: [] }),
      );
      expect(await resumeLoadingProbe(h.env)).toEqual({ kind: 'failed', message: 'boom' });
      expect(h.storage.getItem(LOADING_MARKER_KEY)).toBeNull();
    });
  });

  it('shares one in-flight resume between two mounts of the same step', async () => {
    const h = harness();
    h.storage.setItem(LOADING_MARKER_KEY, marker({ step: 'reload' }));
    const [a, b] = await Promise.all([resumeLoadingProbe(h.env), resumeLoadingProbe(h.env)]);
    expect(a).toEqual({ kind: 'navigating' });
    expect(b).toEqual({ kind: 'navigating' });
    expect(h.calls.filter((c) => c === 'preload')).toHaveLength(1);
    expect(h.calls.filter((c) => c.startsWith('assign:'))).toHaveLength(1);
  });

  it('gives a second mount the answer to the first, even though the last step has already cleared the marker', async () => {
    // The defect this pins: React's development double-invoke calls resume twice. The revisit step
    // removes the marker before it measures anything, so a second call keyed on the marker found
    // nothing, answered "none", and the section — which keeps the SECOND call's answer — rendered
    // idle while the first call's reading was thrown away. Reproduced in `e2e-staff`.
    const h = harness();
    h.setNav('navigate');
    h.storage.setItem(
      LOADING_MARKER_KEY,
      marker({
        step: 'revisit',
        reload: {
          name: 'reload',
          status: 'not-taken',
          reason: 'x',
        },
        urls: [],
      }),
    );
    const first = resumeLoadingProbe(h.env);
    const second = resumeLoadingProbe(h.env);
    expect((await first).kind).toBe('done');
    expect((await second).kind).toBe('done');
    expect(h.calls.filter((c) => c === 'preload')).toHaveLength(1);
  });
});
