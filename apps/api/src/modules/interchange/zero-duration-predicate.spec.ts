import { $Enums } from '@prisma/client';
import { isZeroDurationImportTask } from '@repo/interchange';
import { isZeroDurationTask } from '@repo/types';
import { describe, expect, it } from 'vitest';

/**
 * **One meaning of "a zero-duration task", in two packages** (ADR-0162, M5-T1).
 *
 * `@repo/interchange` is pure and depends on nothing of the application's, so its import advisory
 * restates `isZeroDurationTask` rather than importing it. This is the one place that imports both
 * and asserts they agree, over every activity type the database knows (Prisma's enum, so a type
 * added to the schema is asked about the day it lands) and over a zero and a non-zero duration.
 *
 * Verified red (M5 record) against an interchange predicate that dropped its type clause.
 */
describe('isZeroDurationImportTask agrees with isZeroDurationTask', () => {
  const types = Object.values($Enums.ActivityType);

  it('asks about every activity type', () => {
    expect(types.length).toBeGreaterThanOrEqual(7);
  });

  it.each(types.flatMap((type) => [0, 1, 480].map((minutes) => [type, minutes] as const)))(
    '%s with %i minutes',
    (type, minutes) => {
      expect(isZeroDurationImportTask(type, minutes)).toBe(isZeroDurationTask(type, minutes));
    },
  );
});
