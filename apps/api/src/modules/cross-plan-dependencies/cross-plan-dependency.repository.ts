import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type DependencyType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** Endpoint fields embedded in a cross-plan dependency response (no N+1 — loaded via include). */
const endpointSelect = { id: true, code: true, name: true } as const;

const withEndpoints = {
  include: {
    predecessor: { select: endpointSelect },
    successor: { select: endpointSelect },
  },
} satisfies Prisma.CrossPlanDependencyDefaultArgs;

/** A cross-plan dependency row with its two endpoint activities embedded as light summaries. */
export type CrossPlanDependencyWithEndpoints = Prisma.CrossPlanDependencyGetPayload<
  typeof withEndpoints
>;

/**
 * A directed edge in the PLAN-level programme graph — the minimal shape the cross-plan cycle
 * walk (ADR-0045 §3) needs. Its nodes are plans, not activities.
 */
export interface PlanCrossEdge {
  predecessorPlanId: string;
  successorPlanId: string;
}

/**
 * Data-access for cross-plan dependencies (ADR-0008, ADR-0045) — the LIVE inter-project edges of
 * the programme graph. Deliberately SEPARATE from {@link ../dependencies/dependency.repository}
 * (which asserts a single `plan_id` for both endpoints); this table carries BOTH plan ids,
 * denormalised. Centralises the soft-delete filter and always embeds the endpoint summaries so a
 * list never N+1s. Item lookups are scoped by organisation (anti-IDOR); lists are scoped by
 * organisation and either the successor plan (its incoming links) or one endpoint activity (both
 * directions). Soft-delete is LOCAL here (a directly-deleted edge, its own fresh batch) because a
 * cross-plan edge is not a node of the Client→Project→Plan→Activity tree the shared
 * HierarchyLifecycleService walks.
 */
@Injectable()
export class CrossPlanDependencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(
    where: Prisma.CrossPlanDependencyWhereInput = {},
  ): Prisma.CrossPlanDependencyWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.CrossPlanDependencyUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CrossPlanDependencyWithEndpoints> {
    return db.crossPlanDependency.create({ data, ...withEndpoints });
  }

  /** An active cross-plan dependency scoped to its organisation (anti-IDOR), with endpoints. */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<CrossPlanDependencyWithEndpoints | null> {
    return db.crossPlanDependency.findFirst({
      where: this.active({ id, organizationId }),
      ...withEndpoints,
    });
  }

  /**
   * A page of a plan's active INCOMING cross-plan dependencies — the links whose SUCCESSOR is in
   * this plan (the edge's home, ADR-0045 CQ-2). Keyset cursor by id; served by the
   * (successor_plan_id, created_at, id) index.
   */
  listBySuccessorPlan(params: {
    organizationId: string;
    planId: string;
    take: number;
    cursor?: string;
  }): Promise<CrossPlanDependencyWithEndpoints[]> {
    return this.page(
      this.active({
        organizationId: params.organizationId,
        successorPlanId: params.planId,
      }),
      params,
    );
  }

  /**
   * A page of the cross-plan dependencies incident to an activity in BOTH directions — where it is
   * the predecessor (edges out of its plan) OR the successor (edges into its plan).
   */
  listByActivity(params: {
    organizationId: string;
    activityId: string;
    take: number;
    cursor?: string;
  }): Promise<CrossPlanDependencyWithEndpoints[]> {
    return this.page(
      this.active({
        organizationId: params.organizationId,
        OR: [{ predecessorId: params.activityId }, { successorId: params.activityId }],
      }),
      params,
    );
  }

  /**
   * Every active cross-plan edge in an organisation as plan-grain `{predecessorPlanId,
   * successorPlanId}` pairs — the adjacency load the plan-level cycle walk reads (ADR-0045 §3).
   * Bounded by the org's cross-plan edge count (plans, not activities). Org-scoped (defence in
   * depth) and taken inside the create transaction under the org advisory lock.
   */
  loadOrgAdjacency(
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PlanCrossEdge[]> {
    return db.crossPlanDependency.findMany({
      where: this.active({ organizationId }),
      select: { predecessorPlanId: true, successorPlanId: true },
    });
  }

  /**
   * An active cross-plan link with this exact (predecessor, successor, type) triple, if any — the
   * N33 duplicate pre-check (ADR-0045). The partial unique index is the race-safe backstop; this
   * returns the friendly 409 before hitting it. Runs inside the create transaction.
   */
  findDuplicate(
    predecessorId: string,
    successorId: string,
    type: DependencyType,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string } | null> {
    return db.crossPlanDependency.findFirst({
      where: this.active({ predecessorId, successorId, type }),
      select: { id: true },
    });
  }

  /**
   * Soft-delete a single cross-plan link — stamp `deletedAt`/`deleteBatchId`/`updatedBy` under a
   * fresh batch id, mirroring the dependency-leaf branch of HierarchyLifecycleService. Guarded on
   * `deletedAt: null` (via `updateMany`) so a concurrent delete of the same row is idempotent.
   * Returns rows changed (0 = already gone).
   */
  async softDelete(
    id: string,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.crossPlanDependency.updateMany({
      where: this.active({ id }),
      data: { deletedAt: new Date(), deleteBatchId: randomUUID(), updatedBy: actorId },
    });
    return result.count;
  }

  /** Shared keyset page (createdAt, id) with the endpoint includes. */
  private page(
    where: Prisma.CrossPlanDependencyWhereInput,
    params: { take: number; cursor?: string },
  ): Promise<CrossPlanDependencyWithEndpoints[]> {
    return this.prisma.crossPlanDependency.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      ...withEndpoints,
    });
  }
}
