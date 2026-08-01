import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { IsMutuallyExclusiveWith } from './mutually-exclusive';

class Pair {
  @IsOptional()
  @IsInt()
  @IsMutuallyExclusiveWith('minutes')
  days?: number | null;

  @IsOptional()
  @IsInt()
  @IsMutuallyExclusiveWith('days')
  minutes?: number | null;
}

const errorsFor = (payload: Record<string, unknown>): string[] =>
  validateSync(plainToInstance(Pair, payload)).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );

describe('IsMutuallyExclusiveWith', () => {
  it('accepts either field alone, or neither', () => {
    expect(errorsFor({ days: 2 })).toEqual([]);
    expect(errorsFor({ minutes: 240 })).toEqual([]);
    expect(errorsFor({})).toEqual([]);
  });

  it('rejects both, and names the pair rather than picking a winner', () => {
    const errors = errorsFor({ days: 2, minutes: 240 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toContain('send one, not both');
  });

  // Applied to both fields on purpose: an omitted optional field skips its own validators, so a
  // one-sided rule would miss the case where the absent side is the one carrying it.
  it('fires whichever field the payload happens to carry', () => {
    expect(errorsFor({ days: 2, minutes: 240 }).length).toBe(2);
  });

  it('treats an explicit null as absent, so clearing one and setting the other is valid', () => {
    expect(errorsFor({ days: 2, minutes: null })).toEqual([]);
    expect(errorsFor({ days: null, minutes: 240 })).toEqual([]);
  });
});
