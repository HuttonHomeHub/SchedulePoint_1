import type { SeedActivity, SeedCodes, SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan } from './builders.js';

const WIDE_CAL = calendar('CW_CAL', 'Wide codes five-day week', [1, 2, 3, 4, 5]);

/**
 * A swimlane picture draws at most 100 bands (`SWIMLANE_LIMIT` in `@repo/types`, which this package
 * does not depend on, so the figure is stated here and checked by `coverage.spec.ts`). **Room** is the
 * smallest type that must be refused as a swimlane source, one value too many, and **Zone** the
 * largest that must not be.
 */
const ROOMS = 101;
const ZONES = 100;

const pad = (n: number): string => String(n + 1).padStart(3, '0');

const CODES: SeedCodes = {
  types: [
    {
      key: 'room',
      name: 'Room',
      values: Array.from({ length: ROOMS }, (_, i) => ({
        key: `r${pad(i)}`,
        shortCode: `R${pad(i)}`,
        description: `Room ${pad(i)}`,
      })),
    },
    {
      key: 'zone',
      name: 'Zone',
      values: Array.from({ length: ZONES }, (_, i) => ({
        key: `z${pad(i)}`,
        shortCode: `Z${pad(i)}`,
        description: `Zone ${pad(i)}`,
      })),
    },
  ],
};

/**
 * **Activity codes at the swimlane limit** (p6-activity-codes M4-T6): a type with more values in use
 * than a swimlane picture can draw, and one with exactly as many as it can. 101 activities, none
 * linked (the plan is read for its codes, and a chain would only make the diagram taller); each
 * carries its own Room, so Room has 101 values in use, and a Zone by `index % 100`, so Zone
 * has 100 in use with the last activity sharing the first one's.
 *
 * Its own family (`codes-wide`) so `--family codes` stays the eight-activity plan every earlier case
 * reads, and so a case that wants this one pays for 300-odd requests only when it asks.
 */
export function codesWidePlan(): SeedSpec {
  const activities: SeedActivity[] = Array.from({ length: ROOMS }, (_, i) =>
    activity(`CW_${pad(i)}`, {
      name: `Work in room ${pad(i)}`,
      codes: { room: `r${pad(i)}`, zone: `z${pad(i % ZONES)}` },
    }),
  );
  const spec = capabilityPlan({
    seedName: 'capability-codes-wide',
    name: 'Codes wide: Room with 101 values in use, Zone with 100',
    description:
      `One hundred and one activities. Room has ${ROOMS} values, each carried by one activity, so ` +
      `${ROOMS} are in use: more than a swimlane picture can draw. Zone has ${ZONES} values, all ` +
      `in use (the last activity shares the first one's), exactly as many as it can. Nothing is ` +
      `linked and no code moves a date.`,
    defaultCalendarKey: WIDE_CAL.key,
    calendars: [WIDE_CAL],
    activities,
    dependencies: [],
  });
  return { ...spec, codes: CODES };
}
