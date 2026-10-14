import { describe, expect, it } from 'vitest';

import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it('uses decimal units, as a file manager does', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1500)).toBe('1.5 kB');
    expect(formatBytes(3_200_000)).toBe('3.2 MB');
    expect(formatBytes(2_500_000_000)).toBe('2.5 GB');
  });

  it('formats the number in the reader’s locale, with at most one decimal', () => {
    // A whole value drops the ".0" toFixed(1) printed; a large one gets its group separator.
    expect(formatBytes(2_000_000)).toBe('2 MB');
    expect(formatBytes(5_000_000_000_000)).toBe(`${new Intl.NumberFormat().format(5000)} GB`);
  });
});
