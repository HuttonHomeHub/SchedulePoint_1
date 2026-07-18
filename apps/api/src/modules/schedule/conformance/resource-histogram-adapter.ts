import type { ResourceCurveType } from '@repo/types';

import type { ConformanceFixture, FixtureAssignment } from '@repo/engine-conformance';

import { allMinutesWorkCalendar } from '../engine';
import type { HistogramAssignmentInput } from '../engine';

/**
 * The **fixture→resource-histogram adapter** (F3 conformance slice, ADR-0044 §3 / ADR-0035 §31). A
 * sibling of `earned-value-adapter.ts`, scoped to resource loading curves: it reads the P6-class
 * fixture's `resource_curves` (the five named 21-point profiles) and each `assignments.curve` reference,
 * and builds the pure `resource-histogram.ts` inputs.
 *
 * **Self-baselined, no external oracle (ADR-0034).** The built-in profile constants in
 * `resource-histogram.ts` are byte-equal to the fixture's `resource_curves` points (asserted in the
 * conformance spec), so a golden distributed with the fixture's own points equals one distributed with
 * the built-in constants — the first-principles proof needs no P6 export.
 *
 * **The fixture carries no computed CPM dates** (like the EV adapter), so — exactly as the EV3 goldens
 * supply a synthetic baseline window — the caller supplies the span (`start`/`finish`) and calendar the
 * curve is distributed over. The fixture's real `budgeted_units`, `curve` reference and `assignment_lag_h`
 * are read straight through; everything else is documented at the point of use.
 */

/** Map a fixture `resource_curves` id onto the typed {@link ResourceCurveType}. */
export function mapFixtureCurve(curveId: string): ResourceCurveType {
  switch (curveId) {
    // The fixture's "LINEAR" is a flat load ⇒ SchedulePoint's UNIFORM (a genuine flat distribution, not
    // the fixture's discretised twenty-of-5 array); the byte-identical no-curve path.
    case 'LINEAR':
      return 'UNIFORM';
    case 'BELL':
      return 'BELL';
    case 'FRONT_LOADED':
      return 'FRONT_LOADED';
    case 'BACK_LOADED':
      return 'BACK_LOADED';
    case 'DOUBLE_PEAK':
      return 'DOUBLE_PEAK';
    default:
      return 'UNIFORM';
  }
}

/** The raw 21-point profile the fixture stores for a `resource_curves` id (throws if absent). */
export function fixtureCurvePoints(fixture: ConformanceFixture, curveId: string): number[] {
  const curve = fixture.resource_curves.find((c) => c.id === curveId);
  if (!curve) throw new Error(`Fixture has no resource_curves entry "${curveId}".`);
  return [...curve.points];
}

/**
 * Build one histogram input from a fixture assignment. The `profile` is resolved from the fixture's OWN
 * `resource_curves` points (the self-baseline source), except a `LINEAR` curve resolves to `null` (a flat
 * `UNIFORM` load), so `UNIFORM` stays byte-identical to a flat-rate load. `assignment_lag_h` becomes
 * `lagMinutes` (×60). The caller supplies the span + calendar (the fixture has no computed dates).
 */
export function buildHistogramInputFromFixture(
  fixture: ConformanceFixture,
  assignment: FixtureAssignment,
  span: { start: string; finish: string; calendar?: HistogramAssignmentInput['calendar'] },
): HistogramAssignmentInput {
  const isFlat = assignment.curve === 'LINEAR';
  return {
    resourceId: assignment.resource,
    activityId: assignment.activity,
    budgetedUnits: assignment.budgeted_units,
    profile: isFlat ? null : fixtureCurvePoints(fixture, assignment.curve),
    start: span.start,
    finish: span.finish,
    lagMinutes: Math.round(assignment.assignment_lag_h * 60),
    calendar: span.calendar ?? allMinutesWorkCalendar,
  };
}

/** Find a fixture assignment by id (throws if the curated selection drifts from the fixture). */
export function fixtureAssignment(fixture: ConformanceFixture, id: string): FixtureAssignment {
  const asg = fixture.assignments.find((a) => a.id === id);
  if (!asg) throw new Error(`Fixture has no assignment "${id}".`);
  return asg;
}
