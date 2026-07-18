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
