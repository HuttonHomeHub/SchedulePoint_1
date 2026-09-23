import type { SeedActivity } from '@repo/seed';
import { describe, expect, it } from 'vitest';

import { DAY } from '../capabilities/builders.js';
import { loadSpecs } from '../specs.js';

import { netpointReferencePlan } from './netpoint-power-plant.js';

/**
 * A transcription is only worth comparing against its source if it IS its source. These cases are
 * the checks a person would otherwise make by holding the file up against the picture — and the
 * second one is the one that catches a misread: if a date or a link was copied wrongly, some link
 * will be broken by the dates it connects.
 */
const spec = netpointReferencePlan();
const byKey = new Map(spec.activities.map((a) => [a.key, a]));

const MS_PER_DAY = 86_400_000;

/** Day number of an activity's placed start. */
function startDay(a: SeedActivity): number {
  return Date.parse(`${a.visualStart}T00:00:00Z`) / MS_PER_DAY;
}

/** The day AFTER an activity's last day — a continuous finish, so FS reads `succ.start >= pred.end`. */
function endDay(a: SeedActivity): number {
  return startDay(a) + a.durationMinutes / DAY;
}

function get(key: string): SeedActivity {
  const found = byKey.get(key);
  if (found === undefined) throw new Error(`no activity ${key}`);
  return found;
}

describe('the NetPoint reference plan', () => {
  it('is filed under the reference tier, where the capability size cap does not apply', () => {
    expect(spec.tier).toBe('reference');
    expect(loadSpecs('reference').map((s) => s.seedName)).toEqual([spec.seedName]);
    expect(loadSpecs('capability').map((s) => s.seedName)).not.toContain(spec.seedName);
  });

  it('keeps `--family` a capability filter: a reference plan joins `all` only unfiltered', () => {
    expect(loadSpecs('all').map((s) => s.seedName)).toContain(spec.seedName);
    expect(loadSpecs('all', { family: 'cost' }).map((s) => s.seedName)).not.toContain(
      spec.seedName,
    );
  });

  it('places every activity, on a row, no earlier than its data date', () => {
    for (const a of spec.activities) {
      expect(a.visualStart, a.key).not.toBeNull();
      expect(a.laneIndex, a.key).toBeTypeOf('number');
      expect(a.visualStart! >= spec.plan.dataDate, a.key).toBe(true);
    }
  });

  it("keeps the picture's month and day on every date (the +12-year shift)", () => {
    expect(get('NTP').visualStart).toBe('2027-03-01');
    expect(get('B_FW').visualStart).toBe('2028-12-16');
    // 29 Feb exists in both 2016 and 2028 — the reason the shift is twelve years, not eleven.
    expect(endDay(get('S_FAB')) - 1).toBe(Date.parse('2028-02-29T00:00:00Z') / MS_PER_DAY);
    expect(endDay(get('TURNOVER')) - 1).toBe(Date.parse('2031-02-28T00:00:00Z') / MS_PER_DAY);
  });

  it('never draws two activities over each other on one row', () => {
    const lanes = new Map<number, SeedActivity[]>();
    for (const a of spec.activities) {
      const lane = lanes.get(a.laneIndex!) ?? [];
      lane.push(a);
      lanes.set(a.laneIndex!, lane);
    }
    for (const [lane, members] of lanes) {
      const bars = members.filter((a) => a.durationMinutes > 0);
      for (const a of bars) {
        for (const b of bars) {
          if (a === b) continue;
          const overlap = startDay(a) < endDay(b) && startDay(b) < endDay(a);
          expect(overlap, `lane ${lane}: ${a.key} overlaps ${b.key}`).toBe(false);
        }
      }
    }
  });

  it('breaks no link: every placement is at or after what its predecessors allow', () => {
    for (const d of spec.dependencies) {
      const pred = get(d.predecessorKey);
      const succ = get(d.successorKey);
      const lag = d.lagMinutes / DAY;
      const label = `${d.predecessorKey} -${d.type}-> ${d.successorKey}`;
      if (d.type === 'FS') expect(startDay(succ) >= endDay(pred) + lag, label).toBe(true);
      if (d.type === 'SS') expect(startDay(succ) >= startDay(pred) + lag, label).toBe(true);
      if (d.type === 'FF') expect(endDay(succ) >= endDay(pred) + lag, label).toBe(true);
    }
  });

  it("holds the picture's two SS/FF pairs exactly, not merely satisfied", () => {
    // Satisfied would pass with any lag short enough; the picture draws these with no gap, so the
    // lag is exactly the drawn offset at both ends.
    for (const [pred, succ] of [
      ['B_ERECT', 'B_FW'],
      ['CW_FAB', 'CW_INST'],
    ] as const) {
      const ss = spec.dependencies.find(
        (d) => d.predecessorKey === pred && d.successorKey === succ && d.type === 'SS',
      )!;
      const ff = spec.dependencies.find(
        (d) => d.predecessorKey === pred && d.successorKey === succ && d.type === 'FF',
      )!;
      expect(startDay(get(succ)) - startDay(get(pred))).toBe(ss.lagMinutes / DAY);
      expect(endDay(get(succ)) - endDay(get(pred))).toBe(ff.lagMinutes / DAY);
    }
  });

  it("draws the picture's red chain end to end, with no gap anywhere along it", () => {
    const chain = [
      'MOB',
      'B_FAB',
      'B_ERECT',
      'B_FW',
      'HYDRO',
      'CHEM',
      'STEAM',
      'M_TURB_ROLL',
      'TEST',
      'TURNOVER',
      'M_GCO',
    ];
    for (let i = 1; i < chain.length; i += 1) {
      const pred = get(chain[i - 1]!);
      const succ = get(chain[i]!);
      if (pred.key === 'B_ERECT') continue; // joined by the SS/FF pair, checked above
      expect(startDay(succ), `${pred.key} → ${succ.key}`).toBe(endDay(pred));
    }
  });

  it("states each (predecessor, successor, type) once — the database's own uniqueness", () => {
    const keys = spec.dependencies.map((d) => `${d.predecessorKey}→${d.successorKey}:${d.type}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
