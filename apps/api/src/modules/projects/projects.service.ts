import { Injectable } from '@nestjs/common';
import { Prisma, type Project } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import {
  HIERARCHY_CONFLICT,
  HierarchyLifecycleService,
} from '../../common/hierarchy/hierarchy-lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hierarchyAuditEvent } from '../audit/hierarchy-audit';
import { ClientRepository } from '../clients/client.repository';
import { OrganizationsService } from '../organizations/organizations.service';

import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectRepository } from './project.repository';

/**
 * Business logic for projects — the middle level of the Client → Project → Plan
 * hierarchy. Create and list are scoped to a parent client (loaded active and
 * in-org first, 404 otherwise); the organisation id is copied from that parent,
 * never from input. Item operations re-resolve the org scope from the caller's
 * own memberships (anti-IDOR) paired with a permission check. Deletion cascades
 * (soft) to the project's plans; restore brings the batch back and requires the
 * parent client to be active.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly clients: ClientRepository,
    private readonly projects: ProjectRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectPinoLogger(ProjectsService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    clientId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Project[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'project:read', organization.id);
    await this.loadActiveClient(clientId, organization.id);

    const rows = await this.projects.findManyActiveByClient({
      organizationId: organization.id,
      clientId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async get(principal: Principal, orgSlug: string, projectId: string): Promise<Project> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'project:read', organization.id);

    const project = await this.projects.findActiveByIdInOrg(projectId, organization.id);
    if (!project) throw new NotFoundError('Project not found.');
    return project;
  }

  async create(
    principal: Principal,
    orgSlug: string,
    clientId: string,
    dto: CreateProjectDto,
  ): Promise<Project> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'project:create', organization.id);
    const client = await this.loadActiveClient(clientId, organization.id);

    try {
      const project = await this.projects.create({
        // Copy the organisation id from the parent client, never from input.
        organizationId: client.organizationId,
        clientId: client.id,
        name: dto.name,
        description: dto.description ?? null,
        createdBy: principal.userId,
        updatedBy: principal.userId,
      });
      this.logger.info(
        {
          organizationId: organization.id,
          clientId: client.id,
          projectId: project.id,
          userId: principal.userId,
        },
        'project created',
      );
      return project;
    } catch (error) {
      if (this.isNameConflict(error)) throw this.nameTakenError();
      throw error;
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<Project> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'project:update', organization.id);

    if (!(await this.projects.findActiveByIdInOrg(projectId, organization.id))) {
      throw new NotFoundError('Project not found.');
    }

    const patch: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;

    try {
      const changed = await this.projects.updateIfVersionMatches(
        projectId,
        dto.version,
        patch,
        principal.userId,
      );
      if (changed === 0) {
        throw new ConflictError('This project was changed elsewhere. Refresh and try again.');
      }
    } catch (error) {
      if (this.isNameConflict(error)) throw this.nameTakenError();
      throw error;
    }

    const updated = await this.projects.findActiveByIdInOrg(projectId, organization.id);
    if (!updated) throw new NotFoundError('Project not found.');
    return updated;
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    context?: RequestContext,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'project:delete', organization.id);

    const existing = await this.projects.findActiveByIdInOrg(projectId, organization.id);
    if (!existing) throw new NotFoundError('Project not found.');

    const result = await this.prisma.$transaction(async (tx) => {
      const cascade = await this.lifecycle.cascadeSoftDelete(
        tx,
        'project',
        projectId,
        principal.userId,
      );
      // Inside the cascade's own transaction, and carrying its batch id: a reader seeing forty
      // rows vanish needs to know that was one action and not forty. A failed audit write rolls
      // the whole cascade back, which is the trade ADR-0072 chose deliberately.
      await this.audit.record(
        hierarchyAuditEvent({
          entity: 'project',
          kind: 'deleted',
          organizationId: organization.id,
          id: projectId,
          name: existing.name,
          deleteBatchId: cascade.batchId,
          principal,
          context,
        }),
        tx,
      );
      return cascade;
    });
    this.logger.info(
      {
        organizationId: organization.id,
        projectId,
        userId: principal.userId,
        counts: result.counts,
      },
      'project deleted (cascade)',
    );
  }

  async restore(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    context?: RequestContext,
  ): Promise<Project> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'project:restore', organization.id);

    const existing = await this.projects.findByIdInOrg(projectId, organization.id);
    if (!existing) throw new NotFoundError('Project not found.');
    if (!existing.deletedAt) return existing; // already active — restore is a no-op

    // The lifecycle enforces the top-down invariant: restoring a project whose
    // parent client is still soft-deleted raises PARENT_DELETED (→ 409).
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.restoreBatch(tx, 'project', projectId, principal.userId);
      // `existing.deleteBatchId` is read before the transaction, and that is safe here in a way
      // it is NOT in MembersService.changeRole: `restoreBatch` re-reads the root inside the
      // transaction and throws unless it is still soft-deleted, so a stale read cannot survive
      // to be recorded — the audit row is never written for a restore that did not happen.
      await this.audit.record(
        hierarchyAuditEvent({
          entity: 'project',
          kind: 'restored',
          organizationId: organization.id,
          id: projectId,
          name: existing.name,

          deleteBatchId: existing.deleteBatchId,
          principal,
          context,
        }),
        tx,
      );
    });
    this.logger.info(
      { organizationId: organization.id, projectId, userId: principal.userId },
      'project restored (cascade)',
    );

    const restored = await this.projects.findActiveByIdInOrg(projectId, organization.id);
    if (!restored) throw new NotFoundError('Project not found.');
    return restored;
  }

  /** Load the parent client active and in the caller's org, or 404. */
  private async loadActiveClient(clientId: string, organizationId: string) {
    const client = await this.clients.findActiveByIdInOrg(clientId, organizationId);
    if (!client) throw new NotFoundError('Client not found.');
    return client;
  }

  /** A Prisma unique-violation from the partial name-per-client index. */
  private isNameConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private nameTakenError(): ConflictError {
    return new ConflictError('A project with this name already exists for this client.', {
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
