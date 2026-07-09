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
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
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
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

/**
 * Flat project routes addressed by id: get, update, delete (soft cascade to
 * plans), and restore. Every route resolves the org from `:orgSlug` against the
 * caller's memberships and scopes the project to that org (anti-IDOR). Create
 * and list are nested under the parent client (ClientProjectsController).
 */
@ApiTags('projects')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or project not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/projects', version: '1' })
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get(':projectId')
  @ApiOperation({ summary: 'Get a project by id.' })
  @ApiOkResponse({ type: ProjectResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
  ): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(await this.service.get(principal, orgSlug, projectId));
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Update a project (Planner or Org Admin; optimistic locking).' })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'Stale version, or a name collision within the client.' })
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(await this.service.update(principal, orgSlug, projectId, dto));
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project and its plans (soft cascade).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, projectId);
  }

  @Post(':projectId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a soft-deleted project and everything deleted with it.' })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({ description: 'The parent client is still deleted (restore it first).' })
  async restore(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('projectId', ParseUuidPipe) projectId: string,
  ): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(await this.service.restore(principal, orgSlug, projectId));
  }
}
