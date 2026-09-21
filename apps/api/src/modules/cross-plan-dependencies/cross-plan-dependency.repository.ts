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
 * An active cross-plan edge INTO a plan (its successor is in that plan), with the upstream
 * PREDECESSOR's **placed** dates — the forward (external early start) derivation input
 * (F4, ADR-0045 §2). Dates are `@db.Date` (`Date | null`); the service crosses them to `YYYY-MM-DD`.
 *
 * **It reads `visualEffective*`, and it read `earlyStart`/`earlyFinish` until
 * one-planning-surface M-H.** A programme now interfaces on where the upstream work is **planned
 * to happen**, not on the earliest the network would allow it to — which is the whole point of a
 * planning surface, and it is the answer a downstream planner would give if you asked them when
 * the handover is.
 *
 * **The fields are renamed with the switch rather than left reading `predecessorEarly*`.** A name
 * that says "early" over a column holding placed dates is the silent redefinition this epic
 * refuses everywhere else (it is why a baseline freezes its own criticality rule rather than
 * reinterpreting one), and it is the defect most likely to survive review, because every call site
 * keeps compiling and every test keeps passing while the word stops being true.
 *
 * The **backward** direction is deliberately NOT the mirror of this — see
 * {@link OutgoingCrossPlanEdgeRow}.
 */
export interface IncomingCrossPlanEdgeRow {
  successorId: string;
  type: DependencyType;
  lagMinutes: number;
  predecessorPlacedStart: Date | null;
  predecessorPlacedFinish: Date | null;
}

/**
 * An active cross-plan edge OUT OF a plan (its predecessor is in that plan), with the downstream
 * SUCCESSOR's persisted late dates — the backward (external late finish) derivation input
 * (F4, ADR-0045 §2). Dates are `@db.Date` (`Date | null`); the service crosses them to `YYYY-MM-DD`.
 *
 * **These stay `successorLate*` and must never become a "Placed" variant** (one-planning-surface
 * M-H). The symmetry is tempting and the thing it would name does not exist: a placement is a
 * statement about where work is planned to START, and there is no such thing as a placed LATE
 * finish. The late dates are Pass 1's backward answer — the latest the network tolerates — and a
 * hand-placement is not an input to that question at all.
 *
 * A reader tidying the forward rename into a matching pair would invent a basis with nothing
 * behind it, so `cross-plan-basis.structural.spec.ts` asserts the negative rather than leaving it
 * to a comment.
 */
export interface OutgoingCrossPlanEdgeRow {
  predecessorId: string;
  type: DependencyType;
  lagMinutes: number;
  successorLateStart: Date | null;
  successorLateFinish: Date | null;
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
   * How many active cross-plan edges touch this plan in EITHER direction (predecessor or successor
   * plan). The cheap guard the schedule service reads BEFORE the derivation loads (F4, ADR-0045 §2):
   * 0 ⇒ the plan takes the byte-identical M1-column fast path and neither load below is issued.
   * Org-scoped (defence in depth) and taken inside the recalc transaction snapshot.
   */
  countActiveForPlan(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return db.crossPlanDependency.count({
      where: this.active({
        organizationId,
        OR: [{ predecessorPlanId: planId }, { successorPlanId: planId }],
      }),
    });
  }

  /**
   * The plan's active INCOMING cross-plan edges (successor in this plan) with each upstream
   * PREDECESSOR's persisted PLACED dates (`visualEffective*`, one-planning-surface M-H) — the
   * forward-derivation load (F4, ADR-0045 §2). Only called
   * when {@link countActiveForPlan} is non-zero. Org-scoped (anti-IDOR); no N+1 (dates come via the
   * predecessor include). Served by the (successor_plan_id, …) index.
   */
  async loadIncomingWithPredecessorDates(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<IncomingCrossPlanEdgeRow[]> {
    const rows = await db.crossPlanDependency.findMany({
      where: this.active({ organizationId, successorPlanId: planId }),
      select: {
        successorId: true,
        type: true,
        lagMinutes: true,
        predecessor: { select: { visualEffectiveStart: true, visualEffectiveFinish: true } },
      },
    });
    return rows.map((r) => ({
      successorId: r.successorId,
      type: r.type,
      lagMinutes: r.lagMinutes,
      predecessorPlacedStart: r.predecessor.visualEffectiveStart,
      predecessorPlacedFinish: r.predecessor.visualEffectiveFinish,
    }));
  }

  /**
   * The plan's active OUTGOING cross-plan edges (predecessor in this plan) with each downstream
   * SUCCESSOR's persisted late dates — the backward-derivation load (F4, ADR-0045 §2). Only called
   * when {@link countActiveForPlan} is non-zero. Org-scoped (anti-IDOR); no N+1 (dates come via the
   * successor include).
   */
  async loadOutgoingWithSuccessorDates(
    organizationId: string,
    planId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<OutgoingCrossPlanEdgeRow[]> {
    const rows = await db.crossPlanDependency.findMany({
      where: this.active({ organizationId, predecessorPlanId: planId }),
      select: {
        predecessorId: true,
        type: true,
        lagMinutes: true,
        successor: { select: { lateStart: true, lateFinish: true } },
      },
    });
    return rows.map((r) => ({
      predecessorId: r.predecessorId,
      type: r.type,
      lagMinutes: r.lagMinutes,
      successorLateStart: r.successor.lateStart,
      successorLateFinish: r.successor.lateFinish,
    }));
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
