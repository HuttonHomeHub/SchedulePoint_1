import { describe, expect, it } from 'vitest';

import { rovingIndexFor } from './toolbar-keyboard';

/**
 * **Where a navigation key lands, including from the state the focus handoff creates.**
 *
 * The container-focused case (`from === -1`) is the one with a history. Before this rule existed
 * both primitives clamped `-1` to `0` and then applied the wrap arithmetic, so **ArrowRight from
 * the container landed on the SECOND stop** — measured in jsdom against the real primitives, not
 * reasoned about. That state was unreachable until the handoff started leaving readers on the
 * container, and it is now the state their next key press comes from.
 *
 * The mirror case is ADR-0082's: `-1` reaching the bare modulo backwards gives `count - 2`, the
 * second-to-last, which is the ArrowUp defect that ADR records shipping.
 */
describe('rovingIndexFor', () => {
  const N = 4;

  it.each([
    ['ArrowRight', 0],
    ['ArrowDown', 0],
    ['ArrowLeft', N - 1],
    ['ArrowUp', N - 1],
    ['Home', 0],
    ['End', N - 1],
  ])('starts the sequence from the container: %s → %i', (key, expected) => {
    expect(rovingIndexFor(key, -1, N)).toBe(expected);
  });

  it.each([
    ['ArrowRight', 1, 2],
    ['ArrowLeft', 1, 0],
    ['ArrowRight', N - 1, 0],
    ['ArrowLeft', 0, N - 1],
    ['Home', 2, 0],
    ['End', 2, N - 1],
  ])('continues the sequence from a stop: %s from %i → %i', (key, from, expected) => {
    expect(rovingIndexFor(key, from, N)).toBe(expected);
  });

  it('has no answer for an empty container', () => {
    expect(rovingIndexFor('ArrowRight', -1, 0)).toBe(-1);
  });
});
