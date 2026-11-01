import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CrashReferenceLine } from '@/components/crash-reference-line';
import { ApiFetchError } from '@/lib/api/client';
import {
  buildCrashReport,
  reportCrash,
  resetCrashReportState,
  setCrashReportSessionProbe,
} from '@/lib/crash-report';

const ok = (reference: unknown): Response =>
  new Response(JSON.stringify({ data: { reference } }), { status: 200 });

describe('buildCrashReport', () => {
  it('builds the contract fields with the boundary and route pattern', () => {
    const error = new TypeError('x is undefined');
    const body = buildCrashReport({
      error,
      boundary: 'route',
      routeId: '/orgs/$orgSlug/calendars',
      componentStack: '\n    at Foo',
    });
    expect(body).toMatchObject({
      name: 'TypeError',
      message: 'x is undefined',
      boundary: 'route',
      routeId: '/orgs/$orgSlug/calendars',
      componentStack: '\n    at Foo',
    });
    expect(body?.stack).toContain('TypeError');
    expect(typeof body?.webVersion).toBe('string');
  });

  it('never lets a query string or fragment into the body', () => {
    const error = new Error('failed https://host/a?token=abc#frag now');
    error.stack =
      'Error: boom\n    at f (https://host/assets/a.js?x=1#y:10:20)\n    at g (https://host/b.js?z=2:3:4)';
    const body = buildCrashReport({
      error,
      boundary: 'app',
      componentStack: '\n    at C (https://host/assets/c.js?v=9:1:2)',
    });
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/\?x=1|\?z=2|\?v=9|token=|#y|#frag/);
    // The location survives, minus its query: the `:line:col` tail is kept.
    expect(body?.stack).toMatch(/assets\/a\.js:10:20\)/);
    expect(body?.stack).toMatch(/host\/b\.js:3:4\)/);
  });

  it('caps every field', () => {
    const error = new Error('m'.repeat(1_000));
    error.stack = 's'.repeat(10_000);
    const body = buildCrashReport({ error, boundary: 'route', componentStack: 'c'.repeat(9_000) });
    expect(body?.message).toHaveLength(300);
    expect(body?.stack).toHaveLength(4_000);
    expect(body?.componentStack).toHaveLength(2_000);
  });

  it('skips an ApiFetchError and a chunk-load failure', () => {
    const api = new ApiFetchError(500, { code: 'X', message: 'server' });
    const chunk = new TypeError('Failed to fetch dynamically imported module: /a.js');
    expect(buildCrashReport({ error: api, boundary: 'route' })).toBeNull();
    expect(buildCrashReport({ error: chunk, boundary: 'route' })).toBeNull();
  });

  it('describes a thrown non-Error without a stack', () => {
    const body = buildCrashReport({ error: 'plain string', boundary: 'app' });
    expect(body).toMatchObject({ name: 'NonError', message: 'plain string' });
    expect(body).not.toHaveProperty('stack');
  });
});

describe('reportCrash', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    resetCrashReportState();
    setCrashReportSessionProbe(() => true);
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(ok('7F3A9C')));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts once with the session and keepalive, and publishes the reference', async () => {
    render(<CrashReferenceLine />);
    reportCrash({ error: new Error('boom'), boundary: 'route', routeId: '/x' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/crash-reports$/);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', keepalive: true });
    expect(await screen.findByText(/Reference:/)).toHaveTextContent(
      'This problem has been reported. Reference: 7F3A9C.',
    );
  });

  it('sends nothing when signed out', () => {
    setCrashReportSessionProbe(() => false);
    reportCrash({ error: new Error('boom'), boundary: 'route' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a given crash once per tab session', () => {
    reportCrash({ error: new Error('same'), boundary: 'route', routeId: '/x' });
    reportCrash({ error: new Error('same'), boundary: 'route', routeId: '/x' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('sends at most three reports per page load', () => {
    for (let i = 0; i < 10; i += 1) {
      reportCrash({ error: new Error(`crash ${i}`), boundary: 'route' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('skips ApiFetchError and chunk failures without sending', () => {
    reportCrash({ error: new ApiFetchError(500, { code: 'X', message: 'm' }), boundary: 'route' });
    reportCrash({ error: new Error('Importing a module script failed.'), boundary: 'route' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws: a throwing sessionStorage, a rejecting fetch, a non-Error value', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    expect(() => {
      reportCrash({ error: new Error('a'), boundary: 'route' });
      reportCrash({ error: undefined, boundary: 'app' });
      reportCrash({ error: { weird: true }, boundary: 'app' });
    }).not.toThrow();
    await act(() => Promise.resolve());
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });

  it('never throws when the probe throws', () => {
    setCrashReportSessionProbe(() => {
      throw new Error('cache');
    });
    expect(() => reportCrash({ error: new Error('a'), boundary: 'route' })).not.toThrow();
  });
});

describe('the fallback line', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetCrashReportState();
    setCrashReportSessionProbe(() => true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['a non-2xx answer', () => Promise.resolve(new Response('{}', { status: 429 }))],
    ['a null reference', () => Promise.resolve(ok(null))],
    ['a malformed reference', () => Promise.resolve(ok('<script>'))],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('shows nothing for %s', async (_name, respond) => {
    vi.stubGlobal('fetch', vi.fn(respond));
    render(<CrashReferenceLine />);
    reportCrash({ error: new Error('boom'), boundary: 'route' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByText(/reported/)).not.toBeInTheDocument();
  });

  it('is static text, not a live region', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(ok('ABC123'))),
    );
    render(<CrashReferenceLine />);
    reportCrash({ error: new Error('boom'), boundary: 'route' });
    const line = await screen.findByText(/Reference:/);
    expect(line.closest('[aria-live],[role=alert],[role=status]')).toBeNull();
  });

  it('clears when the next crash is not reported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(ok('ABC123'))),
    );
    render(<CrashReferenceLine />);
    reportCrash({ error: new Error('first'), boundary: 'route' });
    await screen.findByText(/Reference:/);
    act(() => {
      reportCrash({
        error: new ApiFetchError(500, { code: 'X', message: 'm' }),
        boundary: 'route',
      });
    });
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });
});
