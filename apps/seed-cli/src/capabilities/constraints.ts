import type { SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan, DAY, link } from './builders.js';

/**
 * **Constraints** (ADR-0066 M2) — one activity per constraint type, each with the same predecessor,
 * so the ONLY thing that differs between them is the constraint. That is the whole design: put two
 * constraints on one chain and you can no longer say which one moved the date.
 *
 * The dates are chosen relative to the 2026-03-02 data date so each constraint actually bites. A
 * constraint that is satisfied anyway is indistinguishable from no constraint at all, which is the
 * commonest way a constraint test proves nothing.
 */
export function constraintsPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-constraints',
    name: 'Constraints: every type, one activity each',
    description:
      'Each activity below carries exactly one constraint and the same single predecessor, so any ' +
      'date that differs from C0’s successor does so BECAUSE of the constraint. The two mandatory ' +
      'ones break the logic on purpose and must be flagged, not silently obeyed or silently ' +
      'dropped. ALAP carries no date — it is a flag, not a constraint.',
    activities: [
      activity('C0', { name: 'Common predecessor' }),
      activity('C_SNET', {
        name: 'Start no earlier than 23 Mar',
        constraintType: 'SNET',
        constraintDate: '2026-03-23',
        testTags: ['con_snet'],
      }),
      activity('C_SNLT', {
        name: 'Start no later than 11 Mar',
        constraintType: 'SNLT',
        constraintDate: '2026-03-11',
        testTags: ['con_snlt'],
      }),
      activity('C_FNET', {
        name: 'Finish no earlier than 3 Apr',
        constraintType: 'FNET',
        constraintDate: '2026-04-03',
        testTags: ['con_fnet'],
      }),
      activity('C_FNLT', {
        name: 'Finish no later than 20 Mar',
        constraintType: 'FNLT',
        constraintDate: '2026-03-20',
        testTags: ['con_fnlt'],
      }),
      activity('C_MSO', {
        name: 'Start on 25 Mar',
        constraintType: 'MSO',
        constraintDate: '2026-03-25',
        testTags: ['con_start_on'],
      }),
      activity('C_MFO', {
        name: 'Finish on 31 Mar',
        constraintType: 'MFO',
        constraintDate: '2026-03-31',
        testTags: ['con_finish_on'],
      }),
      // A mandatory constraint is the one kind that is allowed to BREAK the logic: the date wins
      // even when a predecessor says otherwise (ADR-0035 §7). The engine produces the schedule and
      // flags it — `constraintViolated` — rather than refusing the edit or quietly moving the date.
      activity('C_MAND_START', {
        name: 'Mandatory start 4 Mar (before its predecessor can finish)',
        constraintType: 'MANDATORY_START',
        constraintDate: '2026-03-04',
        testTags: ['con_mandatory_start', 'breaks_logic'],
      }),
      activity('C_MAND_FINISH', {
        name: 'Mandatory finish 13 Mar',
        constraintType: 'MANDATORY_FINISH',
        constraintDate: '2026-03-13',
        testTags: ['con_mandatory_finish'],
      }),
      // ALAP is filed under constraints in P6 and is NOT one here: it carries no date and clamps
      // nothing, it just pushes the activity as late as its successors allow (ADR-0035 §16).
      activity('C_ALAP', {
        name: 'As late as possible',
        scheduleAsLateAsPossible: true,
        testTags: ['con_alap'],
      }),
      // Two constraints on one activity — the only place the secondary slot is exercised, and the
      // pair has to be resolved together rather than last-one-wins.
      activity('C_SECONDARY', {
        name: 'SNET with a secondary FNLT',
        constraintType: 'SNET',
        constraintDate: '2026-03-16',
        secondaryConstraintType: 'FNLT',
        secondaryConstraintDate: '2026-04-10',
        testTags: ['con_secondary_fnlt'],
      }),
      // 2026-03-21 is a Saturday. A constraint date on a non-working day must resolve to a legal
      // working instant rather than pinning the bar into the weekend wash.
      activity('C_NONWORK', {
        name: 'SNET on a Saturday',
        constraintType: 'SNET',
        constraintDate: '2026-03-21',
        testTags: ['con_on_nonworkday'],
      }),
    ],
    dependencies: [
      link('C0', 'C_SNET'),
      link('C0', 'C_SNLT'),
      link('C0', 'C_FNET'),
      link('C0', 'C_FNLT'),
      link('C0', 'C_MSO'),
      link('C0', 'C_MFO'),
      link('C0', 'C_MAND_START'),
      link('C0', 'C_MAND_FINISH'),
      link('C0', 'C_ALAP'),
      link('C0', 'C_SECONDARY'),
      link('C0', 'C_NONWORK'),
    ],
  });
}

/**
 * **Expected finish** is a plan-level opt-in (ADR-0035 §9): with `useExpectedFinishDates` off the
 * field is inert, so it needs its own plan rather than a thirteenth activity above — putting it
 * there would mean either turning the switch on for every constraint or shipping a field that does
 * nothing and looks like it works.
 */
export function expectedFinishPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-expected-finish',
    name: 'Constraints: expected finish',
    description:
      'E2 is in progress and carries an expected finish of 27 Mar. Because this plan turns ' +
      '`useExpectedFinishDates` ON, that date overrides the remaining duration; with the switch ' +
      'off the same field would change nothing at all.',
    options: { useExpectedFinishDates: true },
    activities: [
      activity('E1', { name: 'Predecessor' }),
      activity('E2', {
        name: 'In progress with an expected finish',
        progress: {
          status: 'IN_PROGRESS',
          percentComplete: 40,
          percentCompleteType: 'DURATION',
          physicalPercentComplete: null,
          actualStart: '2026-03-02T00:00',
          actualFinish: null,
          remainingDurationMinutes: 3 * 1440,
          suspendDate: null,
          resumeDate: null,
          expectedFinish: '2026-03-27T00:00',
        },
        testTags: ['con_expected_finish'],
      }),
      activity('E3', { name: 'Successor' }),
    ],
    dependencies: [link('E1', 'E2'), link('E2', 'E3')],
  });
}

/**
 * **The SNET effect classes** (ADR-0140's D-F/D-G/D-H diagnostics; the one-planning-surface epic's
 * M0/M-B-T3). The plan above demonstrates every constraint TYPE; this one demonstrates the three
 * readable EFFECTS one SNET can have, which is a different question — `plan:capability-constraints`
 * has no activity built to be inert, and none built to be permanently unclassified.
 *
 * An SNET applies as `max(logicEarlyStart, constraintDate)` (`engine/constraints.ts:155-156`), which
 * splits every SNET in the estate into three classes the arithmetic settles outright — plus a fourth
 * that arises two ways, only one of which this plan can hold still long enough to seed.
 *
 * `S_UNCLASSIFIED` is the permanent half of that fourth class: `compute.ts:765` writes a started
 * activity's actual start VERBATIM, bypassing the clamp altogether ("actuals never move", ADR-0035
 * §1) — so its early_start reads below its own constraint in a schedule computed seconds ago, and
 * never clears. The other half — a stored schedule that simply predates a constraint added since —
 * clears on the very next recalculation, which `seedPlan` performs exactly once, at the end of every
 * run. It is not a shape a single recalculate can hold still, so it is not seeded here: seeding it
 * would need a second, unrecalculated write after the one this catalogue always performs, which is a
 * different (and much rarer) product state than "the estate has a constraint like this in it" — an
 * ordinary planner mid-edit, not a resting shape a catalogue exists to demonstrate.
 */
export function snetEffectsPlan(): SeedSpec {
  // A plain Monday–Friday week, given explicitly. A plan with no `defaultCalendarKey` is PATCHed
  // with `calendarId: null`, which resolves to the ALL-MINUTES calendar (`plan-calendar.ts`) — every
  // date below (and the plain-language "9 Mar" in the description) depends on a weekend gap existing.
  const cal = calendar('SE_CAL', 'SNET effects five-day week', [1, 2, 3, 4, 5]);
  return capabilityPlan({
    seedName: 'capability-snet-effects',
    name: 'SNET: binding, inert, and unclassified by an actual start',
    description:
      'S_BINDING’s constraint (23 Mar) is later than logic alone would reach (9 Mar), so it wins: ' +
      'binding. S_INERT’s constraint (20 Feb) is earlier than logic already reaches, so the max() ' +
      'discards it: inert. S_UNCLASSIFIED started on 23 Feb — its early_start is that actual start, ' +
      'verbatim — under a constraint of 23 Mar; it reads below its own constraint permanently, ' +
      'because an actual start is never reclamped.',
    defaultCalendarKey: cal.key,
    calendars: [cal],
    activities: [
      activity('S0', { name: 'Common predecessor' }),
      activity('S_BINDING', {
        name: 'SNET the logic has not yet reached',
        constraintType: 'SNET',
        constraintDate: '2026-03-23',
      }),
      activity('S_INERT', {
        name: 'SNET the logic has already overtaken',
        constraintType: 'SNET',
        constraintDate: '2026-02-20',
      }),
      // No predecessor: the actual start is what decides early_start here, and giving it one would
      // only invite the question of whether the predecessor is what is being read instead.
      activity('S_UNCLASSIFIED', {
        name: 'Started before a later SNET, permanently unclassified',
        constraintType: 'SNET',
        constraintDate: '2026-03-23',
        progress: {
          status: 'IN_PROGRESS',
          percentComplete: 30,
          percentCompleteType: 'DURATION',
          physicalPercentComplete: null,
          actualStart: '2026-02-23T00:00',
          actualFinish: null,
          remainingDurationMinutes: 4 * DAY,
          suspendDate: null,
          resumeDate: null,
          expectedFinish: null,
        },
      }),
    ],
    dependencies: [link('S0', 'S_BINDING'), link('S0', 'S_INERT')],
  });
}
