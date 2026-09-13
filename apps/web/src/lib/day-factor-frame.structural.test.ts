import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

/**
 * The scheduling frame is constructed in ONE place per shape (`docs/TECH_DEBT.md` #86/#317).
 *
 * The defect this guards is not a wrong frame — it is the SAME rule written out by hand at each new
 * surface, which is how two read-outs of one activity come to disagree. Three sites had spelled it
 * longhand before #317; two of them were the same composition and are now one named derivation
 * (`activitySchedulingHoursPerDay`), whose behaviour is pinned by
 * `activity-scheduling-hours-per-day.test.ts` and verified red against an own-frame swap.
 *
 * **Blind spot, stated rather than implied:** this reads source text, so it catches a new longhand
 * construction and cannot catch a site that calls the wrong *named* helper. That half is the unit
 * test's, and between them the rule has both a behaviour and a home.
 */

/**
 * The one production site that legitimately builds the frame itself, and why.
 *
 * `lag-factor.ts` frames a `LagEndpoint`, not an activity: there `undefined` means "the host cannot
 * name this end" and must resolve to `undefined` rather than falling back to the plan's calendar —
 * the opposite of what `activityDayFactorFrame` returns for an absent subject. Routing it through
 * the shared helper would silently give a lag the plan's day length whenever the host had not yet
 * loaded the endpoint.
 */
const DELIBERATE_LONGHAND = ['src/features/dependencies/model/lag-factor.ts'];

function longhandSites(): string[] {
  let out = '';
  try {
    out = execFileSync(
      'grep',
      ['-rln', '--include=*.ts', '--include=*.tsx', "kind: 'scheduling'", 'src'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
  } catch {
    return []; // grep exits 1 when it finds nothing
  }
  return (
    out
      .split('\n')
      .filter((file) => file !== '')
      // The definition itself, and tests, are not call sites.
      .filter((file) => file !== 'src/lib/effective-hours-per-day.ts')
      .filter((file) => !file.includes('.test.'))
  );
}

describe('day-factor frame construction (#317)', () => {
  it('has no longhand scheduling frame outside the one site that needs it', () => {
    expect(longhandSites().sort()).toEqual([...DELIBERATE_LONGHAND].sort());
  });

  /**
   * The pinned positive case. Without it, the assertion above passes perfectly against a scan that
   * matched NOTHING — the ADR-0093 / ADR-0108 shape, where a green suite cannot tell "every site is
   * accounted for" from "the scan is broken". Verified by breaking the glob.
   */
  it('finds the deliberate site at all, so a broken scan cannot read as compliance', () => {
    expect(longhandSites().length).toBeGreaterThanOrEqual(1);
  });
});
