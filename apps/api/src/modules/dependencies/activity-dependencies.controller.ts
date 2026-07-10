import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
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

import { DependenciesService } from './dependencies.service';
import { DependencyResponseDto } from './dto/dependency-response.dto';

/**
 * An activity's logic, split by direction: its **predecessors** (links where it is
 * the successor — what must come before it) and its **successors** (links where it
 * is the predecessor — what it drives). The activity is resolved active and in-org
 * first (404 otherwise). Both are read-only; create/update/delete live on the
 * plan- and id-addressed controllers.
 */
@ApiTags('dependencies')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or activity not found (or not a member).' })
@Controller({ path: 'organizations/:orgSlug/activities/:activityId', version: '1' })
export class ActivityDependenciesController {
  constructor(private readonly service: DependenciesService) {}

  @Get('predecessors')
  @ApiOperation({ summary: "List an activity's predecessors (cursor-paginated)." })
  @ApiOkResponse({ type: DependencyResponseDto, isArray: true })
  async predecessors(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<DependencyResponseDto>> {
    const { items, meta } = await this.service.listPredecessors(
      principal,
      orgSlug,
      activityId,
      query,
    );
    return new Paginated(
      items.map((dependency) => DependencyResponseDto.from(dependency)),
      meta,
    );
  }

  @Get('successors')
  @ApiOperation({ summary: "List an activity's successors (cursor-paginated)." })
  @ApiOkResponse({ type: DependencyResponseDto, isArray: true })
  async successors(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<DependencyResponseDto>> {
    const { items, meta } = await this.service.listSuccessors(
      principal,
      orgSlug,
      activityId,
      query,
    );
    return new Paginated(
      items.map((dependency) => DependencyResponseDto.from(dependency)),
      meta,
    );
  }
}
