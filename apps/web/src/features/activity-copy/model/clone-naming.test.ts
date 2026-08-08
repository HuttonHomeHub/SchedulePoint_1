import { describe, expect, it } from 'vitest';

import { ACTIVITY_NAME_MAX_LENGTH, freeCopyName } from './clone-naming';

/**
 * The copy-name rule. Every case here is a way a paste fails at the API rather than in the UI:
 * a taken name is a 409 whose message names nothing, and an over-long name is a 422.
 */
describe('freeCopyName', () => {
  it('appends " (copy)" when nothing is taken', () => {
    expect(freeCopyName('Excavate', new Set())).toBe('Excavate (copy)');
  });

  it('numbers from 2 once " (copy)" is taken', () => {
    expect(freeCopyName('Excavate', new Set(['Excavate (copy)']))).toBe('Excavate (copy 2)');
    expect(freeCopyName('Excavate', new Set(['Excavate (copy)', 'Excavate (copy 2)']))).toBe(
      'Excavate (copy 3)',
    );
  });

  it('fills a gap rather than counting past it', () => {
    // "(copy)" and "(copy 3)" exist; the free slot is 2. A monotonic counter would answer 4 and
    // leave a hole a planner has to explain.
    const used = new Set(['Excavate (copy)', 'Excavate (copy 3)']);
    expect(freeCopyName('Excavate', used)).toBe('Excavate (copy 2)');
  });

  it('copies a copy', () => {
    expect(freeCopyName('Excavate (copy)', new Set(['Excavate (copy)']))).toBe(
      'Excavate (copy) (copy)',
    );
  });

  it('never exceeds the API limit — at 199, 200 and 201 characters of source', () => {
    for (const length of [199, 200, 201]) {
      const source = 'a'.repeat(length);
      const name = freeCopyName(source, new Set());
      expect(name.length, `source length ${String(length)}`).toBeLessThanOrEqual(
        ACTIVITY_NAME_MAX_LENGTH,
      );
      expect(name.endsWith(' (copy)')).toBe(true);
    }
  });

  it('keeps the suffix whole when it truncates, and still finds a free slot', () => {
    const source = 'b'.repeat(ACTIVITY_NAME_MAX_LENGTH);
    const first = freeCopyName(source, new Set());
    // The truncated base is shorter for the longer suffix, so the second name is not simply the
    // first with a number bolted on — asserted rather than assumed.
    const second = freeCopyName(source, new Set([first]));
    expect(second.endsWith(' (copy 2)')).toBe(true);
    expect(second.length).toBeLessThanOrEqual(ACTIVITY_NAME_MAX_LENGTH);
    expect(second).not.toBe(first);
  });

  it('trims a trailing space left by truncation', () => {
    const source = `${'c'.repeat(190)} `.padEnd(ACTIVITY_NAME_MAX_LENGTH, 'c');
    const name = freeCopyName(source, new Set());
    expect(name).not.toContain('  (copy)');
  });
});
