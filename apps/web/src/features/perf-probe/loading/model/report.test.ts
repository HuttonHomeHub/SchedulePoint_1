import { describe, expect, it } from 'vitest';

import type { Tally } from './classify';
import type { Limb, LoadingReading } from './limb';
import {
  cacheControlLine,
  describeBrowser,
  formatLoadingReport,
  limbLines,
  loadingStatus,
  protocolText,
} from './report';

const tally = (over: Partial<Tally>): Tally => ({
  observed: 8,
  cache: 8,
  revalidated: 0,
  downloaded: 0,
  notExposed: 0,
  heuristic: 0,
  protocols: [],
  ...over,
});

const reading: LoadingReading = {
  takenAt: '2026-10-06T10:00:00.000Z',
  development: false,
  browser: 'Chrome 130',
  webVersion: '0.160.0',
  apiVersion: '0.140.0',
  reload: { name: 'reload', status: 'taken', tally: tally({}), readyMs: 41.6 },
  revisit: {
    name: 'revisit',
    status: 'taken',
    tally: tally({ cache: 2, revalidated: 6, protocols: ['h2'] }),
    readyMs: 120,
  },
  network: {
    name: 'network',
    status: 'taken',
    tally: tally({ cache: 0, downloaded: 8, protocols: ['h2'] }),
    readyMs: 400,
  },
  cacheControl: {
    status: 'read',
    value: 'public, max-age=31536000, immutable',
    url: 'https://sp.test/assets/plan-abc.js',
  },
};

describe('formatLoadingReport', () => {
  it('prints every number the result shows, in one block', () => {
    expect(formatLoadingReport(reading)).toBe(
      [
        'SchedulePoint plan-screen loading reading',
        'Taken: 2026-10-06T10:00:00.000Z',
        'Browser: Chrome 130 (this reading speaks for this browser only)',
        'Web version: 0.160.0',
        'API version: 0.140.0',
        'Build: production build',
        '',
        'Reload (reload): taken',
        '  Code files observed: 8',
        '  Went to the network: 0',
        '  From cache: 8, revalidated: 0, downloaded: 0, not exposed: 0',
        '  Protocol: none (nothing went to the network)',
        '  Ready in: 42 ms',
        '',
        'Revisit (navigate): taken',
        '  Code files observed: 8',
        '  Went to the network: 6',
        '  From cache: 2, revalidated: 6, downloaded: 0, not exposed: 0',
        '  Protocol: h2',
        '  Ready in: 120 ms',
        '',
        'From the network (nothing cached) (no-store fetch): taken',
        '  Code files observed: 8',
        '  Went to the network: 8',
        '  From cache: 0, revalidated: 0, downloaded: 8, not exposed: 0',
        '  Protocol: h2',
        '  Ready in: 400 ms',
        '',
        'Cache-Control on /assets/plan-abc.js: public, max-age=31536000, immutable (immutable: yes)',
        '',
        'This measures how the plan screen’s code reaches this browser on a reload and on a revisit. It does not measure the plan’s own data requests, any other browser, or the “+17 %” comparison, which needs a build this server does not run.',
        'Open a plan in this browser before measuring: files it has never fetched are downloaded on the reload whatever the server says, and the revisit is the reading that always has them to reuse.',
        'Nothing was sent anywhere: the press made no request to the API and stored nothing.',
      ].join('\n'),
    );
  });

  it('labels a development build as not a reading of the live server', () => {
    expect(formatLoadingReport({ ...reading, development: true })).toContain(
      'Build: development build: not a reading of the live server',
    );
  });

  it('says the API version is not yet known rather than guessing', () => {
    expect(formatLoadingReport({ ...reading, apiVersion: null })).toContain(
      'API version: not yet known',
    );
  });
});

describe('limbLines', () => {
  it('reports a limb that was not taken, and why, with no numbers', () => {
    const limb: Limb = {
      name: 'reload',
      status: 'not-taken',
      reason: 'the page was loaded by "navigate"',
    };
    expect(limbLines(limb)).toEqual([
      'Reload (reload): NOT TAKEN',
      '  Why: the page was loaded by "navigate"',
    ]);
  });

  it('marks an incomplete limb and gives its reason', () => {
    const lines = limbLines({
      name: 'revisit',
      status: 'incomplete',
      tally: tally({}),
      readyMs: 5,
      reason: 'the timing buffer filled',
    });
    expect(lines[0]).toBe('Revisit (navigate): INCOMPLETE');
    expect(lines[1]).toBe('  Why: the timing buffer filled');
  });

  it('states how many counts rest on the size heuristic', () => {
    const lines = limbLines({
      name: 'reload',
      status: 'taken',
      tally: tally({ cache: 6, revalidated: 2, heuristic: 2 }),
      readyMs: 5,
    });
    expect(lines.join('\n')).toContain('2 of these are inferred from transfer and body sizes');
  });

  it('says "not exposed by this browser" for an unexposed protocol', () => {
    expect(protocolText(tally({ protocols: [null, 'h2'] }))).toBe(
      'not exposed by this browser, h2',
    );
  });
});

describe('cacheControlLine', () => {
  it('says immutable: no when the header lacks it', () => {
    expect(
      cacheControlLine({ status: 'read', value: 'no-cache', url: 'https://sp.test/assets/a.js' }),
    ).toBe('Cache-Control on /assets/a.js: no-cache (immutable: no)');
  });

  it('does not read "immutable" inside another directive', () => {
    expect(
      cacheControlLine({
        status: 'read',
        value: 'max-age=1, x-not-immutable-at-all',
        url: 'https://sp.test/a.js',
      }),
    ).toContain('immutable: no');
  });

  it('reports a missing header and a failed read distinctly', () => {
    expect(cacheControlLine({ status: 'read', value: null, url: 'https://sp.test/a.js' })).toBe(
      'Cache-Control on /a.js: none sent',
    );
    expect(cacheControlLine({ status: 'failed', reason: 'HTTP 404' })).toBe(
      'Cache-Control: could not be read (HTTP 404)',
    );
  });
});

describe('describeBrowser', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge 130',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome 130',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox 131'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Safari 17',
    ],
    ['curl/8', 'curl/8'],
    ['', 'unknown browser'],
  ])('%s -> %s', (ua, expected) => {
    expect(describeBrowser(ua)).toBe(expected);
  });
});

describe('loadingStatus', () => {
  it('says how many files went to the network per limb', () => {
    expect(loadingStatus(reading)).toBe(
      'Plan loading measured: reload 0 of 8 to the network; revisit 6 of 8 to the network.',
    );
  });
});
