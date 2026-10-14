import { describe, expect, it } from 'vitest';

import { csvCell } from './csv.js';

describe('csvCell — RFC-4180 quoting', () => {
  it('leaves a plain value untouched', () => {
    expect(csvCell('Excavate')).toBe('Excavate');
    expect(csvCell('')).toBe('');
  });

  it('quotes a value containing a comma', () => {
    expect(csvCell('Excavate, north')).toBe('"Excavate, north"');
  });

  it('quotes and doubles an embedded quote', () => {
    expect(csvCell('12" pipe')).toBe('"12"" pipe"');
  });

  it('quotes a value containing a newline', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('csvCell — formula-injection guard', () => {
  it('prefixes an apostrophe for every leading formula trigger (= + - @ TAB)', () => {
    // Each value starts with a trigger but holds no comma/quote/newline, so only the apostrophe is added.
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell('\tTAB')).toBe("'\tTAB");
  });

  it('neutralises a leading CR THEN RFC-4180-quotes it (CR is also a quote trigger)', () => {
    expect(csvCell('\rdanger')).toBe('"\'\rdanger"');
  });

  it('does not neutralise a trigger character that is not leading', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('name -x')).toBe('name -x');
  });

  it('neutralises a formula trigger that follows only leading whitespace (S1 — Excel trims first)', () => {
    // " =1+1" is a live formula in Excel/Sheets (leading spaces are trimmed before evaluation), so it is
    // prefixed. The value's own whitespace is preserved — only the apostrophe is prepended, no trim.
    expect(csvCell(' =1+1')).toBe("' =1+1");
    expect(csvCell('  @SUM')).toBe("'  @SUM");
  });
});
