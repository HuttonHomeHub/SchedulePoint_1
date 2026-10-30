import { describe, expect, it } from 'vitest';

import { SET_CODE_LABEL as BUTTON_LABEL } from '@/features/codes/components/CodeAssignButton';
import { SET_CODE_LABEL as BAR_LABEL } from '@/features/plan-actions/selection-actions';

// The two bars name one command; the features cannot import each other, so the workspace — which
// can import both — pins that the single bar's item and the plural bar's button read the same.
describe('Set code… label', () => {
  it('is the same on the single and the plural selection bar', () => {
    expect(BAR_LABEL).toBe(BUTTON_LABEL);
  });
});
