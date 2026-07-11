import { ApiProperty } from '@nestjs/swagger';
import type { PlanEditLockActor, PlanEditLockState, PlanEditLockStatus } from '@repo/types';

/** Public profile of a lock holder / requester (never includes credentials). */
export class PlanEditLockActorDto implements PlanEditLockActor {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;
}

const STATES: readonly PlanEditLockState[] = ['FREE', 'HELD_BY_ME', 'HELD_BY_OTHER', 'EXPIRED'];

/**
 * A plan's edit-lock status (ADR-0028). Capability flags are resolved server-side
 * from the caller's permissions AND the current lock state, so the client renders
 * affordances without re-deriving policy. `expiresAt`/`heartbeatAt`/`graceEndsAt`
 * are ISO instants; any client countdown is advisory (the server is authoritative).
 */
export class PlanEditLockStatusDto implements PlanEditLockStatus {
  @ApiProperty()
  planId!: string;

  @ApiProperty({ enum: STATES, description: 'Free, held by me, held by another, or expired.' })
  state!: PlanEditLockState;

  @ApiProperty({ type: PlanEditLockActorDto, nullable: true })
  holder!: PlanEditLockActor | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  heartbeatAt!: string | null;

  @ApiProperty({ type: PlanEditLockActorDto, nullable: true, description: 'Pending peer request.' })
  requestedBy!: PlanEditLockActor | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  graceEndsAt!: string | null;

  @ApiProperty({ description: 'The caller may Start editing now (state free/expired).' })
  canAcquire!: boolean;

  @ApiProperty({ description: 'The caller may request control of a live lock held by another.' })
  canRequest!: boolean;

  @ApiProperty({
    description: 'The caller may take over right now (grace elapsed / holder inactive / admin).',
  })
  canTakeOver!: boolean;

  @ApiProperty({
    description: 'The caller may override immediately, skipping the grace handshake.',
  })
  canOverride!: boolean;

  static from(status: PlanEditLockStatus): PlanEditLockStatusDto {
    return {
      planId: status.planId,
      state: status.state,
      holder: status.holder,
      expiresAt: status.expiresAt,
      heartbeatAt: status.heartbeatAt,
      requestedBy: status.requestedBy,
      graceEndsAt: status.graceEndsAt,
      canAcquire: status.canAcquire,
      canRequest: status.canRequest,
      canTakeOver: status.canTakeOver,
      canOverride: status.canOverride,
    };
  }
}
