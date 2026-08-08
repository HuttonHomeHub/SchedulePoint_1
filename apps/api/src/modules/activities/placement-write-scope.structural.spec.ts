import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **A bulk move cannot rename forty activities** (`docs/specs/canvas-multi-select/` M1-T2).
 *
 * The batch placement route is a second door onto columns the single `PATCH` already writes, and the
 * thing that keeps it a *placement* write rather than a definition write is the shape of one
 * parameter: `ActivityRepository.updatePlacements` names four placement columns and no others, so
 * no definition field is reachable from that seam even by accident.
 *
 * That is a property of the signature, not of the caller — which is exactly why it is asserted here
 * rather than left to a service test. A service test proves what today's caller sends; this proves
 * what tomorrow's caller *could*. The failure it is written against is not malice but the ordinary
 * one: someone widens the row type by a field to save threading a second call, and the guard that
 * made the route safe is gone with no test going red.
 */
const REPO = readFileSync(join(__dirname, 'activity.repository.ts'), 'utf8');

/** The `placements` parameter's inline row type, comments already excluded by the shape of the cut. */
function placementRowType(): string {
  const match = /placements:\s*readonly\s*\{([\s\S]*?)\}\[\]/.exec(REPO);
  expect(match, 'updatePlacements declares an inline placements row type').not.toBeNull();
  return match?.[1] ?? '';
}

describe('the placement write seam is placement-only', () => {
  it('accepts exactly the four placement columns, plus id and version', () => {
    const fields = placementRowType()
      .split(';')
      .map((line) => line.split(':')[0]?.trim() ?? '')
      .filter(Boolean)
      .sort();
    expect(fields).toEqual([
      'constraintDate',
      'constraintType',
      'id',
      'laneIndex',
      'version',
      'visualStart',
    ]);
  });

  it('writes no definition column in its UPDATE statement', () => {
    const statement =
      /updatePlacements[\s\S]*?UPDATE activities AS a([\s\S]*?)`/.exec(REPO)?.[1] ?? '';
    expect(statement).not.toBe('');
    // A representative slice of the definition surface — name and code are the two a planner would
    // notice, `duration_minutes` and `type` the two that would silently change the schedule.
    for (const column of ['name', 'code', 'description', 'duration_minutes', 'type', 'parent_id']) {
      expect(statement).not.toMatch(new RegExp(`\\b${column}\\s*=`));
    }
  });
});
