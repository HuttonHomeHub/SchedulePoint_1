import { describe, expect, it } from 'vitest';

import { formatSignedWorkingMinutes, formatWorkingMinutes } from './duration-text';

describe('formatWorkingMinutes', () => {
  it('prints days, hours and minutes on the given working day', () => {
    expect(formatWorkingMinutes(480, 480)).toBe('1d');
    expect(formatWorkingMinutes(510, 480)).toBe('1d 30m');
    expect(formatWorkingMinutes(1200, 480)).toBe('2d 4h');
    expect(formatWorkingMinutes(120, 480)).toBe('2h');
    expect(formatWorkingMinutes(45, 480)).toBe('45m');
  });

  it('measures a day on the calendar it is given', () => {
    expect(formatWorkingMinutes(480, 600)).toBe('8h');
    expect(formatWorkingMinutes(600, 600)).toBe('1d');
  });

  it('writes zero as 0d and never divides by a non-positive day', () => {
    expect(formatWorkingMinutes(0, 480)).toBe('0d');
    expect(formatWorkingMinutes(480, 0)).toBe('8h');
  });
});

describe('parity with the web formatter (formatDurationText), same cases', () => {
  const cases: [number, number, string][] = [
    [2400, 8, '5d'],
    [480, 8, '1d'],
    [240, 8, '4h'],
    [90, 8, '1h 30m'],
    [510, 8, '1d 30m'],
    [600, 8, '1d 2h'],
    [0, 8, '0d'],
    [480, 24, '8h'],
    [450, 7.5, '1d'],
  ];
  it.each(cases)('%i minutes on a %s-hour day reads %s', (minutes, hours, text) => {
    expect(formatWorkingMinutes(minutes, hours * 60)).toBe(text);
  });
});

describe('formatSignedWorkingMinutes', () => {
  it('signs a lag and a lead', () => {
    expect(formatSignedWorkingMinutes(480, 480)).toBe('+1d');
    expect(formatSignedWorkingMinutes(-120, 480)).toBe('−2h');
  });
});
