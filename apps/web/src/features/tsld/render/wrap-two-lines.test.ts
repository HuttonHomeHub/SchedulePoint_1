import { describe, expect, it } from 'vitest';

import { LABEL_ELLIPSIS, wrapTwoLines } from './render-model';

/** Six px a character, as the recording context measures. */
const m = (s: string): number => s.length * 6;

describe('wrapTwoLines (NetPoint grammar M4-T2)', () => {
  it('takes the longest run of whole words that fits as the first line', () => {
    expect(wrapTwoLines('Pour ground floor slab', 72, m)).toEqual(['Pour ground', 'floor slab']);
  });

  it('truncates the second line when the rest does not fit', () => {
    expect(wrapTwoLines('Pour ground floor slab and cure', 72, m)).toEqual([
      'Pour ground',
      `floor slab${LABEL_ELLIPSIS}`,
    ]);
  });

  it('gives up on one word, on a first word that does not fit, and on a lone ellipsis', () => {
    expect(wrapTwoLines('Excavation', 30, m)).toBeNull();
    expect(wrapTwoLines('Mobilisation of plant', 30, m)).toBeNull();
    // `A` fits in 6 px and the rest would be a bare `…`, which names nothing.
    expect(wrapTwoLines('A CDEFGH', 6, m)).toBeNull();
  });
});
