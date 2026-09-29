import { describe, expect, it } from 'vitest';

import { placedFinishSql, placedProjectFinishOf } from './placed-finish';

describe('placedFinishSql', () => {
  it('is the drawn finish, falling back to the early finish', () => {
    expect(placedFinishSql().sql).toBe('COALESCE(visual_effective_finish, early_finish)');
  });

  it('qualifies both columns with a table alias', () => {
    expect(placedFinishSql('act').sql).toBe(
      'COALESCE(act.visual_effective_finish, act.early_finish)',
    );
  });

  it('refuses an alias that is not a bare identifier', () => {
    expect(() => placedFinishSql('act; DROP TABLE plans')).toThrow();
  });
});

describe('placedProjectFinishOf', () => {
  it('is the latest drawn finish, even when it is later than every early finish', () => {
    expect(
      placedProjectFinishOf([
        { earlyFinish: '2026-01-03', visualEffectiveFinish: '2026-01-03' },
        { earlyFinish: '2026-01-01', visualEffectiveFinish: '2026-01-20' },
      ]),
    ).toBe('2026-01-20');
  });

  it('is null when there is nothing to draw', () => {
    expect(placedProjectFinishOf([])).toBeNull();
  });
});
