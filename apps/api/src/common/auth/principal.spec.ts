import { describe, expect, it } from 'vitest';

import { OrganizationRole, Principal } from './principal';

const ORGANIZATION = '11111111-1111-7111-8111-111111111111';
const OTHER = '22222222-2222-7222-8222-222222222222';
const USER = '33333333-3333-7333-8333-333333333333';

/**
 * Unit tests for the feature-agnostic RBAC model (ADR-0012). Permission codes
 * here are illustrative — real features define their own.
 */
describe('Principal', () => {
  const principal = new Principal(USER, [
    {
      organizationId: ORGANIZATION,
      role: OrganizationRole.MEMBER,
      permissions: ['item:read', 'item:create'],
    },
  ]);

  it('knows which organisations it belongs to', () => {
    expect(principal.isMemberOf(ORGANIZATION)).toBe(true);
    expect(principal.isMemberOf(OTHER)).toBe(false);
  });

  it('grants a permission only in an organisation where it is held (scope check)', () => {
    expect(principal.can('item:create', ORGANIZATION)).toBe(true);
    // Same permission, different organisation → denied (IDOR defence).
    expect(principal.can('item:create', OTHER)).toBe(false);
  });

  it('denies a permission the membership does not grant', () => {
    expect(principal.can('item:delete', ORGANIZATION)).toBe(false);
  });

  it('canAnywhere is a coarse capability gate across memberships', () => {
    expect(principal.canAnywhere('item:read')).toBe(true);
    expect(principal.canAnywhere('item:delete')).toBe(false);
  });

  it('denies everything when the principal has no memberships', () => {
    const outsider = new Principal(USER, []);
    expect(outsider.isMemberOf(ORGANIZATION)).toBe(false);
    expect(outsider.can('item:read', ORGANIZATION)).toBe(false);
    expect(outsider.canAnywhere('item:read')).toBe(false);
  });
});
