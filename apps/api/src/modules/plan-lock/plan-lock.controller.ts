import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
import { ApiLockedResponse } from '../../common/decorators/api-locked-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { AcquireLockDto } from './dto/acquire-lock.dto';
import { PlanEditLockStatusDto } from './dto/plan-edit-lock-status.dto';
import { PlanEditLockService } from './plan-lock.service';

/**
 * Plan edit-lock routes (ADR-0028) — the single-editor "pen". Reads are open to any
 * member (`plan:read`); acquire/heartbeat/release/hand-off need `plan:acquire_lock`;
 * request-control needs `plan:request_control`. Lock-precondition failures return
 * **423 Locked** (distinct from the 409 optimistic conflict), documented on each route.
 */
@ApiTags('plan-edit-lock')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Organisation or plan not found (or not a member).' })
@ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
@Controller({ path: 'organizations/:orgSlug/plans/:planId/edit-lock', version: '1' })
export class PlanLockController {
  constructor(private readonly service: PlanEditLockService) {}

  @Get()
  @ApiOperation({ summary: 'Read the plan’s edit-lock status (any member).' })
  @ApiOkResponse({ type: PlanEditLockStatusDto })
  async status(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanEditLockStatusDto> {
    return PlanEditLockStatusDto.from(await this.service.status(principal, orgSlug, planId));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acquire or take over the edit-lock (Planner or Org Admin).' })
  @ApiOkResponse({
    type: PlanEditLockStatusDto,
    description: 'Acquired / renewed / taken over (an idempotent upsert of the lease, so 200).',
  })
  @ApiLockedResponse('Held by another user and take-over is not (yet) permitted.')
  async acquire(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
    @Body() body: AcquireLockDto,
  ): Promise<PlanEditLockStatusDto> {
    return PlanEditLockStatusDto.from(
      await this.service.acquire(principal, orgSlug, planId, body.takeover ?? false),
    );
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew the holder’s lease (heartbeat).' })
  @ApiOkResponse({
    type: PlanEditLockStatusDto,
    description: 'Lease renewed.',
  })
  @ApiLockedResponse('PLAN_EDIT_LOCK_LOST — the lease was taken over or expired.')
  async heartbeat(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanEditLockStatusDto> {
    return PlanEditLockStatusDto.from(await this.service.heartbeat(principal, orgSlug, planId));
  }

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request control of a live lock held by another (Planner or Org Admin).',
  })
  @ApiOkResponse({
    type: PlanEditLockStatusDto,
    description: 'Records a pending request; no pen transfer. No-op if the lock is free/mine.',
  })
  async request(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanEditLockStatusDto> {
    return PlanEditLockStatusDto.from(await this.service.request(principal, orgSlug, planId));
  }

  @Post('handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hand the pen to the pending requester (holder-initiated).' })
  @ApiOkResponse({ type: PlanEditLockStatusDto })
  @ApiConflictResponse({ description: 'No one has requested control of this plan.' })
  @ApiLockedResponse('PLAN_EDIT_LOCK_LOST — you are no longer the holder.')
  async handoff(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<PlanEditLockStatusDto> {
    return PlanEditLockStatusDto.from(await this.service.handoff(principal, orgSlug, planId));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Release the lock (holder), or force-release it (Org Admin).' })
  @ApiNoContentResponse({ description: 'Released (idempotent).' })
  async release(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('planId', ParseUuidPipe) planId: string,
  ): Promise<void> {
    await this.service.release(principal, orgSlug, planId);
  }
}
