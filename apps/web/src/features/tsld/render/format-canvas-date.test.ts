import { describe, expect, it } from 'vitest';

import { formatCanvasDate } from './geometry';

/**
 * `formatCanvasDate`'s two forms (ADR-0054 §3, ADR-0162 decision 4). The weekday form is the one the
 * Make milestone dialog and its announcement use, because a finish milestone after a weekend reads
 * the Friday rather than the Monday and the weekday is what says so.
 */
describe('formatCanvasDate', () => {
  it('keeps the compact form by default', () => {
    expect(formatCanvasDate('2026-01-09')).toBe('9 Jan');
  });

  it('adds the weekday when asked', () => {
    expect(formatCanvasDate('2026-01-09', { weekday: true })).toBe('Fri 9 Jan');
    expect(formatCanvasDate('2026-01-12', { weekday: true })).toBe('Mon 12 Jan');
    expect(formatCanvasDate('2026-01-11', { weekday: true })).toBe('Sun 11 Jan');
  });
});
