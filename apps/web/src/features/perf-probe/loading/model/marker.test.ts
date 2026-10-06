import { describe, expect, it } from 'vitest';

import { LOADING_MARKER_KEY, MARKER_MAX_AGE_MS, readMarker } from './marker';

const store = (value: string | null): Pick<Storage, 'getItem'> => ({
  getItem: (key) => (key === LOADING_MARKER_KEY ? value : null),
});

const now = 1_000_000;
const limb = {
  name: 'reload',
  status: 'taken',
  readyMs: 12,
  tally: {
    observed: 1,
    cache: 1,
    revalidated: 0,
    downloaded: 0,
    notExposed: 0,
    heuristic: 0,
    protocols: [],
  },
};

describe('readMarker', () => {
  it('finds nothing when nothing was left', () => {
    expect(readMarker(store(null), now)).toEqual({ kind: 'none' });
  });

  it('accepts a fresh reload-step marker', () => {
    const marker = { v: 1, runId: 'r', startedAt: now - 1000, step: 'reload' };
    expect(readMarker(store(JSON.stringify(marker)), now)).toEqual({ kind: 'pending', marker });
  });

  it('accepts a revisit-step marker that carries its first limb and urls', () => {
    const marker = { v: 1, runId: 'r', startedAt: now, step: 'revisit', reload: limb, urls: ['u'] };
    expect(readMarker(store(JSON.stringify(marker)), now).kind).toBe('pending');
  });

  it('discards a marker older than two minutes', () => {
    const marker = { v: 1, runId: 'r', startedAt: now - MARKER_MAX_AGE_MS - 1, step: 'reload' };
    expect(readMarker(store(JSON.stringify(marker)), now)).toEqual({
      kind: 'discarded',
      reason: 'expired',
    });
  });

  it('discards a marker from the future rather than trusting its clock', () => {
    const marker = { v: 1, runId: 'r', startedAt: now + 60_000, step: 'reload' };
    expect(readMarker(store(JSON.stringify(marker)), now).kind).toBe('discarded');
  });

  it.each([
    ['not json', '{nope'],
    ['a string', '"reload"'],
    ['null', 'null'],
    ['wrong version', JSON.stringify({ v: 2, runId: 'r', startedAt: now, step: 'reload' })],
    ['unknown step', JSON.stringify({ v: 1, runId: 'r', startedAt: now, step: 'network' })],
    ['missing run id', JSON.stringify({ v: 1, startedAt: now, step: 'reload' })],
    [
      'revisit without a limb',
      JSON.stringify({ v: 1, runId: 'r', startedAt: now, step: 'revisit' }),
    ],
    [
      'revisit with a limb that has no tally',
      JSON.stringify({
        v: 1,
        runId: 'r',
        startedAt: now,
        step: 'revisit',
        reload: { name: 'reload', status: 'taken', readyMs: 1 },
        urls: [],
      }),
    ],
    [
      'revisit with non-string urls',
      JSON.stringify({
        v: 1,
        runId: 'r',
        startedAt: now,
        step: 'revisit',
        reload: limb,
        urls: [1],
      }),
    ],
  ])('discards a malformed marker: %s', (_name, raw) => {
    expect(readMarker(store(raw), now)).toEqual({ kind: 'discarded', reason: 'malformed' });
  });

  it('treats a storage that throws as nothing left', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(readMarker(throwing, now)).toEqual({ kind: 'none' });
  });
});
