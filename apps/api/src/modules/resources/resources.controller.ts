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
import { ArchiveActionDto } from '../../common/dto/archive-action.dto';
import { Paginated } from '../../common/dto/paginated';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { CreateResourceDto } from './dto/create-resource.dto';
import { ListResourcesQueryDto } from './dto/list-resources-query.dto';
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
  @ApiOperation({
    summary: "List an organisation's resources (cursor-paginated).",
    description:
      'Returns the flat library by default. `?parentId=<uuid>` narrows to one group’s direct ' +
      'children and `?parentId=null` to top-level rows (ADR-0053 §3); every row carries its own ' +
      '`parentId`, so a client that pages the whole library can nest it without a second endpoint.',
  })
  @ApiOkResponse({ type: ResourceResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: ListResourcesQueryDto,
  ): Promise<Paginated<ResourceResponseDto>> {
    const { items, meta, canReadCost } = await this.service.list(principal, orgSlug, query);
    return new Paginated(
      items.map((resource) => ResourceResponseDto.from(resource, canReadCost)),
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
    const { resource, canReadCost } = await this.service.create(principal, orgSlug, dto);
    return ResourceResponseDto.from(resource, canReadCost);
  }

  @Get(':resourceId')
  @ApiOperation({ summary: 'Get a resource by id.' })
  @ApiOkResponse({ type: ResourceResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('resourceId', ParseUuidPipe) resourceId: string,
  ): Promise<ResourceResponseDto> {
    const { resource, canReadCost } = await this.service.get(principal, orgSlug, resourceId);
    return ResourceResponseDto.from(resource, canReadCost);
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
    const { resource, canReadCost } = await this.service.update(
      principal,
      orgSlug,
      resourceId,
      dto,
    );
    return ResourceResponseDto.from(resource, canReadCost);
  }

  @Post(':resourceId/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archive a resource — retire it from the pickers without deleting it.',
    description:
      'ADR-0053 §4. An archived resource keeps EVERY existing assignment — which still ' +
      'schedules, levels, loads the histogram and earns value identically, including when it ' +
      'is the driving resource of a live activity — and existing assignments stay editable. ' +
      'It is hidden from the default list and from every picker, and only a NEW assignment is ' +
      'refused (422 RESOURCE_ARCHIVED). Archiving is deliberately NOT blocked by use. ' +
      'Archiving a GROUP does not archive its subtree.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({ description: 'No such resource in this organisation.' })
  @ApiConflictResponse({ description: 'Stale `version` — the resource changed elsewhere.' })
  async archive(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('resourceId', ParseUuidPipe) resourceId: string,
    @Body() dto: ArchiveActionDto,
  ): Promise<void> {
    await this.service.setArchived(principal, orgSlug, resourceId, true, dto.version);
  }

  @Post(':resourceId/unarchive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unarchive a resource — return it to the library and the pickers.',
    description:
      'ADR-0053 §4. Clears `archivedAt`. This can never fail on a name/code collision: an ' +
      'archived resource keeps both (the partial uniques are predicated on `deleted_at` ' +
      'alone), so nothing can have taken them meanwhile.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiNotFoundResponse({ description: 'No such resource in this organisation.' })
  @ApiConflictResponse({ description: 'Stale `version` — the resource changed elsewhere.' })
  async unarchive(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('resourceId', ParseUuidPipe) resourceId: string,
    @Body() dto: ArchiveActionDto,
  ): Promise<void> {
    await this.service.setArchived(principal, orgSlug, resourceId, false, dto.version);
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
