import { describe, expect, it } from 'vitest';

import { formatMoney, majorInputToMinor, minorToMajorInput } from './format-money';

describe('formatMoney', () => {
  it('formats minor units as a major-unit currency amount', () => {
    // 123456 minor units = 1,234.56 major units; en-GB renders USD with the $ symbol.
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
  });

  it('formats with the plan currency symbol', () => {
    expect(formatMoney(500000, 'GBP')).toBe('£5,000.00');
  });

  it('falls back to a plain grouped decimal when the currency is null', () => {
    expect(formatMoney(123456, null)).toBe('1,234.56');
  });

  it('renders an em dash for a null amount (unset or not-permitted)', () => {
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatMoney(null, null)).toBe('—');
  });

  it('renders zero, not a dash', () => {
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });

  it('does not throw on an unrecognised currency code (plain fallback)', () => {
    // A code that Intl can't resolve shouldn't crash the display boundary.
    expect(formatMoney(100000, 'ZZZ')).toContain('1,000');
  });
});

describe('minorToMajorInput / majorInputToMinor (form round-trip)', () => {
  it('seeds a major-unit value from stored minor units', () => {
    expect(minorToMajorInput(123456)).toBe(1234.56);
  });

  it('seeds blank (undefined) from a null/undefined stored value', () => {
    expect(minorToMajorInput(null)).toBeUndefined();
    expect(minorToMajorInput(undefined)).toBeUndefined();
  });

  it('converts a major-unit entry back to integer minor units, rounding float noise', () => {
    expect(majorInputToMinor(1234.56)).toBe(123456);
    // 19.99 * 100 = 1998.9999999999998 in IEEE-754 — must round to 1999, not truncate to 1998.
    expect(majorInputToMinor(19.99)).toBe(1999);
  });

  it('leaves a blank field (undefined) as undefined', () => {
    expect(majorInputToMinor(undefined)).toBeUndefined();
  });

  it('round-trips an untouched seeded value exactly', () => {
    const seeded = minorToMajorInput(987654);
    expect(majorInputToMinor(seeded)).toBe(987654);
  });
});
