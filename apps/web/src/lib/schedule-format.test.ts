import { describe, expect, it } from 'vitest';

import { criticality, formatFloat } from './schedule-format';

const base = { isCritical: false, isNearCritical: false, totalFloat: 5 };

describe('criticality', () => {
  it('returns no badge for a never-calculated activity', () => {
    expect(criticality({ ...base, totalFloat: null })).toBeNull();
  });

  it('returns no badge for ordinary positive float', () => {
    expect(criticality(base)).toBeNull();
  });

  it('flags the critical path', () => {
    expect(criticality({ isCritical: true, isNearCritical: false, totalFloat: 0 })).toEqual({
      label: 'Critical',
      variant: 'critical',
    });
  });

  it('flags the near-critical band', () => {
    expect(criticality({ isCritical: false, isNearCritical: true, totalFloat: 3 })).toEqual({
      label: 'Near-critical',
      variant: 'warning',
    });
  });
});

describe('formatFloat', () => {
  it('renders an em dash when uncomputed', () => {
    expect(formatFloat(null)).toBe('—');
  });

  it('renders positive and zero float in working days', () => {
    expect(formatFloat(0)).toBe('0 d');
    expect(formatFloat(3)).toBe('3 d');
  });

  it('renders a negative float with a real minus sign', () => {
    expect(formatFloat(-2)).toBe('−2 d');
  });
});
