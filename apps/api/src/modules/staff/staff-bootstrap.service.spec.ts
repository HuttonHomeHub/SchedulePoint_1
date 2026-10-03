import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';

import { StaffBootstrapService } from './staff-bootstrap.service';

/**
 * Removing a member soft-deletes `org_members`, so a removed membership must not make a staff
 * account "dual-hatted" (`docs/TECH_DEBT.md` #436). The real removal path is driven in
 * `test/staff.e2e-spec.ts`; this pins the boot-log count's own read.
 */
function build(memberships: Array<{ userId: string; deletedAt: Date | null }>) {
  const findMany = vi.fn(({ where }: { where: { userId: { in: string[] }; deletedAt?: null } }) =>
    Promise.resolve(
      memberships.filter(
        (row) =>
          where.userId.in.includes(row.userId) &&
          (where.deletedAt === null ? !row.deletedAt : true),
      ),
    ),
  );
  const prisma = {
    user: {
      findMany: vi.fn(() => Promise.resolve([{ id: 'u1', emailVerified: true }])),
    },
    orgMember: { findMany },
  } as unknown as PrismaService;
  const logger = { warn: vi.fn() } as unknown as PinoLogger;
  const config = { staffEmails: ['ops@example.test'] } as unknown as AppConfigService;
  return { service: new StaffBootstrapService(config, prisma, logger), logger };
}

describe('StaffBootstrapService dual-hat count', () => {
  it('counts a live membership', async () => {
    const { service, logger } = build([{ userId: 'u1', deletedAt: null }]);
    await service.onApplicationBootstrap();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ dualHatted: 1 }),
      expect.any(String),
    );
  });

  it('does not count a removed membership', async () => {
    const { service, logger } = build([{ userId: 'u1', deletedAt: new Date() }]);
    await service.onApplicationBootstrap();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ dualHatted: 0 }),
      expect.any(String),
    );
  });
});
