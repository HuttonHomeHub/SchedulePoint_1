import { OrganizationRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { permissionsForRole } from './org-permissions';

/**
 * `organization:export` is held by Org Admin and nobody else (ADR-0194, ADR-0085 D4).
 *
 * The file carries every member's name and email, cost, and the audit log, so the grant is
 * narrower than `interchange:export`. Pinned as a positive case as well as a negative one: a
 * build where nobody holds it would otherwise pass an "only admins" assertion vacuously.
 */
describe('the organisation export permission', () => {
  const ROLES = Object.values(OrganizationRole);

  it('is held by exactly [ORG_ADMIN]', () => {
    const readers = ROLES.filter((role) =>
      permissionsForRole(role).includes('organization:export'),
    );

    expect(readers).toEqual([OrganizationRole.ORG_ADMIN]);
  });
});
