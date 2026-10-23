import type { SeedActivity, SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan, link } from './builders.js';

/** An explicit Monday–Friday week, for the reason `visual-placements.ts` states. */
const SWIMLANE_CAL = calendar('SW_CAL', 'Swimlanes five-day week', [1, 2, 3, 4, 5]);
const SWIMLANE_WBS_CAL = calendar('SWW_CAL', 'Swimlanes by WBS five-day week', [1, 2, 3, 4, 5]);

/**
 * The three swimlane names, shared by both plans. Long on purpose: the band's label wraps, and a
 * name that fits on one line proves nothing about the wrap (swimlanes spec §4). The middle one opens
 * with a capital E-acute, because the name rule compares case-insensitively and an ASCII-only name
 * cannot show a fold that is wrong for accented letters.
 */
const LANE_FOUNDATIONS = 'Substructure, piling and ground-bearing slab up to the podium level';
const LANE_ELECTRICAL =
  'Électricité courants forts et faibles, including temporary builder’s power';
const LANE_SERVICES = 'Mechanical, plumbing and fire-protection services across every floor';

/**
 * The leaf activities, identical in both plans (they differ only in how a swimlane is derived).
 *
 * - `SW_A1` and `SW_B1` both start at the data date, last a week, and sit on lane 0 of their own
 *   swimlane. They do not overlap on the diagram — different swimlanes — but they would the moment
 *   one is moved into the other's swimlane, which is the collision auto-resolve has to settle.
 * - `SW_A2` to `SW_C2` is the cross-swimlane link.
 * - `SW_U1` is in no swimlane.
 */
function leaves(lane: (key: string) => Partial<SeedActivity>): SeedActivity[] {
  return [
    activity('SW_A1', { name: 'Pile caps', swimlaneLane: 0, ...lane('A') }),
    activity('SW_A2', { name: 'Ground-bearing slab pour', swimlaneLane: 0, ...lane('A') }),
    activity('SW_B1', { name: 'First-fix containment', swimlaneLane: 0, ...lane('B') }),
    activity('SW_B2', { name: 'Distribution boards', swimlaneLane: 0, ...lane('B') }),
    activity('SW_C1', { name: 'Riser brackets', swimlaneLane: 0, ...lane('C') }),
    activity('SW_C2', { name: 'Pipework first fix', swimlaneLane: 0, ...lane('C') }),
    activity('SW_U1', { name: 'Site welfare cabins, in no swimlane' }),
  ];
}

const LEAF_LINKS = [
  link('SW_A1', 'SW_A2'),
  link('SW_B1', 'SW_B2'),
  link('SW_C1', 'SW_C2'),
  // The cross-swimlane link: the slab (substructure) must be poured before the pipework above it.
  link('SW_A2', 'SW_C2'),
];

/**
 * **Swimlanes made by hand** (swimlanes spec, M1-T5). The plan's source is `MANUAL`: three
 * swimlanes created in order, each activity filed in one by `swimlaneId`, one left in none.
 */
export function swimlanesPlan(): SeedSpec {
  const spec = capabilityPlan({
    seedName: 'capability-swimlanes',
    name: 'Swimlanes: three long-named bands made by hand',
    description:
      'Three swimlanes with names long enough to wrap, the second opening with a capital E-acute. ' +
      'SW_U1 is in no swimlane. SW_A2 to SW_C2 crosses from the first swimlane to the third. SW_A1 ' +
      'and SW_B1 share dates and lane 0 in different swimlanes, so moving one into the other’s ' +
      'swimlane makes them overlap.',
    defaultCalendarKey: SWIMLANE_CAL.key,
    calendars: [SWIMLANE_CAL],
    activities: leaves((band) => ({ swimlaneKey: `lane-${band}` })),
    dependencies: LEAF_LINKS,
  });
  return {
    ...spec,
    swimlanes: {
      source: 'MANUAL',
      lanes: [
        { key: 'lane-A', name: LANE_FOUNDATIONS },
        { key: 'lane-B', name: LANE_ELECTRICAL },
        { key: 'lane-C', name: LANE_SERVICES },
      ],
    },
  };
}

/**
 * **Swimlanes from the WBS, at level 1** — the same leaf activities. A WBS source has no swimlane
 * rows to create: the swimlanes are the level-1 summaries, so each lane is a `WBS_SUMMARY` carrying
 * the lane's name, and membership is `parentKey`. `SW_U1` has no parent, which is "No WBS group".
 */
export function swimlanesWbsPlan(): SeedSpec {
  const summaries = [
    activity('SW_W1', { name: LANE_FOUNDATIONS, type: 'WBS_SUMMARY', durationMinutes: 0 }),
    activity('SW_W2', { name: LANE_ELECTRICAL, type: 'WBS_SUMMARY', durationMinutes: 0 }),
    activity('SW_W3', { name: LANE_SERVICES, type: 'WBS_SUMMARY', durationMinutes: 0 }),
  ];
  const parentOf: Record<string, string> = { A: 'SW_W1', B: 'SW_W2', C: 'SW_W3' };
  const spec = capabilityPlan({
    seedName: 'capability-swimlanes-wbs',
    name: 'Swimlanes: the same three bands from the WBS',
    description:
      'The same seven activities as the by-hand swimlanes plan, with the swimlanes taken from the ' +
      'level-1 WBS summaries: three long-named summaries, the second opening with a capital ' +
      'E-acute. SW_U1 has no summary, so it is in no swimlane. The cross-swimlane link and the ' +
      'overlapping pair are the same activities as in the by-hand plan.',
    defaultCalendarKey: SWIMLANE_WBS_CAL.key,
    calendars: [SWIMLANE_WBS_CAL],
    activities: [...summaries, ...leaves((band) => ({ parentKey: parentOf[band] ?? null }))],
    dependencies: LEAF_LINKS,
  });
  return { ...spec, swimlanes: { source: 'WBS', wbsLevel: 1 } };
}
