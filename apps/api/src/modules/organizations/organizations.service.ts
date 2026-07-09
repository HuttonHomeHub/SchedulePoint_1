import { Injectable } from '@nestjs/common';
import { Prisma, type Organization } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { OrganizationRole, type Principal } from '../../common/auth/principal';
import { ConflictError, NotFoundError } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';

import type { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrgMemberRepository } from './org-member.repository';
import { OrganizationRepository } from './organization.repository';
import { slugify } from './slug';

/** An organisation paired with the requesting principal's role in it. */
export interface ScopedOrganization {
  organization: Organization;
  role: OrganizationRole;
}

const MAX_SLUG_ATTEMPTS = 6;

/**
 * Business logic for organisations. Creating an organisation makes the creator
 * its Org Admin (atomically). Listing returns only the caller's organisations,
 * and {@link resolveScope} is the reusable org-scope resolver that every
 * `:orgSlug` route uses — it 404s for non-members (anti-enumeration; ADR-0012).
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly members: OrgMemberRepository,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(OrganizationsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Create an organisation and make the caller its Org Admin, in one transaction.
   * `organization:create` is a non-scoped capability (any authenticated user).
   * Retries with a numeric suffix if the derived slug collides under concurrency.
   */
  async create(principal: Principal, dto: CreateOrganizationDto): Promise<ScopedOrganization> {
    const base = slugify(dto.name);

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        const organization = await this.prisma.$transaction(async (tx) => {
          const created = await this.organizations.create(
            {
              name: dto.name,
              slug,
              createdBy: principal.userId,
              updatedBy: principal.userId,
            },
            tx,
          );
          await this.members.create(
            {
              organizationId: created.id,
              userId: principal.userId,
              // Prisma's enum field is a string-literal union; the TS enum value
              // matches but is a distinct nominal type, so use the literal here.
              role: 'ORG_ADMIN',
              createdBy: principal.userId,
              updatedBy: principal.userId,
            },
            tx,
          );
          return created;
        });

        this.logger.info(
          { organizationId: organization.id, slug, userId: principal.userId },
          'organization created',
        );
        return { organization, role: OrganizationRole.ORG_ADMIN };
      } catch (error) {
        if (this.isUniqueViolation(error)) continue; // slug taken → try the next suffix
        throw error;
      }
    }

    throw new ConflictError('Could not allocate a unique name for this organisation.');
  }

  /** The caller's organisations, each with their role. */
  async list(principal: Principal): Promise<ScopedOrganization[]> {
    const roleByOrg = new Map(principal.memberships.map((m) => [m.organizationId, m.role]));
    if (roleByOrg.size === 0) return [];

    const organizations = await this.organizations.findManyActiveByIds([...roleByOrg.keys()]);
    return organizations
      .filter((organization) => roleByOrg.has(organization.id))
      .map((organization) => ({ organization, role: roleByOrg.get(organization.id)! }));
  }

  /**
   * Resolve an organisation by slug for the requesting principal. Returns the
   * organisation and the caller's role, or throws {@link NotFoundError} if the
   * organisation does not exist OR the caller is not a member — the two are
   * indistinguishable to the client so slugs cannot be enumerated.
   */
  async resolveScope(principal: Principal, slug: string): Promise<ScopedOrganization> {
    const organization = await this.organizations.findActiveBySlug(slug);
    const membership = organization
      ? principal.memberships.find((m) => m.organizationId === organization.id)
      : undefined;

    if (!organization || !membership) {
      throw new NotFoundError('Organisation not found.');
    }
    return { organization, role: membership.role };
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
