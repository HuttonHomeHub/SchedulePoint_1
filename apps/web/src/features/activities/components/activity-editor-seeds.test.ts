import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { seedCost, seedGeneral, seedMeasure, seedScheduling } from './activity-editor-seeds';

import {
  activityCostShape,
  activityGeneralShape,
  activityMeasureShape,
  activitySchedulingShape,
} from '@/features/activities/schemas/activity-scope-schemas';

/**
 * **A seed names every key its scope's schema does, whatever the row holds**
 * (docs/specs/activity-editor-seeding, M3b).
 *
 * An optional field's key must be PRESENT in the defaults — as `undefined` when unset — because a
 * registered input reports `undefined` for an empty value and react-hook-form's deep-equal counts a
 * key the defaults lack as a difference: the form reads dirty before anybody touches it. The
 * comment in `activity-editor-seeds.ts` states the rule; this is what stops a new schema field from
 * being added without its seed, or a seed from dropping a key when its value is null.
 */

/** Every field the row can carry, null — the shape that tempts a seed to omit a key. */
const NULL_ROW = new Proxy(
  {},
  {
    get: () => null,
  },
) as unknown as ActivitySummary;

const SCOPES = [
  ['general', seedGeneral, activityGeneralShape],
  ['scheduling', seedScheduling, activitySchedulingShape],
  ['cost', seedCost, activityCostShape],
  ['measure', seedMeasure, activityMeasureShape],
] as const;

describe.each(SCOPES)('the %s seed', (_scope, seed, shape) => {
  const expected = Object.keys(shape).sort();

  it('names every schema key for a create', () => {
    expect(Object.keys(seed(undefined)).sort()).toEqual(expected);
  });

  it('names every schema key for a row whose nullable fields are all null', () => {
    expect(Object.keys(seed(NULL_ROW)).sort()).toEqual(expected);
  });
});
