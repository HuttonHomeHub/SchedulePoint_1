import type { ConstraintType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { constraintAnchor, formatConstraint } from './constraint-format';

describe('constraintAnchor', () => {
  it('anchors start-kinds to the start edge', () => {
    for (const t of ['SNET', 'SNLT', 'MSO', 'MANDATORY_START'] as ConstraintType[]) {
      expect(constraintAnchor(t)).toBe('start');
    }
  });

  it('anchors finish-kinds to the finish edge', () => {
    for (const t of ['FNET', 'FNLT', 'MFO', 'MANDATORY_FINISH'] as ConstraintType[]) {
      expect(constraintAnchor(t)).toBe('finish');
    }
  });
});

describe('formatConstraint', () => {
  it('formats a honoured constraint with shorthand + a spelled-out full label', () => {
    expect(formatConstraint({ constraintType: 'SNET', constraintDate: '2026-05-01' })).toEqual({
      short: 'SNET · 01 May 2026',
      full: 'Start no earlier than 01 May 2026',
    });
  });

  it('formats a parked value honestly (how the engine actually applies it)', () => {
    expect(
      formatConstraint({ constraintType: 'MANDATORY_START', constraintDate: '2026-05-01' }),
    ).toEqual({
      short: 'MANDATORY_START · 01 May 2026',
      full: 'Mandatory start — applied as Must start on 01 May 2026',
    });
  });

  it('returns null unless BOTH the type and date are present (mirrors the paired rule)', () => {
    expect(formatConstraint({ constraintType: null, constraintDate: null })).toBeNull();
    expect(formatConstraint({ constraintType: 'SNET', constraintDate: null })).toBeNull();
    expect(formatConstraint({ constraintType: null, constraintDate: '2026-05-01' })).toBeNull();
  });
});
