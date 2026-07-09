import { Injectable } from '@nestjs/common';
import { Prisma, type Client } from '@prisma/client';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import {
  HIERARCHY_CONFLICT,
  HierarchyLifecycleService,
} from '../../common/hierarchy/hierarchy-lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

import { ClientRepository } from './client.repository';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

/**
 * Business logic for clients — the top level of the Client → Project → Plan
 * hierarchy. Every action re-resolves the org scope from the caller's own
 * memberships (anti-IDOR) and pairs it with a permission check. Deletion cascades
 * (soft) to the client's projects and plans; restore brings the batch back.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly clients: ClientRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ClientsService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Client[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'client:read', organization.id);

    const rows = await this.clients.findManyActiveByOrg({
      organizationId: organization.id,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async get(principal: Principal, orgSlug: string, clientId: string): Promise<Client> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'client:read', organization.id);

    const client = await this.clients.findActiveByIdInOrg(clientId, organization.id);
    if (!client) throw new NotFoundError('Client not found.');
    return client;
  }

  async create(principal: Principal, orgSlug: string, dto: CreateClientDto): Promise<Client> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'client:create', organization.id);

    try {
      const client = await this.clients.create({
        organizationId: organization.id,
        name: dto.name,
        description: dto.description ?? null,
        createdBy: principal.userId,
        updatedBy: principal.userId,
      });
      this.logger.info(
        { organizationId: organization.id, clientId: client.id, userId: principal.userId },
        'client created',
      );
      return client;
    } catch (error) {
      if (this.isNameConflict(error)) throw this.nameTakenError();
      throw error;
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    clientId: string,
    dto: UpdateClientDto,
  ): Promise<Client> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'client:update', organization.id);

    if (!(await this.clients.findActiveByIdInOrg(clientId, organization.id))) {
      throw new NotFoundError('Client not found.');
    }

    const patch: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;

    try {
      const changed = await this.clients.updateIfVersionMatches(
        clientId,
        dto.version,
        patch,
        principal.userId,
      );
      if (changed === 0) {
        throw new ConflictError('This client was changed elsewhere. Refresh and try again.');
      }
    } catch (error) {
      if (this.isNameConflict(error)) throw this.nameTakenError();
      throw error;
    }

    const updated = await this.clients.findActiveByIdInOrg(clientId, organization.id);
    if (!updated) throw new NotFoundError('Client not found.');
    return updated;
  }

  async remove(principal: Principal, orgSlug: string, clientId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'client:delete', organization.id);

    if (!(await this.clients.findActiveByIdInOrg(clientId, organization.id))) {
      throw new NotFoundError('Client not found.');
    }

    const result = await this.prisma.$transaction((tx) =>
      this.lifecycle.cascadeSoftDelete(tx, 'client', clientId, principal.userId),
    );
    this.logger.info(
      {
        organizationId: organization.id,
        clientId,
        userId: principal.userId,
        counts: result.counts,
      },
      'client deleted (cascade)',
    );
  }

  async restore(principal: Principal, orgSlug: string, clientId: string): Promise<Client> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'client:restore', organization.id);

    const existing = await this.clients.findByIdInOrg(clientId, organization.id);
    if (!existing) throw new NotFoundError('Client not found.');
    if (!existing.deletedAt) return existing; // already active — restore is a no-op

    await this.prisma.$transaction((tx) =>
      this.lifecycle.restoreBatch(tx, 'client', clientId, principal.userId),
    );
    this.logger.info(
      { organizationId: organization.id, clientId, userId: principal.userId },
      'client restored (cascade)',
    );

    const restored = await this.clients.findActiveByIdInOrg(clientId, organization.id);
    if (!restored) throw new NotFoundError('Client not found.');
    return restored;
  }

  /** A Prisma unique-violation from the partial name-per-org index. */
  private isNameConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private nameTakenError(): ConflictError {
    return new ConflictError('A client with this name already exists.', {
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
