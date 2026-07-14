import { describe, expect, it } from 'vitest';

import { planFormSchema } from './plan-schemas';

/**
 * `planFormSchema.plannedStart` is required (ADR-0033 M1): the CPM data date
 * that anchors the schedule, so a plan can never be authored without one.
 */
describe('planFormSchema', () => {
  const base = { name: 'Baseline', status: 'DRAFT' as const };

  it('rejects an empty plannedStart with a friendly message', () => {
    const result = planFormSchema.safeParse({ ...base, plannedStart: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.plannedStart).toContain(
        'A project start date is required.',
      );
    }
  });

  it('rejects a missing plannedStart field entirely', () => {
    const result = planFormSchema.safeParse({ ...base });
    expect(result.success).toBe(false);
  });

  it('accepts a valid plannedStart', () => {
    const result = planFormSchema.safeParse({ ...base, plannedStart: '2026-05-01' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plannedStart).toBe('2026-05-01');
    }
  });
});
