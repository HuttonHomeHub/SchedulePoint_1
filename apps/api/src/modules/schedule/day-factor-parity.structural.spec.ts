import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The engine's input did not move (`docs/TECH_DEBT.md` #86, second mechanism).
 *
 * This epic's parity sentence is neither of the two the register already uses. It is NOT ADR-0125
 * D1's strong form — `computeSchedule` **is** called here — and it is NOT ADR-0116 D7's weaker one,
 * because this path writes. The claim is narrower and is the one the design was chosen to make
 * structural: **the arguments handed to `computeSchedule` are byte-identical, and the change lives
 * entirely in the conversion applied to what it returns.**
 *
 * That is true because the fix ADDS a map rather than editing the one the engine reads.
 * `calIdByActivity` is still built from `effectiveByActivity` and still carries `null` as the
 * inherit sentinel `portFor` collapses; `dayFactorCalIdByActivity` is a sibling built by
 * `schedulingCalendarId`, read only by `resolveDayFactors`, and never passed to the engine.
 *
 * **Blind spot, stated rather than implied:** this asserts the two maps stay distinct and that the
 * day-factor map does not reach the engine call. It cannot prove the engine's output is unchanged —
 * that is the conformance fixture's and the golden snapshots' job, and both pass unedited, which is
 * the acceptance condition the plan sets.
 */

const SOURCE = readFileSync(
  join(process.cwd(), 'src/modules/schedule/schedule.service.ts'),
  'utf8',
);

describe('day-factor parity: the engine reads the port map, never the day-factor map', () => {
  it('passes the RESOLVED map to resolveDayFactors, never the engine’s port map', () => {
    // The whole defect was `resolveDayFactors(graph.calIdByActivity)`. Passing the port map back is
    // a one-token edit that restores it silently, so it is asserted rather than trusted to review.
    expect(SOURCE).toContain('graph.dayFactorCalIdByActivity');
    expect(SOURCE).not.toContain('resolveDayFactors(graph.calIdByActivity');
  });

  it('never hands the day-factor map to the engine', () => {
    // `computeSchedule`'s arguments are assembled from the graph; the resolved map must not appear
    // among them. If a future caller threads it through, the engine would begin seeing a calendar
    // id where it expects an inherit sentinel — the inverse of this defect.
    const engineCall = SOURCE.slice(SOURCE.indexOf('computeSchedule('));
    const callArgs = engineCall.slice(0, engineCall.indexOf(');'));
    expect(callArgs).not.toContain('dayFactorCalIdByActivity');
  });

  it('still builds the port map from the engine’s own effective-calendar resolution', () => {
    // The pinned positive case. Without it, both assertions above pass against a file that no
    // longer builds `calIdByActivity` at all — "the engine's input did not move" cannot be shown by
    // the absence of a string (the ADR-0093 / ADR-0108 shape).
    expect(SOURCE).toContain('const calIdByActivity = new Map(');
    expect(SOURCE).toContain('effectiveByActivity.get(r.id)!.calId');
  });
});
