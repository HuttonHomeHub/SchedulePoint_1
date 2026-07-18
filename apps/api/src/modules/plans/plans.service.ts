import { Injectable } from '@nestjs/common';
import { Prisma, type Plan } from '@prisma/client';
import { STANDARD_CALENDAR_NAME, type PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireCalendarWriteLock } from '../../common/db/calendar-advisory-lock';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import {
  HIERARCHY_CONFLICT,
  HierarchyLifecycleService,
} from '../../common/hierarchy/hierarchy-lifecycle.service';
import { parseCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarRepository } from '../calendars/calendar.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { ProjectRepository } from '../projects/project.repository';

import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanRepository, type PlanPatch } from './plan.repository';

/**
 * Business logic for plans — the leaf level of the Client → Project → Plan
 * hierarchy and the future host of activities and the TSLD. Create and list are
 * scoped to a parent project (loaded active and in-org first, 404 otherwise);
 * the organisation id is copied from that parent, never from input. Item
 * operations re-resolve the org scope from the caller's own memberships
 * (anti-IDOR) paired with a permission check. A plan has no children, so delete
 * is a plain soft-delete; restore requires the parent project to be active.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectRepository,
    private readonly plans: PlanRepository,
    private readonly calendars: CalendarRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(PlansService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Plan[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:read', organization.id);
    await this.loadActiveProject(projectId, organization.id);

    const rows = await this.plans.findManyActiveByProject({
      organizationId: organization.id,
      projectId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async get(principal: Principal, orgSlug: string, planId: string): Promise<Plan> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  async create(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    dto: CreatePlanDto,
  ): Promise<Plan> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:create', organization.id);
    const project = await this.loadActiveProject(projectId, organization.id);

    // New plans default to the org's seeded Standard calendar (ADR-0024). If the org
    // has no active Standard (renamed/deleted), fall back to null (all-days-work).
    const standard = await this.calendars.findActiveByNameInOrg(
      project.organizationId,
      STANDARD_CALENDAR_NAME,
    );

    try {
      const plan = await this.plans.create({
        // Copy the organisation id from the parent project, never from input.
        organizationId: project.organizationId,
        projectId: project.id,
        name: dto.name,
        description: dto.description ?? null,
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.schedulingMode ? { schedulingMode: dto.schedulingMode } : {}),
        // Required (ADR-0033 M1): the DTO guarantees a valid calendar date.
        plannedStart: parseCalendarDate(dto.plannedStart),
        ...(standard ? { calendarId: standard.id } : {}),
        createdBy: principal.userId,
        updatedBy: principal.userId,
      });
      this.logger.info(
        {
          organizationId: organization.id,
          projectId: project.id,
          planId: plan.id,
          userId: principal.userId,
        },
        'plan created',
      );
      return plan;
    } catch (error) {
      if (this.isNameConflict(error)) throw this.nameTakenError();
      throw error;
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: UpdatePlanDto,
  ): Promise<Plan> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:update', organization.id);

    if (!(await this.plans.findActiveByIdInOrg(planId, organization.id))) {
      throw new NotFoundError('Plan not found.');
    }

    const patch: PlanPatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.schedulingMode !== undefined) patch.schedulingMode = dto.schedulingMode;
    if (dto.progressRecalcMode !== undefined) patch.progressRecalcMode = dto.progressRecalcMode;
    if (dto.useExpectedFinishDates !== undefined) {
      patch.useExpectedFinishDates = dto.useExpectedFinishDates;
    }
    if (dto.criticalPathDefinition !== undefined) {
      patch.criticalPathDefinition = dto.criticalPathDefinition;
    }
    if (dto.criticalFloatThreshold !== undefined) {
      patch.criticalFloatThreshold = dto.criticalFloatThreshold;
    }
    if (dto.totalFloatMode !== undefined) patch.totalFloatMode = dto.totalFloatMode;
    if (dto.makeOpenEndsCritical !== undefined) {
      patch.makeOpenEndsCritical = dto.makeOpenEndsCritical;
    }
    // Resource-levelling plan options (ADR-0041 §7/§4): client-settable; dark until L2 wires the pass.
    if (dto.levelResources !== undefined) patch.levelResources = dto.levelResources;
    if (dto.levelWithinFloatOnly !== undefined) {
      patch.levelWithinFloatOnly = dto.levelWithinFloatOnly;
    }
    // Ignore external / inter-project relationships (ADR-0043 / ADR-0035 §30.4): client-settable
    // scheduling option; the recalc drops external bounds when on. Default false is byte-parity.
    if (dto.ignoreExternalRelationships !== undefined) {
      patch.ignoreExternalRelationships = dto.ignoreExternalRelationships;
    }
    // Earned-Value plan options (EV1, ADR-0042): client-settable passthrough; currencyCode null clears
    // to inherit the org default. Dark until the EV read (EV2b); nothing computes EV yet.
    if (dto.eacMethod !== undefined) patch.eacMethod = dto.eacMethod;
    if (dto.currencyCode !== undefined) patch.currencyCode = dto.currencyCode;
    // May be moved, never cleared (ADR-0033 M1): the DTO rejects an explicit null, so a
    // defined value is always a valid calendar date.
    if (dto.plannedStart !== undefined) {
      patch.plannedStart = parseCalendarDate(dto.plannedStart);
    }
    // A null clears the calendar (all-days-work); a specific id is validated + written
    // under a calendar-scoped advisory lock below.
    const calendarId = dto.calendarId;
    if (calendarId === null) patch.calendarId = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (calendarId !== undefined && calendarId !== null) {
          // Assigning a specific calendar: serialise with the delete-in-use guard on
          // the same key so a plan can never be assigned a calendar that is being
          // deleted (no TOCTOU dangling reference). Only an ACTIVE calendar in the
          // plan's OWN organisation may be referenced (anti-IDOR); a foreign/deleted/
          // unknown id is indistinguishable from missing (404), leaking nothing —
          // matching the dependencies endpoint's cross-scope handling.
          await acquireCalendarWriteLock(tx, calendarId);
          const calendar = await this.calendars.findActiveByIdInOrg(
            calendarId,
            organization.id,
            tx,
          );
          if (!calendar) throw new NotFoundError('Calendar not found.');
          patch.calendarId = calendar.id;
        }
        const changed = await this.plans.updateIfVersionMatches(
          planId,
          dto.version,
          patch,
          principal.userId,
          tx,
        );
        if (changed === 0) {
          throw new ConflictError('This plan was changed elsewhere. Refresh and try again.');
        }
      });
    } catch (error) {
      if (this.isNameConflict(error)) throw this.nameTakenError();
      throw error;
    }

    const updated = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!updated) throw new NotFoundError('Plan not found.');
    return updated;
  }

  async remove(principal: Principal, orgSlug: string, planId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:delete', organization.id);

    if (!(await this.plans.findActiveByIdInOrg(planId, organization.id))) {
      throw new NotFoundError('Plan not found.');
    }

    await this.prisma.$transaction((tx) =>
      this.lifecycle.cascadeSoftDelete(tx, 'plan', planId, principal.userId),
    );
    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId },
      'plan deleted',
    );
  }

  async restore(principal: Principal, orgSlug: string, planId: string): Promise<Plan> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:restore', organization.id);

    const existing = await this.plans.findByIdInOrg(planId, organization.id);
    if (!existing) throw new NotFoundError('Plan not found.');
    if (!existing.deletedAt) return existing; // already active — restore is a no-op

    // The lifecycle enforces the top-down invariant: restoring a plan whose
    // parent project is still soft-deleted raises PARENT_DELETED (→ 409).
    await this.prisma.$transaction((tx) =>
      this.lifecycle.restoreBatch(tx, 'plan', planId, principal.userId),
    );
    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId },
      'plan restored',
    );

    const restored = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!restored) throw new NotFoundError('Plan not found.');
    return restored;
  }

  /** Load the parent project active and in the caller's org, or 404. */
  private async loadActiveProject(projectId: string, organizationId: string) {
    const project = await this.projects.findActiveByIdInOrg(projectId, organizationId);
    if (!project) throw new NotFoundError('Project not found.');
    return project;
  }

  /** A Prisma unique-violation from the partial name-per-project index. */
  private isNameConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private nameTakenError(): ConflictError {
    return new ConflictError('A plan with this name already exists for this project.', {
      reason: HIERARCHY_CONFLICT.NAME_TAKEN,
    });
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
