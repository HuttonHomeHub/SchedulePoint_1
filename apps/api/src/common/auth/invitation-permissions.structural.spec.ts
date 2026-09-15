import { OrganizationRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { permissionsForRole } from './org-permissions';

/**
 * `invitation:read` and `invitation:revoke` are held by exactly the same roles.
 *
 * **A client design depends on this, which is why it is a gate and not an observation.**
 * `apps/web`'s `canAdministerInvitations` is ONE predicate for both, and the Members screen
 * therefore omits the invitations section entirely for a reader without them and offers `Revoke`
 * unconditionally inside it. The implementation plan asked instead for `Revoke` to be shaded with
 * a reason for a reader who can read but not revoke — and no such reader exists, so that state
 * would have been a branch nobody could reach, validated by its own tests (ADR-0081's shape).
 *
 * If the two are ever split — a "Member manager" role that can see who is outstanding but not
 * withdraw an invitation is a perfectly reasonable thing to add — this fails, and the client's
 * single predicate has to become two before the server ships the split. Without it the failure is
 * silent and the wrong way round: the screen would offer a control the API refuses with 403.
 */
describe('the invitation permissions travel together', () => {
  const ROLES = Object.values(OrganizationRole);

  it('grants read and revoke to exactly the same roles', () => {
    const readers = ROLES.filter((role) => permissionsForRole(role).includes('invitation:read'));
    const revokers = ROLES.filter((role) => permissionsForRole(role).includes('invitation:revoke'));

    expect(revokers).toEqual(readers);
  });

  it('grants them to Org Admin and to nobody else', () => {
    // The positive half. Without it the assertion above passes perfectly against a build where
    // NEITHER permission is granted to anybody — a green suite that cannot tell "they agree"
    // from "they have both gone" (ADR-0093's pinned-positive-case rule).
    const readers = ROLES.filter((role) => permissionsForRole(role).includes('invitation:read'));

    expect(readers).toEqual([OrganizationRole.ORG_ADMIN]);
  });
});
