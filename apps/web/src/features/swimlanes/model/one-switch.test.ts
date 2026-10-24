import { describe, expect, it } from 'vitest';

import { SWIMLANES_LENS_OFFERED } from './use-swimlane-scene';

import { LENS_TOGGLES } from '@/features/tsld/toolbar/tsld-toolbar-items';

/**
 * **The lens has one switch with two ends** (swimlanes M2-T2). The toolbar's record says `enabled:
 * false` as a literal, because `features/tsld` cannot import this feature; the host's end is
 * {@link SWIMLANES_LENS_OFFERED}. A layer that sees both is the only place the two can be held
 * together, so M2-T11 cannot flip one and forget the other.
 */
describe('the Swimlanes lens switch', () => {
  it('the toolbar record and the host constant agree', () => {
    const lens = LENS_TOGGLES.find((t) => t.id === 'swimlanes');
    expect(lens, 'the swimlanes lens must be registered').toBeDefined();
    expect(lens!.enabled).toBe(SWIMLANES_LENS_OFFERED);
  });
});
