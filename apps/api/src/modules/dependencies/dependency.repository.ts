import { Injectable } from '@nestjs/common';
import { Prisma, type DependencyType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** Endpoint fields embedded in a dependency response (no N+1 — loaded via include). */
const endpointSelect = { id: true, code: true, name: true } as const;

const withEndpoints = {
  include: {
    predecessor: { select: endpointSelect },
    successor: { select: endpointSelect },
  },
} satisfies Prisma.ActivityDependencyDefaultArgs;

/** A dependency row with its two endpoint activities embedded as light summaries. */
export type DependencyWithEndpoints = Prisma.ActivityDependencyGetPayload<typeof withEndpoints>;

/** Fields a dependency update may change (endpoints are immutable). */
export interface DependencyPatch {
  type?: DependencyType;
  lagDays?: number;
}

/** A directed edge in a plan — the minimal shape the cycle walk (B2) needs. */
export interface PlanEdge {
  predecessorId: string;
  successorId: string;
}

/**
 * Data-access for dependencies (ADR-0008) — the edges of the schedule network.
 * Centralises the soft-delete filter and always embeds the endpoint summaries so
 * a list never N+1s to fetch the other end's name. Item lookups are scoped by
 * organisation (anti-IDOR); lists are scoped by organisation and either the plan
 * or one endpoint activity (direction lists). Delete/restore go through the
 * shared HierarchyLifecycleService, so this repository covers create/read/update.
 */
@Injectable()
export class DependencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(
    where: Prisma.ActivityDependencyWhereInput = {},
  ): Prisma.ActivityDependencyWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.ActivityDependencyUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<DependencyWithEndpoints> {
    return db.activityDependency.create({ data, ...withEndpoints });
  }

  /** An active dependency scoped to its organisation (anti-IDOR), with endpoints. */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<DependencyWithEndpoints | null> {
    return db.activityDependency.findFirst({
      where: this.active({ id, organizationId }),
      ...withEndpoints,
    });
  }

  /** A dependency in an organisation in ANY state — used to scope a soft-delete. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; deletedAt: Date | null } | null> {
    return db.activityDependency.findFirst({
      where: { id, organizationId },
      select: { id: true, deletedAt: true },
    });
  }

  /** A page of a plan's active dependencies (keyset cursor by id). */
  findManyActiveByPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<DependencyWithEndpoints[]> {
    return this.page(
      this.active({ organizationId: params.organizationId, planId: params.planId }),
      params,
    );
  }

  /** An activity's predecessors — the links where it is the SUCCESSOR (edges into it). */
  findPredecessorsOf(params: {
    organizationId: string;
    activityId: string;
    take: number;
    cursor?: string;
  }): Promise<DependencyWithEndpoints[]> {
    return this.page(
      this.active({ organizationId: params.organizationId, successorId: params.activityId }),
      params,
    );
  }

  /** An activity's successors — the links where it is the PREDECESSOR (edges out of it). */
  findSuccessorsOf(params: {
    organizationId: string;
    activityId: string;
    take: number;
    cursor?: string;
  }): Promise<DependencyWithEndpoints[]> {
    return this.page(
      this.active({ organizationId: params.organizationId, predecessorId: params.activityId }),
      params,
    );
  }

  /** Every active edge in a plan (direction only) — the adjacency load for the cycle walk.
   * Scoped by organisation as well as plan (defence-in-depth, matching the other reads). */
  findActiveEdgesByPlan(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PlanEdge[]> {
    return db.activityDependency.findMany({
      where: this.active({ organizationId, planId }),
      select: { predecessorId: true, successorId: true },
    });
  }

  /**
   * Take a transaction-scoped advisory lock keyed by the plan, so concurrent
   * dependency creates in the SAME plan are serialised — the cycle walk of one
   * insert always sees the other's edge, closing the mirror-insert race
   * (ADR-0021). Different plans (and orgs) use different keys and never contend.
   * The lock releases automatically when the transaction ends.
   */
  async lockPlanForWrite(planId: string, db: Prisma.TransactionClient): Promise<void> {
    // Two-int form: a fixed namespace + the plan-id hash. `hashtext` → int4.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dependency-plan'), hashtext(${planId}))`;
  }

  /**
   * Optimistic-locked update of the mutable fields (type/lag). Returns rows
   * changed — `0` means a version conflict or the row is gone (→ 409).
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: DependencyPatch,
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.activityDependency.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }

  /** Shared keyset page (createdAt, id) with the endpoint includes. */
  private page(
    where: Prisma.ActivityDependencyWhereInput,
    params: { take: number; cursor?: string },
  ): Promise<DependencyWithEndpoints[]> {
    return this.prisma.activityDependency.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      ...withEndpoints,
    });
  }
}
