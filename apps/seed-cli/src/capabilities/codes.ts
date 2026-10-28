import type { SeedActivity, SeedCodes, SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan, link } from './builders.js';

/** An explicit Monday–Friday week, for the reason `visual-placements.ts` states. */
const CODES_CAL = calendar('CD_CAL', 'Codes five-day week', [1, 2, 3, 4, 5]);

/**
 * Three code types, shaped so that each of the states a reader must tell apart exists once:
 *
 * - **Area** — four values; `L2` is carried by no activity (a value that is deletable at no cost).
 * - **Trade** — five values; `FIN` is carried by no activity.
 * - **Phase** — three values and **no activity carries any**: a type that exists and is used by
 *   nothing, which the activity list must not mistake for a type every activity has a value for.
 */
const CODES: SeedCodes = {
  types: [
    {
      key: 'area',
      name: 'Area',
      values: [
        { key: 'gf', shortCode: 'GF', description: 'Ground floor' },
        { key: 'l1', shortCode: 'L1', description: 'Level 1' },
        { key: 'l2', shortCode: 'L2', description: 'Level 2' },
        { key: 'rf', shortCode: 'RF', description: 'Roof' },
      ],
    },
    {
      key: 'trade',
      name: 'Trade',
      values: [
        { key: 'civ', shortCode: 'CIV', description: 'Civil and groundworks' },
        { key: 'str', shortCode: 'STR', description: 'Structural steel' },
        { key: 'mep', shortCode: 'MEP', description: 'Mechanical, electrical and plumbing' },
        { key: 'env', shortCode: 'ENV', description: 'Building envelope' },
        { key: 'fin', shortCode: 'FIN', description: 'Finishes' },
      ],
    },
    {
      key: 'phase',
      name: 'Phase',
      values: [
        { key: 'ph1', shortCode: 'PH1' },
        { key: 'ph2', shortCode: 'PH2' },
        { key: 'ph3', shortCode: 'PH3' },
      ],
    },
  ],
};

/**
 * The eight activities and the values each carries. `CD_5` has an Area and no Trade, `CD_7` a Trade
 * and no Area, and `CD_8` nothing at all — so "no value" is exhibited for each of the two used
 * types and for an activity that has no code anywhere.
 */
const CODED: readonly (readonly [key: string, name: string, codes?: Record<string, string>])[] = [
  ['CD_1', 'Piling', { area: 'gf', trade: 'civ' }],
  ['CD_2', 'Ground-bearing slab', { area: 'gf', trade: 'civ' }],
  ['CD_3', 'Steel frame', { area: 'l1', trade: 'str' }],
  ['CD_4', 'First-fix services', { area: 'l1', trade: 'mep' }],
  ['CD_5', 'Fit-out, in no trade', { area: 'l1' }],
  ['CD_6', 'Roof deck', { area: 'rf', trade: 'env' }],
  ['CD_7', 'Cladding, in no area', { trade: 'env' }],
  ['CD_8', 'Snagging, with no codes at all'],
];

/**
 * **Activity codes** (p6-activity-codes, M2-T6): three code types made through the code-types
 * routes, and values set on eight activities through `PATCH …/activities/codes`. Nothing about a
 * code moves a date, so the schedule is an ordinary chain and the plan is read for its `codes`.
 */
export function codesPlan(): SeedSpec {
  const activities: SeedActivity[] = CODED.map(([key, name, codes]) =>
    activity(key, { name, ...(codes === undefined ? {} : { codes }) }),
  );
  const spec = capabilityPlan({
    seedName: 'capability-codes',
    name: 'Codes: three types, eight activities, every state of "no value"',
    description:
      'Three code types: Area (four values, L2 unused), Trade (five values, FIN unused) and Phase ' +
      '(three values, carried by no activity). Eight activities: CD_1 and CD_2 carry GF and CIV, ' +
      'CD_5 an Area and no Trade, CD_7 a Trade and no Area, and CD_8 no code at all. No code moves ' +
      'a date.',
    defaultCalendarKey: CODES_CAL.key,
    calendars: [CODES_CAL],
    activities,
    dependencies: [
      link('CD_1', 'CD_2'),
      link('CD_2', 'CD_3'),
      link('CD_3', 'CD_4'),
      link('CD_4', 'CD_5'),
      link('CD_3', 'CD_6'),
      link('CD_6', 'CD_7'),
      link('CD_5', 'CD_8'),
      link('CD_7', 'CD_8'),
    ],
  });
  return { ...spec, codes: CODES };
}
