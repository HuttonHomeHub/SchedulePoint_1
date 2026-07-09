import { describe, expect, it } from 'vitest';

import { permissionsForRole } from './org-permissions';
import { OrganizationRole } from './principal';

const READ = ['client:read', 'project:read', 'plan:read'] as const;
const WRITE = [
  'client:create',
  'client:update',
  'client:delete',
  'client:restore',
  'project:create',
  'plan:delete',
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
