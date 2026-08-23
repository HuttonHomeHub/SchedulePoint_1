import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Says, once at boot, what the staff allowlist actually resolves to (ADR-0086 D4/D7).
 *
 * **This exists because the ADR promised it and the milestone shipped without it** — the security
 * gate found the gap. Dual-hatting is permitted rather than refused (refusing would lock the only
 * staff member out on day one), and the entire compensation for permitting it was that the overlap
 * would be *visible*. A promise of observability that was never built is worse than an honest
 * silence, because it gets cited as a mitigation.
 *
 * It reports three things an operator cannot otherwise see without a shell: how many allowlisted
 * addresses have **no account at all** (inert — the guard demands a verified account — but also the
 * entries most likely to be a typo), how many exist but are **unverified** (also inert, and the
 * state that looks like a broken deployment), and how many are **dual-hatted**.
 *
 * **Warn, never refuse, and never fail the boot** — the `MailBootstrapService` precedent for its
 * reason: the host recreates containers unattended (ADR-0047), so a check that could fail the boot
 * would turn a configuration opinion into an outage nobody is awake for. It is likewise not part of
 * `/api/v1/health/ready`: a staff allowlist has no bearing on whether the API can serve schedules.
 */
@Injectable()
export class StaffBootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(StaffBootstrapService.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const allowlist = this.config.staffEmails;
    if (allowlist.length === 0) return;

    try {
      const accounts = await this.prisma.user.findMany({
        where: { email: { in: [...allowlist], mode: 'insensitive' } },
        select: { id: true, emailVerified: true },
      });
      const verifiedIds = accounts.filter((account) => account.emailVerified).map((a) => a.id);
      const memberships =
        verifiedIds.length === 0
          ? []
          : await this.prisma.orgMember.findMany({
              where: { userId: { in: verifiedIds } },
              select: { userId: true },
            });
      const dualHatted = new Set(memberships.map((row) => row.userId)).size;

      this.logger.warn(
        {
          event: 'staff.allowlist_resolved',
          // Counts only, never the addresses. This goes to a log stream that is retained and
          // shipped, and the allowlist is a list of the most valuable accounts in the installation.
          configured: allowlist.length,
          withoutAccount: allowlist.length - accounts.length,
          unverified: accounts.length - verifiedIds.length,
          dualHatted,
        },
        dualHatted > 0
          ? 'staff allowlist resolved; some staff accounts also hold organisation memberships — a dedicated staff account is recommended (docs/DEPLOYMENT.md)'
          : 'staff allowlist resolved',
      );
    } catch (error) {
      // A reporting failure must never be a boot failure: the guard does not depend on this.
      this.logger.warn(
        { event: 'staff.allowlist_check_failed', err: error },
        'could not resolve the staff allowlist at boot; the guard is unaffected',
      );
    }
  }
}
