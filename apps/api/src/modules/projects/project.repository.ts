import { Injectable } from '@nestjs/common';
import { Prisma, type Project } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data-access for projects (ADR-0008). Centralises the soft-delete filter so no
 * read forgets `deletedAt: null`. Item lookups are scoped by organisation
 * (anti-IDOR); the list is scoped by both organisation and parent client.
 * Delete/restore are handled by the shared HierarchyLifecycleService (cascade),
 * so this repository only covers create/read/update.
 */
@Injectable()
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  private active(where: Prisma.ProjectWhereInput = {}): Prisma.ProjectWhereInput {
    return { ...where, deletedAt: null };
  }

  create(
    data: Prisma.ProjectUncheckedCreateInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Project> {
    return db.project.create({ data });
  }

  /** An active project scoped to its organisation (anti-IDOR). */
  findActiveByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Project | null> {
    return db.project.findFirst({ where: this.active({ id, organizationId }) });
  }

  /**
   * Active plans directly under one project.
   *
   * The reasoning — why no index is added, why `organizationId` must not appear in the predicate,
   * and why these are two methods rather than one — is in `client.repository.ts`'s
   * `countActiveProjects` docblock, which is the sibling of this pair. One copy, because two would
   * drift and only a reader comparing them would ever see it.
   *
   * Served by `uq_plans_project_name`.
   */
  countActivePlans(projectId: string): Promise<number> {
    return this.prisma.plan.count({ where: { projectId, deletedAt: null } });
  }

  /**
   * Active activities across this project's plans — a two-level count.
   *
   * **The only unbounded count of the four**, which is why the caller settles it independently
   * rather than treating a failure as impossible: a project can hold 120,000 activities, and a
   * statement timeout here is a real state the other three are not in. Measured at that size,
   * 39.9 ms; 6.78 ms at 20,000.
   *
   * **Its cost is partly a function of how recently the project was recalculated**, which is not
   * obvious and is worth knowing before anyone quotes a figure. The plan is an `Index Only Scan` on
   * `idx_activities_plan_updated_at`, so its real cost depends on the visibility map — and ADR-0144
   * measured that decaying on `activities` specifically (300 plans dirtied gave 130,380 heap
   * fetches and 188 ms), because **every recalculation rewrites every activity row in a plan**.
   *
   * It counts EVERY activity row — WBS summaries, levels of effort and milestones as well as tasks
   * — which is said aloud in the DTO and on the screen. `docs/TEST_PLAYBOOK.md` records a shipped
   * incident (health metric 10) where a denominator silently included summaries.
   */
  countActiveActivities(projectId: string): Promise<number> {
    return this.prisma.activity.count({
      where: { deletedAt: null, plan: { projectId, deletedAt: null } },
    });
  }

  /** A project in an organisation in ANY state (active or soft-deleted) — used to
   * scope a restore to the caller's org before reactivating it. */
  findByIdInOrg(
    id: string,
    organizationId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Project | null> {
    return db.project.findFirst({ where: { id, organizationId } });
  }

  /** A page of a client's active projects (keyset cursor by id). */
  findManyActiveByClient(params: {
    organizationId: string;
    clientId: string;
    take: number;
    cursor?: string;
  }): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: this.active({ organizationId: params.organizationId, clientId: params.clientId }),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.take,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Optimistic-locked update: only touches the active row if its version still
   * matches. Returns rows changed — `0` means a version conflict or the row is
   * gone, which the service maps to 409.
   */
  async updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: { name?: string; description?: string | null },
    updatedBy: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const result = await db.project.updateMany({
      where: this.active({ id, version: expectedVersion }),
      data: { ...patch, updatedBy, version: { increment: 1 } },
    });
    return result.count;
  }
}
