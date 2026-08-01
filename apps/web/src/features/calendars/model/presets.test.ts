import { describe, expect, it } from 'vitest';

import { presetWeek, WEEK_PRESETS } from './presets';
import { rowsToWindows } from './window-rows';

/** Every preset must be storable — a preset that fails the editor's own validation is a trap. */
describe('WEEK_PRESETS', () => {
  it('writes only rows the editor would accept', () => {
    for (const preset of WEEK_PRESETS) {
      for (const rows of preset.week) {
        expect(rowsToWindows(rows).ok, `${preset.id}`).toBe(true);
      }
    }
  });

  it('always writes seven days, so a preset cannot leave a day undefined', () => {
    for (const preset of WEEK_PRESETS) {
      expect(preset.week, preset.id).toHaveLength(7);
    }
  });

  it('names its hours in the label, because an invisible preset is a guess', () => {
    // Window-only is the one preset whose whole content is "no hours", and says so.
    for (const preset of WEEK_PRESETS.filter((p) => p.id !== 'window-only')) {
      expect(preset.label, preset.id).toMatch(/\d{2}:\d{2}|all day/);
    }
  });
});

describe('presetWeek', () => {
  it('writes Mon–Fri 08:00–17:00 for the standard week, and nothing at the weekend', () => {
    const week = presetWeek('standard');
    expect(week.slice(0, 5)).toEqual(
      Array.from({ length: 5 }, () => [{ start: '08:00', end: '17:00' }]),
    );
    expect(week.slice(5)).toEqual([[], []]);
  });

  it('writes two periods a day for the two-shift week', () => {
    expect(presetWeek('two-shift')[0]).toEqual([
      { start: '06:00', end: '14:00' },
      { start: '14:00', end: '22:00' },
    ]);
  });

  /** The rota is a multi-week cycle the weekly table cannot hold; the site hours are what it can. */
  it('writes twelve-hour days on all seven days for continental days', () => {
    expect(presetWeek('continental-days')).toEqual(
      Array.from({ length: 7 }, () => [{ start: '06:00', end: '18:00' }]),
    );
  });

  it('writes 00:00–24:00 every day for 24/7 — never a wrapping 00:00–00:00', () => {
    expect(presetWeek('always')).toEqual(
      Array.from({ length: 7 }, () => [{ start: '00:00', end: '24:00' }]),
    );
  });

  it('writes an entirely empty week for window-only', () => {
    expect(presetWeek('window-only')).toEqual(Array.from({ length: 7 }, () => []));
  });

  /** Applying a preset then editing a day must not reach back into the constant. */
  it('returns a fresh week each call, so a later edit cannot corrupt the preset', () => {
    const first = presetWeek('standard');
    first[0]?.push({ start: '18:00', end: '20:00' });
    expect(presetWeek('standard')[0]).toEqual([{ start: '08:00', end: '17:00' }]);
  });
});
