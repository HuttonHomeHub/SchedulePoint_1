import { ApiProperty } from '@nestjs/swagger';
import type { ActivityNoteCount } from '@repo/types';

/**
 * How many active notes an activity carries (ADR-0046) — one row of the batch note-counts read that
 * badges plan rows without an N+1. Only activities with ≥1 active note are returned by the endpoint;
 * an absent id means zero.
 */
export class ActivityNoteCountResponseDto implements ActivityNoteCount {
  @ApiProperty({ format: 'uuid' })
  activityId!: string;

  @ApiProperty({ description: 'The number of active (non-deleted) notes on the activity.' })
  count!: number;

  static from(entry: ActivityNoteCount): ActivityNoteCountResponseDto {
    return { activityId: entry.activityId, count: entry.count };
  }
}
