import type { SeedSpec } from '@repo/seed';

import { activity, assignment, calendar, capabilityPlan, DAY, link, resource } from './builders.js';

/**
 * **Resources, duration types and loading curves** (ADR-0066 M2).
 *
 * Most of this family is **unreachable through XER** — `max_units_per_hour`, `price_per_unit`,
 * `curve`, `duration_type` and the units/time rate have no column in the format (TECH_DEBT #77's
 * group 2). So this plan is the only route from the fixture's intent into a real database, and the
 * only place these fields are exercised end to end at all.
 */
export function resourcesPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-resources',
    name: 'Resources: kinds, driving, curves and duration types',
    description:
      'Each activity carries one assignment and differs in one thing only. A1–A3 show the three ' +
      'resource kinds. A_DRIVE schedules on its driving resource’s six-day calendar and so ' +
      'finishes earlier than the identical A_TASK. A_FU/A_FUT/A_FDU show what stays fixed when the ' +
      'units-per-hour rate changes. A_BELL and friends differ only in how the same units are spread.',
    defaultCalendarKey: 'RS_CAL',
    calendars: [
      calendar('RS_CAL', 'Resources five-day week', [1, 2, 3, 4, 5]),
      calendar('RS_CAL6', 'Resources six-day week (shared)', [1, 2, 3, 4, 5, 6], { scope: 'ORG' }),
    ],
    resources: [
      // The three kinds. Only LABOUR and EQUIPMENT consume calendar time; MATERIAL is a quantity,
      // and a scheduler that levels material against a working week is levelling the wrong thing.
      resource('R_LAB', 'Steel fixers', { kind: 'LABOUR', maxUnitsPerHour: 4, costPerUnit: 4200 }),
      resource('R_EQP', 'Tower crane', {
        kind: 'EQUIPMENT',
        maxUnitsPerHour: 1,
        costPerUnit: 18000,
      }),
      resource('R_MAT', 'Ready-mix concrete', { kind: 'MATERIAL', costPerUnit: 9500 }),
      // Holds its OWN calendar, which is what makes it able to drive an activity's dates.
      resource('R_DRIVER', 'Piling rig', {
        kind: 'EQUIPMENT',
        calendarKey: 'RS_CAL6',
        maxUnitsPerHour: 1,
        costPerUnit: 25000,
      }),
      // A GROUP is a navigation node and is NOT assignable (ADR-0053 §3) — it carries no calendar,
      // capacity or cost, and that is enforced by a CHECK, not a convention.
      resource('R_GROUP', 'Plant', { kind: 'GROUP' }),
      resource('R_GROUPED', 'Excavator', {
        kind: 'EQUIPMENT',
        parentKey: 'R_GROUP',
        maxUnitsPerHour: 1,
      }),
      // Archived is orthogonal to deleted: it still schedules identically and keeps every existing
      // reference live; it is only hidden from pickers and refused for NEW assignments (§4).
      resource('R_OLD', 'Retired hoist', { kind: 'EQUIPMENT', archived: true }),
    ],
    activities: [
      activity('A_LAB', { name: 'Labour assignment', testTags: ['res_labour'] }),
      activity('A_EQP', { name: 'Equipment assignment', testTags: ['res_nonlabour'] }),
      activity('A_MAT', { name: 'Material assignment', testTags: ['res_material'] }),
      // Seven days, not five: five working days from the Monday data date cross no weekend, so the
      // five-day and six-day calendars finish on the same Friday and the contrast is invisible.
      activity('A_TASK', { name: 'Task-dependent control', durationMinutes: 7 * DAY }),
      activity('A_DRIVE', {
        name: 'Driven by the rig’s calendar',
        durationMinutes: 7 * DAY,
        type: 'RESOURCE_DEPENDENT',
        // `cal_resource` is the calendar seen from the CALENDAR side — a calendar whose only holder
        // is a resource, which is why ADR-0053 §2 forces it to ORG scope. It is tagged on the
        // activity because that is where a reader can see it doing anything.
        testTags: ['res_driving', 'res_calendar_drives', 'cal_resource'],
      }),
      // Two activities on the SAME resource at the SAME time, demanding more than its ceiling. With
      // levelling off (this plan) they overlap and the over-allocation is visible; the levelling
      // plan below is the same shape with the switch on.
      activity('A_OVER_1', { name: 'Concurrent demand A', durationMinutes: 4 * DAY }),
      activity('A_OVER_2', {
        name: 'Concurrent demand B',
        durationMinutes: 4 * DAY,
        testTags: ['res_overallocation'],
      }),
      // The duration/units/rate triad (ADR-0040): fixing two of the three decides what the third
      // does when one changes. Same assignment on each, so only the type differs.
      activity('A_FDU', {
        name: 'Fixed duration and units/time',
        durationType: 'FIXED_DURATION_AND_UNITS_TIME',
        testTags: ['dt_fixed_dur_units'],
      }),
      activity('A_FU', {
        name: 'Fixed units',
        durationType: 'FIXED_UNITS',
        testTags: ['dt_fixed_units'],
      }),
      activity('A_FUT', {
        name: 'Fixed units/time',
        durationType: 'FIXED_UNITS_TIME',
        testTags: ['dt_fixed_units_time'],
      }),
      // The loading curves shape the histogram and the EV read-model only — no date moves. Four
      // activities identical but for the profile, so the curve is the only variable in the picture.
      activity('A_BELL', { name: 'Bell-loaded', testTags: ['res_curve_bell'] }),
      activity('A_FRONT', { name: 'Front-loaded', testTags: ['res_curve_front_loaded'] }),
      activity('A_BACK', { name: 'Back-loaded', testTags: ['res_curve_back_loaded'] }),
      activity('A_PEAK', { name: 'Double-peak', testTags: ['res_curve_double_peak'] }),
      // A_LAG is A_BELL's twin and differs in ONE thing: the crew joins two days late. Anything else
      // different between them (units, curve, duration, calendar) would make the histogram contrast
      // ambiguous — which is the whole point of the pairing.
      activity('A_LAG', { name: 'Bell-loaded, crew joins late', testTags: ['res_assignment_lag'] }),
    ],
    dependencies: [link('A_TASK', 'A_DRIVE', { type: 'SS' })],
    assignments: [
      assignment('A_LAB', 'R_LAB', { budgetedUnits: 160, unitsPerHour: 4 }),
      assignment('A_EQP', 'R_EQP', { budgetedUnits: 40, unitsPerHour: 1 }),
      assignment('A_MAT', 'R_MAT', { budgetedUnits: 120 }),
      assignment('A_TASK', 'R_LAB', { budgetedUnits: 40, unitsPerHour: 1 }),
      assignment('A_DRIVE', 'R_DRIVER', { budgetedUnits: 40, unitsPerHour: 1, isDriving: true }),
      assignment('A_OVER_1', 'R_EQP', { budgetedUnits: 32, unitsPerHour: 1 }),
      assignment('A_OVER_2', 'R_EQP', { budgetedUnits: 32, unitsPerHour: 1 }),
      assignment('A_FDU', 'R_LAB', { budgetedUnits: 40, unitsPerHour: 1 }),
      assignment('A_FU', 'R_LAB', { budgetedUnits: 40, unitsPerHour: 2 }),
      assignment('A_FUT', 'R_LAB', { budgetedUnits: 40, unitsPerHour: 2 }),
      assignment('A_BELL', 'R_LAB', { budgetedUnits: 80, unitsPerHour: 2, curveType: 'BELL' }),
      assignment('A_LAG', 'R_LAB', {
        budgetedUnits: 80,
        unitsPerHour: 2,
        curveType: 'BELL',
        // Two working days on RS_CAL's five-day week. The units are conserved and the same curve is
        // applied — the load simply starts two days in, so A_LAG's series is A_BELL's compressed.
        lagMinutes: 2 * 24 * 60,
      }),
      assignment('A_FRONT', 'R_LAB', {
        budgetedUnits: 80,
        unitsPerHour: 2,
        curveType: 'FRONT_LOADED',
      }),
      assignment('A_BACK', 'R_LAB', {
        budgetedUnits: 80,
        unitsPerHour: 2,
        curveType: 'BACK_LOADED',
      }),
      assignment('A_PEAK', 'R_LAB', {
        budgetedUnits: 80,
        unitsPerHour: 2,
        curveType: 'DOUBLE_PEAK',
      }),
      // The archived resource, assigned. Archiving refuses NEW assignments but an existing one keeps
      // working — that distinction is the whole point of it being orthogonal to delete.
      assignment('A_EQP', 'R_GROUPED', { budgetedUnits: 8, unitsPerHour: 1 }),
    ],
  });
}

/**
 * **Levelling** is an opt-in second engine pass (ADR-0041), so like Progress Override it needs its
 * own plan rather than a switch flipped on the plan above: with `levelResources` off the whole pass
 * is skipped and every activity here would sit exactly where the network put it.
 */
export function levellingPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-levelling',
    name: 'Resources: levelling a deliberate over-allocation',
    description:
      'V1, V2 and V3 all want the single crane at the same time and each needs all of it. With ' +
      'levelling ON they are pushed apart into a queue — V3 last, because it has the most float. ' +
      'With levelling off (the resources plan) they overlap and the crane is booked three times.',
    options: { levelResources: true, levelWithinFloatOnly: false },
    defaultCalendarKey: 'LV_CAL',
    calendars: [calendar('LV_CAL', 'Levelling five-day week', [1, 2, 3, 4, 5])],
    resources: [resource('LV_CRANE', 'Levelling crane', { kind: 'EQUIPMENT', maxUnitsPerHour: 1 })],
    activities: [
      activity('V0', { name: 'Enabling works', durationMinutes: 2 * DAY }),
      activity('V1', { name: 'Lift A', durationMinutes: 3 * DAY, levelingPriority: 1 }),
      activity('V2', { name: 'Lift B', durationMinutes: 3 * DAY, levelingPriority: 2 }),
      activity('V3', {
        name: 'Lift C',
        durationMinutes: 3 * DAY,
        levelingPriority: 3,
        testTags: ['levelling_test'],
      }),
      activity('V4', { name: 'Handover' }),
    ],
    dependencies: [
      link('V0', 'V1'),
      link('V0', 'V2'),
      link('V0', 'V3'),
      link('V1', 'V4'),
      link('V2', 'V4'),
      link('V3', 'V4'),
    ],
    assignments: [
      assignment('V1', 'LV_CRANE', { budgetedUnits: 24, unitsPerHour: 1, isDriving: true }),
      assignment('V2', 'LV_CRANE', { budgetedUnits: 24, unitsPerHour: 1, isDriving: true }),
      assignment('V3', 'LV_CRANE', { budgetedUnits: 24, unitsPerHour: 1, isDriving: true }),
    ],
  });
}

/**
 * **Levelling from where the bars are drawn** (#413, ADR-0166): `capability-levelling`'s three lifts
 * on one crane, with **V3 placed after V2's levelled slot**. On the shared five-day week V1 levels to
 * 4-6 Mar and V2 to 9-11 Mar, so V3's own levelled slot would be 12-16 Mar; it is placed on 23 Mar
 * instead. That makes it a matched pair with the plan above, which has no placement: the difference
 * between the two is the whole exhibit, so nothing else here may differ.
 *
 * V3's early start (4 Mar) is nowhere near its placed start, which is the point. A reader who sees
 * V3 delayed, ghosted, or its crane load in the week of 4 Mar is reading the network's dates for a
 * bar drawn a fortnight later.
 */
export function levellingPlacedPlan(): SeedSpec {
  const base = levellingPlan();
  return {
    ...base,
    seedName: 'capability-levelling-placed',
    plan: {
      ...base.plan,
      defaultCalendarKey: 'LVP_CAL',
      name: 'Resources: levelling with one lift placed by hand',
      description:
        'The same three lifts on the same crane as the levelling plan, but V3 is dragged to 23 Mar, ' +
        "after V2's levelled slot. Levelling starts from where each bar is drawn: V1 and V2 are still " +
        "serialised, V3 is not delayed and has no levelled ghost, and V3's crane load sits in the " +
        'week of 23 Mar in the resource histogram rather than in the week of 4 Mar.',
    },
    // A PROJECT calendar's name is unique within its project, and both plans are meant to be seedable
    // side by side into one (#428), so the placed plan cannot reuse the key and name it inherits.
    calendars: [calendar('LVP_CAL', 'Levelling placed five-day week', [1, 2, 3, 4, 5])],
    activities: base.activities.map((entry) =>
      entry.key === 'V3' ? { ...entry, visualStart: '2026-03-23', testTags: [] } : entry,
    ),
  };
}

/**
 * **Levelling that frees a resource part-way through a day** (`docs/specs/apply-levelled-dates/`;
 * M0 found no catalogue plan with this shape): a 4-hour lift and a 1-day lift share one crane on an
 * 08:00-16:00 week. The crane is free at 12:00 on Monday, so P2's levelled start is noon, but a
 * placement is stored as a DATE. Copying the ghost's date puts the bar at 08:00 and a half-day clash
 * comes straight back; only the next working day clears it, which is what **Apply levelled dates**
 * writes (ADR-0167, CQ-4). Durations are stated in minutes so the plan does not depend on any
 * day-to-minute factor.
 */
export function levellingPartDayPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-levelling-part-day',
    name: 'Resources: levelling that frees the crane part-way through a day',
    description:
      'P1 is a four-hour lift and P2 a one-day lift, both wanting the single crane on Monday on an ' +
      '08:00-16:00 week. With levelling ON the crane is free at 12:00, so P2 is levelled to start at ' +
      'noon on Monday. A placement is a date, so applying the levelled dates puts P2 on Tuesday, the ' +
      'next working day, and no clash remains. Copying the ghost date (Monday) leaves a half-day clash.',
    options: { levelResources: true, levelWithinFloatOnly: false },
    defaultCalendarKey: 'PD_CAL',
    calendars: [
      calendar('PD_CAL', 'Part-day 08:00-16:00 week', [], {
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          windows: weekday >= 1 && weekday <= 5 ? [{ startMinute: 480, endMinute: 960 }] : [],
        })),
      }),
    ],
    resources: [resource('PD_CRANE', 'Part-day crane', { kind: 'EQUIPMENT', maxUnitsPerHour: 1 })],
    activities: [
      activity('P1', { name: 'Short lift', durationMinutes: 240, levelingPriority: 1 }),
      activity('P2', { name: 'Day lift', durationMinutes: 480, levelingPriority: 2 }),
      activity('P3', { name: 'Handover', durationMinutes: 480 }),
    ],
    dependencies: [link('P1', 'P3'), link('P2', 'P3')],
    assignments: [
      assignment('P1', 'PD_CRANE', { budgetedUnits: 4, unitsPerHour: 1, isDriving: true }),
      assignment('P2', 'PD_CRANE', { budgetedUnits: 8, unitsPerHour: 1, isDriving: true }),
    ],
  });
}
