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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ResourceAssignmentResponseDto } from './dto/assignment-response.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { ResourceAssignmentService } from './resource-assignment.service';

/**
 * Resource-assignment HTTP surface (ADR-0039). Assignments are activity-scoped: creating
 * and listing hang off `activities/:activityId/assignments`, while updating and unassigning
 * address the assignment directly at `assignments/:id`. Every route resolves the org from
 * `:orgSlug` against the caller's memberships (404 for non-members). Reading is open to any
 * member; assign/update/unassign are Planner + Org Admin (`resource:assign`).
 */
@ApiTags('resource-assignments')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation, activity, resource or assignment not found (or not a member).',
})
@Controller({ path: 'organizations/:orgSlug', version: '1' })
export class ResourceAssignmentsController {
  constructor(private readonly service: ResourceAssignmentService) {}

  @Get('activities/:activityId/assignments')
  @ApiOperation({
    summary: "List an activity's active resource assignments.",
    description:
      'Returns the full set of active assignments for one activity — deliberately unpaginated. ' +
      'The result is bounded by the number of resources a single activity can carry (a handful in ' +
      'practice), the same bounded-list exemption the per-plan dependency and baseline lists use, so ' +
      'no cursor/limit is needed. Assignments across the whole org are never listed in one call.',
  })
  @ApiOkResponse({ type: ResourceAssignmentResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
  ): Promise<ResourceAssignmentResponseDto[]> {
    const rows = await this.service.list(principal, orgSlug, activityId);
    return rows.map((row) => ResourceAssignmentResponseDto.from(row));
  }

  @Post('activities/:activityId/assignments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a resource to an activity (Planner or Org Admin).',
    description:
      'Duration-type side effect (ADR-0040): when this is the DRIVING assignment, carries a ' +
      '`unitsPerHour`, and names an `editedField` (UNITS | UNITS_PER_HOUR), the triad ' +
      '`Units = Duration × Units/Time` is resolved — and for a FIXED_UNITS / FIXED_UNITS_TIME ' +
      'activity the derived `durationMinutes` is persisted on the OWNING ACTIVITY in the same ' +
      'transaction (bumping its version). Refetch the activity if you hold it. Inert (a plain store) ' +
      'for a non-driving assignment, no rate, or no `editedField`.',
  })
  @ApiCreatedResponse({ type: ResourceAssignmentResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Negative budgetedUnits / unitsPerHour (N14/N19), a zero unitsPerHour on a units-driven ' +
      'duration recompute (N20, UNITS_PER_HOUR_ZERO), or a MATERIAL resource set as the driver.',
  })
  @ApiConflictResponse({
    description:
      'This resource is already assigned to this activity, or a stale version of the owning activity ' +
      'when a units/rate edit recomputes its duration.',
  })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('activityId', ParseUuidPipe) activityId: string,
    @Body() dto: CreateAssignmentDto,
  ): Promise<ResourceAssignmentResponseDto> {
    return ResourceAssignmentResponseDto.from(
      await this.service.create(principal, orgSlug, activityId, dto),
    );
  }

  @Patch('assignments/:id')
  @ApiOperation({
    summary:
      'Update an assignment (units / rate / driver; Planner or Org Admin; optimistic locking).',
    description:
      'Duration-type side effect (ADR-0040): editing a DRIVING assignment’s units/rate with an ' +
      '`editedField` recomputes the triad; for a FIXED_UNITS / FIXED_UNITS_TIME activity the derived ' +
      '`durationMinutes` is persisted on the OWNING ACTIVITY in the same transaction (bumping its ' +
      'version) — refetch it if you hold it. Inert for a non-driving assignment, no rate, or no ' +
      '`editedField`.',
  })
  @ApiOkResponse({ type: ResourceAssignmentResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Negative budgetedUnits / unitsPerHour (N14/N19), or a zero unitsPerHour on a units-driven ' +
      'duration recompute (N20, UNITS_PER_HOUR_ZERO).',
  })
  @ApiConflictResponse({
    description:
      'Stale version of the assignment, or of the owning activity when a units/rate edit recomputes ' +
      'its duration.',
  })
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ): Promise<ResourceAssignmentResponseDto> {
    return ResourceAssignmentResponseDto.from(
      await this.service.update(principal, orgSlug, id, dto),
    );
  }

  @Delete('assignments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unassign a resource from an activity (soft delete).' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, id);
  }
}
