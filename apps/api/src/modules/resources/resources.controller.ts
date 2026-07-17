import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CreateResourceDto } from './dto/create-resource.dto';
import { ResourceResponseDto } from './dto/resource-response.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ResourcesService } from './resources.service';

/**
 * Org-scoped resource library HTTP surface (ADR-0039), nested under the organisation
 * scope. Every route resolves the org from `:orgSlug` against the caller's memberships
 * (404 for non-members). Reading is open to any member; create/update/delete are
 * Planner + Org Admin. Delete is a soft delete guarded by RESOURCE_IN_USE.
 */
@ApiTags('resources')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or resource not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/resources', version: '1' })
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}

  @Get()
  @ApiOperation({ summary: "List an organisation's resources (cursor-paginated)." })
  @ApiOkResponse({ type: ResourceResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ResourceResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, query);
    return new Paginated(
      items.map((resource) => ResourceResponseDto.from(resource)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a resource (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: ResourceResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({ description: 'The calendarId is not an active calendar in this org.' })
  @ApiConflictResponse({ description: 'A resource with this name or code already exists.' })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Body() dto: CreateResourceDto,
  ): Promise<ResourceResponseDto> {
    return ResourceResponseDto.from(await this.service.create(principal, orgSlug, dto));
  }

  @Get(':resourceId')
  @ApiOperation({ summary: 'Get a resource by id.' })
  @ApiOkResponse({ type: ResourceResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('resourceId', ParseUuidPipe) resourceId: string,
  ): Promise<ResourceResponseDto> {
    return ResourceResponseDto.from(await this.service.get(principal, orgSlug, resourceId));
  }

  @Patch(':resourceId')
  @ApiOperation({ summary: 'Update a resource (Planner or Org Admin; optimistic locking).' })
  @ApiOkResponse({ type: ResourceResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({ description: 'The calendarId is not an active calendar in this org.' })
  @ApiConflictResponse({ description: 'Stale version, or a name/code collision.' })
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('resourceId', ParseUuidPipe) resourceId: string,
    @Body() dto: UpdateResourceDto,
  ): Promise<ResourceResponseDto> {
    return ResourceResponseDto.from(await this.service.update(principal, orgSlug, resourceId, dto));
  }

  @Delete(':resourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a resource (soft delete; Planner or Org Admin).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'The resource is assigned to an active activity (RESOURCE_IN_USE).',
  })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('resourceId', ParseUuidPipe) resourceId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, resourceId);
  }
}
