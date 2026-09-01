import { describe, expect, it } from 'vitest';

import { permissionsForRole } from './org-permissions';
import { OrganizationRole } from './principal';

const READ = [
  'client:read',
  'project:read',
  'plan:read',
  'activity:read',
  'dependency:read',
  'calendar:read',
  'baseline:read',
] as const;
const WRITE = [
  'client:create',
  'client:update',
  'client:delete',
  'client:restore',
  'project:create',
  'plan:delete',
  'activity:create',
  'activity:update',
  'activity:delete',
  'activity:restore',
  'dependency:create',
  'dependency:update',
  'dependency:delete',
  'calendar:create',
  'calendar:update',
  'calendar:delete',
  'baseline:create',
  'baseline:activate',
  'baseline:delete',
] as const;

describe('permissionsForRole — hierarchy', () => {
  it('grants hierarchy read to every member role', () => {
    for (const role of Object.values(OrganizationRole)) {
      const perms = permissionsForRole(role);
      for (const p of READ) expect(perms).toContain(p);
    }
  });

  it.each([OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR])(
    'does NOT grant hierarchy write to %s',
    (role) => {
      const perms = permissionsForRole(role);
      for (const p of WRITE) expect(perms).not.toContain(p);
    },
  );

  it.each([OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN])(
    'grants hierarchy write to %s',
    (role) => {
      const perms = permissionsForRole(role);
      for (const p of WRITE) expect(perms).toContain(p);
    },
  );

  it('keeps Org Admin member/invitation administration alongside hierarchy write', () => {
    const perms = permissionsForRole(OrganizationRole.ORG_ADMIN);
    expect(perms).toContain('member:remove');
    expect(perms).toContain('invitation:revoke');
    expect(perms).toContain('plan:restore');
  });

  it('does not grant Planner member administration', () => {
    const perms = permissionsForRole(OrganizationRole.PLANNER);
    expect(perms).not.toContain('member:remove');
    expect(perms).not.toContain('invitation:revoke');
  });
});

describe('permissionsForRole — activity progress vs logic (the Contributor split)', () => {
  it('grants activity:update_progress to Contributor upward, but NOT to Viewer', () => {
    expect(permissionsForRole(OrganizationRole.VIEWER)).not.toContain('activity:update_progress');
    for (const role of [
      OrganizationRole.CONTRIBUTOR,
      OrganizationRole.PLANNER,
      OrganizationRole.ORG_ADMIN,
    ]) {
      expect(permissionsForRole(role)).toContain('activity:update_progress');
    }
  });

  it('lets a Contributor update progress but NOT change logic/definition', () => {
    const perms = permissionsForRole(OrganizationRole.CONTRIBUTOR);
    expect(perms).toContain('activity:read');
    expect(perms).toContain('activity:update_progress');
    // The whole point of the split: no definition write for a Contributor.
    expect(perms).not.toContain('activity:update');
    expect(perms).not.toContain('activity:create');
    expect(perms).not.toContain('activity:delete');
  });

  it('lets a Contributor read dependencies but NOT edit the network', () => {
    const perms = permissionsForRole(OrganizationRole.CONTRIBUTOR);
    expect(perms).toContain('dependency:read');
    // Editing logic ties is Planner+ only, like the rest of hierarchy write.
    expect(perms).not.toContain('dependency:create');
    expect(perms).not.toContain('dependency:update');
    expect(perms).not.toContain('dependency:delete');
  });
});

describe('permissionsForRole — CPM schedule (read vs calculate)', () => {
  it('grants schedule:read to every member role', () => {
    for (const role of Object.values(OrganizationRole)) {
      expect(permissionsForRole(role)).toContain('schedule:read');
    }
  });

  it('grants schedule:calculate to Planner + Org Admin only', () => {
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      expect(permissionsForRole(role)).not.toContain('schedule:calculate');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      expect(permissionsForRole(role)).toContain('schedule:calculate');
    }
  });

  it('gives Planner/Org Admin both progress and full definition write', () => {
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      const perms = permissionsForRole(role);
      expect(perms).toContain('activity:update_progress');
      expect(perms).toContain('activity:update');
    }
  });

  it('grants cost:read (Earned Value / cost) to Planner + Org Admin only', () => {
    // Commercially sensitive money is NOT part of the every-member schedule reads (ADR-0042, EV2b).
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      expect(permissionsForRole(role)).not.toContain('cost:read');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      expect(permissionsForRole(role)).toContain('cost:read');
    }
  });

  it('grants interchange:import (schedule file import) to Planner + Org Admin only', () => {
    // Import creates a plan + activities + logic + calendars — a hierarchy-write capability (ADR-0050).
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      expect(permissionsForRole(role)).not.toContain('interchange:import');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      expect(permissionsForRole(role)).toContain('interchange:import');
    }
  });

  it('grants interchange:export (schedule file export) to EVERY member (Viewer upward, ADR-0050 M4a)', () => {
    // Export is a read-egress of on-screen-readable schedule data (CQ-1), NOT a write — unlike import it is
    // granted to all four roles; External Guest holds no membership so it never resolves any org permission.
    for (const role of Object.values(OrganizationRole)) {
      expect(permissionsForRole(role)).toContain('interchange:export');
    }
  });

  it('grants audit:read to Org Admin ONLY — not Planner (ADR-0072)', () => {
    // Narrower than every other read in this file, deliberately. The audit log carries other
    // members' actions and their IP addresses, so a Planner holding it would let a colleague
    // read a peer's activity — the reason it is its own bundle rather than part of ADMIN or
    // HIERARCHY_READ. A member's OWN history is reachable without this permission at all.
    for (const role of [
      OrganizationRole.VIEWER,
      OrganizationRole.CONTRIBUTOR,
      OrganizationRole.PLANNER,
    ]) {
      expect(permissionsForRole(role)).not.toContain('audit:read');
    }
    expect(permissionsForRole(OrganizationRole.ORG_ADMIN)).toContain('audit:read');
  });

  it('grants plan:share (manage External-Guest share links) to Planner + Org Admin only (ADR-0051)', () => {
    // Sharing a plan OUTSIDE the org is a governance act, deliberately above a reporter/reader.
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      expect(permissionsForRole(role)).not.toContain('plan:share');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      expect(permissionsForRole(role)).toContain('plan:share');
    }
  });
});

describe('permissionsForRole — calendar library (read vs write)', () => {
  it('grants calendar:read to every member role', () => {
    for (const role of Object.values(OrganizationRole)) {
      expect(permissionsForRole(role)).toContain('calendar:read');
    }
  });

  it('grants calendar create/update/delete to Planner + Org Admin only', () => {
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      const perms = permissionsForRole(role);
      expect(perms).not.toContain('calendar:create');
      expect(perms).not.toContain('calendar:update');
      expect(perms).not.toContain('calendar:delete');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      const perms = permissionsForRole(role);
      expect(perms).toContain('calendar:create');
      expect(perms).toContain('calendar:update');
      expect(perms).toContain('calendar:delete');
    }
  });

  // ADR-0053 §2: writing to the SHARED org library (create/update/delete an ORG-scoped
  // calendar, promote, narrow) needs `calendar:manage_org` on top of the plain calendar
  // write. Granted to exactly the roles that already held `calendar:*` — zero capability
  // change today — but as its own revocable code (the `dependency:link_cross_plan` precedent).
  it('grants calendar:manage_org to Planner + Org Admin only', () => {
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      expect(permissionsForRole(role)).not.toContain('calendar:manage_org');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      expect(permissionsForRole(role)).toContain('calendar:manage_org');
    }
  });
});

describe('permissionsForRole — resource library + assignments (read vs write)', () => {
  it('grants resource:read to every member role', () => {
    for (const role of Object.values(OrganizationRole)) {
      expect(permissionsForRole(role)).toContain('resource:read');
    }
  });

  it('grants resource create/update/delete/assign to Planner + Org Admin only (NOT Contributor)', () => {
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      const perms = permissionsForRole(role);
      expect(perms).not.toContain('resource:create');
      expect(perms).not.toContain('resource:update');
      expect(perms).not.toContain('resource:delete');
      expect(perms).not.toContain('resource:assign');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      const perms = permissionsForRole(role);
      expect(perms).toContain('resource:create');
      expect(perms).toContain('resource:update');
      expect(perms).toContain('resource:delete');
      expect(perms).toContain('resource:assign');
    }
  });
});

describe('permissionsForRole — plan edit-lock (coordinate vs override)', () => {
  it('grants acquire + request-control to Planner + Org Admin only', () => {
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      const perms = permissionsForRole(role);
      expect(perms).not.toContain('plan:acquire_lock');
      expect(perms).not.toContain('plan:request_control');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      const perms = permissionsForRole(role);
      expect(perms).toContain('plan:acquire_lock');
      expect(perms).toContain('plan:request_control');
    }
  });

  it('grants immediate override to Org Admin only — a Planner must request + wait', () => {
    for (const role of [
      OrganizationRole.VIEWER,
      OrganizationRole.CONTRIBUTOR,
      OrganizationRole.PLANNER,
    ]) {
      expect(permissionsForRole(role)).not.toContain('plan:override_lock');
    }
    expect(permissionsForRole(OrganizationRole.ORG_ADMIN)).toContain('plan:override_lock');
  });
});

describe('permissionsForRole — baselines (read/variance vs write)', () => {
  it('grants baseline:read to every member role', () => {
    for (const role of Object.values(OrganizationRole)) {
      expect(permissionsForRole(role)).toContain('baseline:read');
    }
  });

  it('grants baseline create/activate/delete to Planner + Org Admin only', () => {
    for (const role of [OrganizationRole.VIEWER, OrganizationRole.CONTRIBUTOR]) {
      const perms = permissionsForRole(role);
      expect(perms).not.toContain('baseline:create');
      expect(perms).not.toContain('baseline:activate');
      expect(perms).not.toContain('baseline:delete');
    }
    for (const role of [OrganizationRole.PLANNER, OrganizationRole.ORG_ADMIN]) {
      const perms = permissionsForRole(role);
      expect(perms).toContain('baseline:create');
      expect(perms).toContain('baseline:activate');
      expect(perms).toContain('baseline:delete');
    }
  });
});

/**
 * **The `cost:read` / `activity:update` coupling the web client silently depends on**
 * (`docs/TECH_DEBT.md` #62).
 *
 * The activity DTO returns `null` for a cost field that is **unset** and `null` for one the caller
 * **may not read** — indistinguishable on the wire. So `deriveActivityEditorGating` in `apps/web`
 * decides whether to show the Cost tab, and whether `ActivityResourcesPanel` shows an assignment's
 * money, from the caller's **role** rather than from the payload. That derivation is correct only
 * because these two permissions happen to be granted to exactly the same roles.
 *
 * #62 wrote the rule down — _"treat the permission sets as coupled: changing one without the other
 * is a client bug in a different file"_ — and left nothing enforcing it. That is precisely the
 * arrangement ADR-0058 exists to replace: a rule held by whoever remembers to read the register
 * before editing a permission bundle.
 *
 * **What fails, and why no other test would catch it.** Split `COST_READ` off from a role that
 * keeps `HIERARCHY_WRITE` (or the reverse) and the client shows or hides the Cost tab for the
 * wrong people — money to somebody who may not see it, or a tab withheld from somebody entitled
 * to it — with **every existing assertion still green**, because they all assert the current
 * coincidence one permission at a time. The API stays correct throughout: its own guards read the
 * real permission. Only the client is wrong, in another workspace, and only for readers of one
 * role.
 *
 * **This is a gate, not a fix.** The architectural answer is for the API to say so rather than
 * making the client guess — a `meta.permissions` block on the activity read, or a distinguishable
 * "redacted" marker instead of `null`. Until that lands, this turns a silent client defect into a
 * failing build in the diff that causes it, which is the whole difference worth having.
 *
 * If you are here because this went red: the divergence may well be right. Land it together with
 * the client change (`deriveActivityEditorGating`'s `canReadCost` input must stop being derived
 * from the role), then delete this test and #62 with it.
 *
 * **No pinned positive is added beside it**, and that is checked rather than assumed: an equality
 * assertion passes vacuously if no role holds either permission, so it needs one — and
 * `'grants cost:read (Earned Value / cost) to Planner + Org Admin only'` above already IS one, on
 * both halves. Writing a second would have been a duplicate whose docblock claimed to close a hole
 * that was shut, which is the shape this register keeps catching one file over.
 *
 * **What it detects that the suite around it does not, established by running it rather than by
 * reasoning.** Both permissions are already pinned above to the same literal role set, so the
 * obvious objection is that this adds nothing — and against a bare divergence that is true: strip
 * `COST_READ` from Planner and three assertions go red together. The case that separates them is
 * the one that would actually happen. Narrow `cost:read` to Org Admin **and update the literal
 * expectation to match**, which is the natural thing to do when a test fails on a change you meant
 * to make, and the entire pre-existing suite goes green while the client is wrong. Tried: **one
 * test failed, this one.** It survives because it asserts a *relationship* rather than a role set,
 * so bringing a literal into line with an intended change cannot silence it — the assertion has to
 * be deleted deliberately, which is the moment a reader meets this docblock and #62.
 */
describe('permissionsForRole — cost:read is coupled to activity:update (#62)', () => {
  it('grants both to the same roles, or neither', () => {
    for (const role of Object.values(OrganizationRole)) {
      const perms = permissionsForRole(role);
      const canReadCost = perms.includes('cost:read');
      const canUpdateActivity = perms.includes('activity:update');
      expect(
        canReadCost,
        `${role} holds activity:update=${canUpdateActivity} and cost:read=${canReadCost}. ` +
          `The web client derives the Cost tab from the role because the DTO cannot say ` +
          `(docs/TECH_DEBT.md #62); splitting these makes it wrong with nothing else failing.`,
      ).toBe(canUpdateActivity);
    }
  });
});
