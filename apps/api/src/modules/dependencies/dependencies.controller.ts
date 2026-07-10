import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
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

import { DependenciesService } from './dependencies.service';
import { DependencyResponseDto } from './dto/dependency-response.dto';
import { UpdateDependencyDto } from './dto/update-dependency.dto';

/**
 * Flat dependency routes addressed by id: get, update (type/lag only), and delete
 * (soft). Every route resolves the org from `:orgSlug` against the caller's
 * memberships and scopes the dependency to that org (anti-IDOR). Create and the
 * direction lists live on the nested controllers. A deleted link has no restore
 * endpoint in this slice — links come back with their activity/plan's batch.
 */
@ApiTags('dependencies')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or dependency not found (or the caller is not a member).',
})
@Controller({ path: 'organizations/:orgSlug/dependencies', version: '1' })
export class DependenciesController {
  constructor(private readonly service: DependenciesService) {}

  @Get(':dependencyId')
  @ApiOperation({ summary: 'Get a dependency by id.' })
  @ApiOkResponse({ type: DependencyResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('dependencyId', ParseUuidPipe) dependencyId: string,
  ): Promise<DependencyResponseDto> {
    return DependencyResponseDto.from(await this.service.get(principal, orgSlug, dependencyId));
  }

  @Patch(':dependencyId')
  @ApiOperation({
    summary: 'Update a dependency (type/lag; Planner or Org Admin; optimistic locking).',
  })
  @ApiOkResponse({ type: DependencyResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiConflictResponse({
    description: 'Stale version, or the new type duplicates an existing link.',
  })
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('dependencyId', ParseUuidPipe) dependencyId: string,
    @Body() dto: UpdateDependencyDto,
  ): Promise<DependencyResponseDto> {
    return DependencyResponseDto.from(
      await this.service.update(principal, orgSlug, dependencyId, dto),
    );
  }

  @Delete(':dependencyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a dependency (soft).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('dependencyId', ParseUuidPipe) dependencyId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, dependencyId);
  }
}
