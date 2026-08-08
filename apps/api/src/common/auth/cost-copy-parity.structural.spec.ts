import { describe, expect, it } from 'vitest';

import { permissionsForRole } from './org-permissions';
import { OrganizationRole } from './principal';

/**
 * **Whoever may create an activity may also read cost.**
 *
 * This is a structural claim the activity-copy epic depends on
 * (`docs/specs/activity-copy-paste/`, M0-T3 step 4), and it is asserted here rather than in the web
 * because this is where the role bundles live — a duplicate over there would pin the duplicate
 * instead of the permission set.
 *
 * Why it matters, in the terms of the failure it prevents: a copy carries `budgetedExpense`, read
 * from the source activity's DTO. A caller **without** `cost:read` is served `budgetedExpense: null`
 * — which is **indistinguishable from "this activity has no budget"**. So the day those two
 * permissions diverge, a copy made by such a caller would silently strip the budget from the clone
 * and nothing in the product would say so: no error, no warning, a clone that looks right.
 *
 * The invariant is `activity:create ⊆ cost:read` **holders**, not the reverse. A role that may read
 * cost without creating activities is fine (nothing is lost); a role that may create without
 * reading is the trap.
 *
 * If this test ever goes red, the fix is **not** to change it. Either restore the containment, or
 * stop carrying `budgetedExpense` in `clone-projection.ts` and reclassify the field in the census
 * — a decision, made deliberately, with the reason recorded there.
 */
describe('cost-read parity for the activity copy', () => {
  const roles = Object.values(OrganizationRole);

  it('every role that may create an activity may also read cost', () => {
    const offenders = roles.filter((role) => {
      const held = new Set(permissionsForRole(role));
      return held.has('activity:create') && !held.has('cost:read');
    });
    expect(
      offenders,
      `these roles can create an activity but not read cost, so a copy they make would ` +
        `silently drop budgetedExpense: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('at least one role holds both — so the assertion above is not vacuously true', () => {
    // Without this, deleting `activity:create` from every bundle would make the test above pass
    // while removing the very capability it exists to constrain.
    const both = roles.filter((role) => {
      const held = new Set(permissionsForRole(role));
      return held.has('activity:create') && held.has('cost:read');
    });
    expect(both).toEqual([OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]);
  });
});
