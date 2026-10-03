import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ActivityHistoryEntry,
  ActivityHistoryPageMeta,
  ActivityHistoryScope,
} from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

import { redactChanges } from './activity-history.redaction';
import type { StoredChanges } from './activity-history.types';

/**
 * The migration that created the table. Its `finished_at` on this database is when recording began
 * here, which is the honest answer to "since when?" — a date written into this file would be the
 * date the code was merged, not the date any host started recording (`_prisma_migrations` is read
 * the same way by `finish-milestone-rederive.service.ts`).
 */
const HISTORY_MIGRATION = '20261003120000_activity_history_entries';

const UNKNOWN_ACTOR = 'Unknown user';

interface EntryRow {
  id: string;
  actorUserId: string;
  scope: ActivityHistoryScope;
  firstRecordedAt: Date;
  lastRecordedAt: Date;
  editCount: number;
  batchId: string | null;
  batchSize: number | null;
  origin: ActivityHistoryEntry['origin'];
  changes: StoredChanges;
}

/**
 * The read side of the per-activity change history (ADR-0174). A thin service: scope, permission,
 * keyset page, name resolution, redaction.
 */
@Injectable()
export class ActivityHistoryService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ActivityHistoryService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: ActivityHistoryEntry[]; meta: ActivityHistoryPageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:read', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    // Org-scoped and active first: a foreign or deleted activity is a 404 before any history is read
    // (R6), so the route can never be used to probe another tenant's ids.
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId: organization.id, deletedAt: null },
      select: { createdAt: true },
    });
    if (!activity) throw new NotFoundError('Activity not found.');

    const after = query.cursor ? decodeCursor(query.cursor) : null;
    // A reader without cost:read never gets a page cut short by entries that are empty to them: the
    // predicate removes cost-only entries inside the scan instead of after it.
    const rows = await this.prisma.$queryRaw<EntryRow[]>`
      SELECT id, actor_user_id AS "actorUserId", scope::text AS scope,
             first_recorded_at AS "firstRecordedAt", last_recorded_at AS "lastRecordedAt",
             edit_count AS "editCount", batch_id AS "batchId", batch_size AS "batchSize",
             origin::text AS origin, changes
      FROM activity_history_entries
      WHERE activity_id = ${activityId}::uuid
        AND organization_id = ${organization.id}::uuid
        ${canReadCost ? Prisma.empty : Prisma.sql`AND has_non_cost_change`}
        ${after ? Prisma.sql`AND (first_recorded_at, id) < (${after.t}, ${after.id}::uuid)` : Prisma.empty}
      ORDER BY first_recorded_at DESC, id DESC
      LIMIT ${query.limit + 1}`;

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const names = await this.actorNames(page.map((r) => r.actorUserId));

    const items: ActivityHistoryEntry[] = [];
    for (const row of page) {
      const changes = redactChanges(row.changes, canReadCost);
      if (changes === null) continue;
      items.push({
        id: row.id,
        actor: { id: row.actorUserId, name: names.get(row.actorUserId) ?? UNKNOWN_ACTOR },
        scope: row.scope,
        firstRecordedAt: row.firstRecordedAt.toISOString(),
        lastRecordedAt: row.lastRecordedAt.toISOString(),
        editCount: row.editCount,
        batch:
          row.batchId !== null && row.batchSize !== null
            ? { id: row.batchId, size: row.batchSize }
            : null,
        origin: row.origin,
        changes,
      });
    }

    const last = page[page.length - 1];
    const recordingSince = await this.recordingSince(activity.createdAt);
    this.logger.debug({ activityId, returned: items.length, hasMore }, 'activity history read');
    return {
      items,
      meta: {
        nextCursor: hasMore && last ? encodeCursor(last.firstRecordedAt, last.id) : null,
        hasMore,
        recordingSince: recordingSince.toISOString(),
      },
    };
  }

  /** The later of the activity's creation and the day this database started recording. */
  private async recordingSince(createdAt: Date): Promise<Date> {
    const rows = await this.prisma.$queryRaw<{ startedAt: Date | null }[]>`
      SELECT m."finished_at" AS "startedAt" FROM "_prisma_migrations" m
       WHERE m."migration_name" = ${HISTORY_MIGRATION}
         AND m."finished_at" IS NOT NULL AND m."rolled_back_at" IS NULL`;
    const startedAt = rows[0]?.startedAt ?? null;
    return startedAt !== null && startedAt > createdAt ? startedAt : createdAt;
  }

  /** One batched lookup for the page's actors; an erased user resolves to the tombstone name. */
  private async actorNames(ids: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}

interface Cursor {
  t: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The keyset cursor: the last entry's sort key. It carries the key itself rather than an entry id to
 * look up, so a page boundary survives that entry later merging away or being cancelled by a net-zero
 * undo — an id cursor would 404 the next page. `first_recorded_at` never changes once written, which is
 * what keeps pages stable while a merge extends the newest entry.
 */
function encodeCursor(t: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: t.toISOString(), id })).toString('base64url');
}

function decodeCursor(raw: string): Cursor {
  const invalid = (): never => {
    throw new ValidationError('The cursor is not valid.', { reason: 'INVALID_CURSOR' });
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return invalid();
  }
  if (typeof parsed !== 'object' || parsed === null) return invalid();
  const { t, id } = parsed as { t?: unknown; id?: unknown };
  if (typeof t !== 'string' || typeof id !== 'string' || !UUID.test(id)) return invalid();
  const date = new Date(t);
  if (Number.isNaN(date.getTime())) return invalid();
  return { t: date, id };
}
