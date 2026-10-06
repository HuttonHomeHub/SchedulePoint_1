import { describe, expect, it } from 'vitest';

import { classifyEntry, isCodeEntry, tally, type TimingRecord } from './classify';

const entry = (over: Partial<TimingRecord>): TimingRecord => ({
  name: 'https://sp.test/assets/plan-abc.js',
  nextHopProtocol: 'h2',
  transferSize: 300,
  encodedBodySize: 50_000,
  decodedBodySize: 180_000,
  responseStatus: 200,
  ...over,
});

describe('classifyEntry', () => {
  it('reads no network bytes with a real body as from cache', () => {
    expect(classifyEntry(entry({ transferSize: 0 }))).toEqual({
      delivery: 'cache',
      heuristic: false,
    });
  });

  it('does not call a zero-size, zero-body response a cache hit', () => {
    expect(classifyEntry(entry({ transferSize: 0, decodedBodySize: 0 })).delivery).toBe(
      'not-exposed',
    );
  });

  it('reads a transfer size the browser withheld as not exposed', () => {
    expect(classifyEntry(entry({ transferSize: undefined })).delivery).toBe('not-exposed');
  });

  it('reads an exposed 304 as revalidated, and that is not a heuristic', () => {
    expect(classifyEntry(entry({ responseStatus: 304, transferSize: 280 }))).toEqual({
      delivery: 'revalidated',
      heuristic: false,
    });
  });

  it('reads Chromium’s revalidation — headers only, no body, status 200 — as revalidated', () => {
    // The shape measured in Chromium 153 against `vite preview`'s `no-cache` + weak ETag + 304
    // (m2-measurement.md). The first version of this classifier trusted the exposed 200 and called
    // it downloaded, reading a server that revalidates everything as one that re-downloads
    // everything.
    expect(
      classifyEntry(
        entry({ responseStatus: 200, transferSize: 300, encodedBodySize: 0, decodedBodySize: 0 }),
      ),
    ).toEqual({ delivery: 'revalidated', heuristic: true });
  });

  it('reads a 200 with network bytes and a body as downloaded, even when the body is small', () => {
    // A size comparison alone would call this revalidated; the status and the body say it is not.
    expect(
      classifyEntry(entry({ responseStatus: 200, transferSize: 90, encodedBodySize: 400 })),
    ).toEqual({ delivery: 'downloaded', heuristic: false });
  });

  describe('without a response status', () => {
    it('reads a transfer smaller than the body as revalidated and labels it a heuristic', () => {
      expect(classifyEntry(entry({ responseStatus: undefined, transferSize: 280 }))).toEqual({
        delivery: 'revalidated',
        heuristic: true,
      });
    });

    it('reads body-sized transfer as downloaded and labels it a heuristic', () => {
      expect(classifyEntry(entry({ responseStatus: undefined, transferSize: 50_300 }))).toEqual({
        delivery: 'downloaded',
        heuristic: true,
      });
    });

    it('treats a status of 0 (Safari’s "unknown") as absent', () => {
      expect(classifyEntry(entry({ responseStatus: 0, transferSize: 280 })).heuristic).toBe(true);
    });

    it('does not label a cache hit a heuristic', () => {
      expect(classifyEntry(entry({ responseStatus: undefined, transferSize: 0 })).heuristic).toBe(
        false,
      );
    });
  });
});

describe('isCodeEntry', () => {
  const origin = 'https://sp.test';
  it.each([
    ['https://sp.test/assets/index-abc.js', true],
    ['https://sp.test/theme-boot.js', true],
    ['https://sp.test/src/routes/staff.tsx', true],
    ['https://sp.test/@vite/client', true],
    ['https://sp.test/assets/index-abc.css', false],
    ['https://sp.test/api/v1/staff/installation', false],
    ['https://cdn.test/assets/index-abc.js', false],
    ['not a url', false],
  ])('%s -> %s', (name, expected) => {
    expect(isCodeEntry(entry({ name }), origin)).toBe(expected);
  });
});

describe('tally', () => {
  it('splits the entries so the four counts add up to the observed count', () => {
    const t = tally([
      entry({ transferSize: 0 }),
      entry({ transferSize: 0 }),
      entry({ responseStatus: 304, transferSize: 280 }),
      entry({ responseStatus: 200, transferSize: 50_300 }),
      entry({ transferSize: undefined }),
    ]);
    expect(t).toMatchObject({
      observed: 5,
      cache: 2,
      revalidated: 1,
      downloaded: 1,
      notExposed: 1,
      heuristic: 0,
    });
    expect(t.cache + t.revalidated + t.downloaded + t.notExposed).toBe(t.observed);
  });

  it('names the protocol of files that travelled, and none when everything came from cache', () => {
    expect(tally([entry({ transferSize: 0 })]).protocols).toEqual([]);
    expect(
      tally([
        entry({ transferSize: 280, responseStatus: 304 }),
        entry({ transferSize: 280, responseStatus: 304, nextHopProtocol: 'http/1.1' }),
      ]).protocols,
    ).toEqual(['h2', 'http/1.1']);
  });

  it('records an unexposed protocol as null rather than as an empty protocol', () => {
    expect(
      tally([entry({ nextHopProtocol: '', responseStatus: 304, transferSize: 280 })]).protocols,
    ).toEqual([null]);
  });

  it('counts the heuristic calls', () => {
    expect(
      tally([
        entry({ responseStatus: undefined, transferSize: 280 }),
        entry({ responseStatus: undefined, transferSize: 0 }),
        entry({ responseStatus: 200, transferSize: 300, encodedBodySize: 0, decodedBodySize: 0 }),
      ]).heuristic,
    ).toBe(2);
  });
});
