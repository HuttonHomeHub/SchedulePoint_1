import type { SeedSpec } from '@repo/seed';

import { activity, assignment, calendar, capabilityPlan, DAY, link, resource } from './builders.js';

/**
 * **Activity types, Level of Effort and the WBS** (ADR-0066 M2).
 *
 * This is the family both defects that motivated ADR-0066 lived in — LOE coerced to a zero-duration
 * task at the importer, and `parentId` never reaching the engine so every summary collapsed to a
 * point. Both were green at the engine. A five-activity WBS with an obvious right answer is the
 * plan that would have shown either of them in seconds.
 */
export function typesAndWbsPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-types-and-wbs',
    name: 'Types: milestones, LOE and WBS summaries',
    description:
      'W1 spans its two children and must run from T1’s start to T2’s finish — NOT collapse to a ' +
      'point at the data date. G1 is a Level of Effort activity spanning the same logic; it has no ' +
      'duration of its own and must never be critical or drive anything. M_START and M_FIN take no ' +
      'time; Z is a zero-duration TASK, which is a different thing.',
    defaultCalendarKey: 'TW_CAL',
    calendars: [
      calendar('TW_CAL', 'Types five-day week', [1, 2, 3, 4, 5]),
      // A DIFFERENT working week from the plan's, so an LOE whose span ends sit on the plan calendar
      // has to resolve its own span on this one. Same-calendar LOE hides the whole question.
      calendar('TW_CAL6', 'Types six-day week', [1, 2, 3, 4, 5, 6]),
      // ORG scope, and it has to be: a resource may hold only an organisation calendar (ADR-0053
      // §2 — a project calendar is a hard 422, `RESOURCE_REQUIRES_ORG_CALENDAR`). Its working week
      // differs from the plan's so the resource-dependent activity below actually moves.
      calendar('TW_CAL_RES', 'Types rig week (shared)', [1, 2, 3, 4, 5, 6], { scope: 'ORG' }),
    ],
    resources: [
      resource('TW_CREW', 'Types crew', { kind: 'LABOUR' }),
      // Its own calendar, so `RESOURCE_DEPENDENT` has something to be dependent ON.
      resource('TW_RIG', 'Types rig', {
        kind: 'EQUIPMENT',
        calendarKey: 'TW_CAL_RES',
        maxUnitsPerHour: 1,
      }),
    ],
    activities: [
      activity('W1', {
        name: 'Foundations (summary)',
        type: 'WBS_SUMMARY',
        durationMinutes: 0,
        testTags: ['type_wbs_summary'],
      }),
      activity('T1', { name: 'Excavate', parentKey: 'W1', durationMinutes: 4 * DAY }),
      activity('T2', { name: 'Pour', parentKey: 'W1', durationMinutes: 6 * DAY }),
      activity('M_START', {
        name: 'Notice to proceed',
        type: 'START_MILESTONE',
        durationMinutes: 0,
        testTags: ['type_start_ms'],
      }),
      activity('M_FIN', {
        name: 'Foundations complete',
        type: 'FINISH_MILESTONE',
        durationMinutes: 0,
        testTags: ['type_finish_ms'],
      }),
      // LOE takes its dates from the logic it hangs off, so it needs both a start-side and a
      // finish-side predecessor — that pair IS the span (ADR-0035 §21).
      activity('G1', {
        name: 'Site supervision (LOE)',
        type: 'LEVEL_OF_EFFORT',
        durationMinutes: 0,
        testTags: ['type_loe', 'loe_span_start', 'loe_span_end', 'loe_spans_project'],
      }),
      // The same shape on a calendar the span ends do not share. The span has to be resolved on the
      // LOE's own calendar, which is the case that separates "spans the logic" from "copies dates".
      activity('G2', {
        name: 'Six-day supervision (LOE)',
        type: 'LEVEL_OF_EFFORT',
        durationMinutes: 0,
        calendarKey: 'TW_CAL6',
        testTags: ['loe_different_calendar_to_span_ends'],
      }),
      // Two activities of the same duration, one scheduling on its own calendar and one on its
      // DRIVING RESOURCE's six-day week (ADR-0039 §23). Side by side, the contrast is the
      // capability — and it has to be SEVEN days, not five: five working days from a Monday cross
      // no weekend, so both calendars finish on the same Friday and the plan demonstrates nothing.
      // Measured against the real engine, which is the only way that would have been noticed.
      activity('T_TASK', {
        name: 'Task-dependent install',
        durationMinutes: 7 * DAY,
        testTags: ['type_task_vs_resource_contrast'],
      }),
      activity('T_RES', {
        name: 'Resource-dependent install',
        type: 'RESOURCE_DEPENDENT',
        durationMinutes: 7 * DAY,
        testTags: ['type_resource_dependent'],
      }),
    ],
    dependencies: [
      link('M_START', 'T1'),
      link('T1', 'T2'),
      link('T2', 'M_FIN'),
      link('M_START', 'G1'),
      link('G1', 'M_FIN', { type: 'FF' }),
      link('M_START', 'G2'),
      link('G2', 'M_FIN', { type: 'FF' }),
      link('M_START', 'T_TASK'),
      link('M_START', 'T_RES'),
    ],
    assignments: [
      assignment('T_TASK', 'TW_CREW'),
      assignment('T_RES', 'TW_RIG', { isDriving: true, unitsPerHour: 1 }),
    ],
  });
}
