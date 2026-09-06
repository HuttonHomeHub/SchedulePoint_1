import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { RevisionCompareQueryDto } from './revision-compare-query.dto';

/**
 * **A single `?include=changes` must validate**, and this test exists because it did not.
 *
 * The DTO shipped for one commit with `@IsArray()` and no normaliser, so the one shape the actual
 * client sends — a lone `include` — answered 400 and took the whole comparison endpoint with it.
 * Nothing in the unit tier or the 586-spec API e2e suite could see it: none of those specs passes
 * `include` at all, and the panel's own tests are handed a fixture and never cross the route. It
 * was caught by the flag-on journey on its first run, driving the real product against the real
 * API — which is the argument ADR-0081 makes for landing that journey at the first user-facing
 * milestone rather than at enablement.
 *
 * Both arities are pinned. The single case is the regression; the repeated case is its control,
 * because a normaliser that broke arrays would pass the single case alone.
 */
const base = { from: '0199a1b2-c3d4-7000-8000-000000000001', to: 'live' };

const validate = (over: Record<string, unknown>) =>
  validateSync(plainToInstance(RevisionCompareQueryDto, { ...base, ...over }));

describe('RevisionCompareQueryDto', () => {
  it('accepts a SINGLE include, which is what the client actually sends', () => {
    expect(validate({ include: 'changes' })).toEqual([]);
  });

  it('accepts a REPEATED include', () => {
    expect(validate({ include: ['changes', 'progress'] })).toEqual([]);
  });

  it('accepts no include at all — the byte-identical default', () => {
    expect(validate({})).toEqual([]);
  });

  it('rejects an unknown projection rather than silently ignoring it', () => {
    // Silently dropping it would leave a caller believing they had asked for something.
    const errors = validate({ include: 'everything' });
    expect(errors).not.toEqual([]);
  });
});
