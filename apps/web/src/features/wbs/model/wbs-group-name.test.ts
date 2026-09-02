import { describe, expect, it } from 'vitest';

import { wbsGroupAccessibleName } from './wbs-group-name';

/**
 * The composer extracted from `GanttPanel.tsx` for `docs/TECH_DEBT.md` #232. The proof that the
 * extraction changed nothing is not here — it is that every existing Gantt suite passed unedited
 * through it (the ADR-0078 barrel-preserving argument). These cases pin the contract itself.
 */
describe('wbsGroupAccessibleName', () => {
  it('is singular at one', () => {
    expect(wbsGroupAccessibleName({ label: 'Piling', count: 1 })).toBe('Piling, 1 activity');
  });

  it('is plural above one', () => {
    expect(wbsGroupAccessibleName({ label: 'Unassigned', count: 12 })).toBe(
      'Unassigned, 12 activities',
    );
  });

  /**
   * Zero is plural, and it is covered even though the Gantt never renders it: `deriveWbsGroups`
   * returns `null` rather than an empty bucket (`wbs-groups.ts`). The TSLD band **can** call this
   * with zero, because a `WBS_SUMMARY` with nothing under it is a real thing a planner can create.
   */
  it('is plural at zero, which the band can reach and the Gantt cannot', () => {
    expect(wbsGroupAccessibleName({ label: 'Fit-out', count: 0 })).toBe('Fit-out, 0 activities');
  });
});
