import { describe, expect, it } from 'vitest';

import { RetentionStatusStore } from '../../common/operational/retention-status.store';
import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VersionService } from '../../version/version.service';

import { StaffHealthService } from './staff-health.service';

/**
 * The staff banner's dual-hat fact (ADR-0086 D4) must ignore a removed membership, because removal
 * soft-deletes `org_members` (`docs/TECH_DEBT.md` #436). The real removal path is driven in
 * `test/staff.e2e-spec.ts`; this pins the read's own filter.
 */
function build(rows: Array<{ userId: string; deletedAt: Date | null }>) {
  const prisma = {
    orgMember: {
      count: ({ where }: { where: { userId: string; deletedAt?: null } }) =>
        Promise.resolve(
          rows.filter(
            (row) =>
              row.userId === where.userId && (where.deletedAt === null ? !row.deletedAt : true),
          ).length,
        ),
    },
  } as unknown as PrismaService;
  return new StaffHealthService(
    prisma,
    {} as unknown as AppConfigService,
    {} as unknown as VersionService,
    new RetentionStatusStore(),
  );
}

describe('StaffHealthService.isDualHatted', () => {
  it('is true for a live membership', async () => {
    expect(await build([{ userId: 'u1', deletedAt: null }]).isDualHatted('u1')).toBe(true);
  });

  it('is false once the membership has been removed', async () => {
    expect(await build([{ userId: 'u1', deletedAt: new Date() }]).isDualHatted('u1')).toBe(false);
  });
});
