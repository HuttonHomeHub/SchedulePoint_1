import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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

import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { ProjectsService } from './projects.service';

/**
 * Project routes nested under a parent client: create and list. The parent
 * client is resolved active and in-org first (404 otherwise), so a foreign or
 * soft-deleted client is indistinguishable from a missing one. Item operations
 * (get/update/delete/restore) live on the flat ProjectsController.
 */
@ApiTags('projects')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or client not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/clients/:clientId/projects', version: '1' })
export class ClientProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "List a client's projects (cursor-paginated)." })
  @ApiOkResponse({ type: ProjectResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('clientId', ParseUuidPipe) clientId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ProjectResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, clientId, query);
    return new Paginated(
      items.map((project) => ProjectResponseDto.from(project)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a project under a client (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'A project with this name already exists for this client.' })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('clientId', ParseUuidPipe) clientId: string,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(await this.service.create(principal, orgSlug, clientId, dto));
  }
}
