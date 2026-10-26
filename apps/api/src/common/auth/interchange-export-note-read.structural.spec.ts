import { OrganizationRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { permissionsForRole } from './org-permissions';

/**
 * Whoever may export a plan may already read its notes (notes-through-interchange M2, Q4).
 *
 * An export now writes every active activity note into the file, so `interchange:export` must never be
 * granted to a role that cannot hold `note:read`: that would let the export route read what the notes
 * routes refuse. Today every member holds both, which is why a write-only bundle for either could be
 * added without anything else failing, and this is the check that would notice.
 */
describe('interchange:export is a subset of note:read', () => {
  it.each(Object.values(OrganizationRole))('%s: export implies note:read', (role) => {
    const permissions = permissionsForRole(role);
    if (permissions.includes('interchange:export')) {
      expect(permissions).toContain('note:read');
    }
  });

  it('is not vacuous: at least one role holds the export permission', () => {
    const exporters = Object.values(OrganizationRole).filter((role) =>
      permissionsForRole(role).includes('interchange:export'),
    );
    expect(exporters.length).toBeGreaterThan(0);
  });
});
